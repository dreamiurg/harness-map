#!/usr/bin/env node
// scan.mjs — deterministic discovery of AI-harness surfaces.
// Usage: node scan.mjs --repo <path> --out <dir>
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, resolve, basename } from "node:path";

// ---------- CLI ----------
const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
}
const repo = resolve(arg("--repo", "."));
const outDir = resolve(arg("--out", join(repo, "harness-map-work")));
mkdirSync(outDir, { recursive: true });

// ---------- helpers ----------
function stripQuotes(s) {
  const t = s.trim();
  return (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))
    ? t.slice(1, -1)
    : t;
}

// Minimal YAML-frontmatter subset: `key: value` lines with folded continuations.
export function parseFrontmatter(text) {
  if (!text.startsWith("---")) return { attrs: {}, body: text };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { attrs: {}, body: text };
  const attrs = {};
  let key = null;
  for (const line of text.slice(text.indexOf("\n") + 1, end).split("\n")) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m) {
      key = m[1];
      attrs[key] = stripQuotes(m[2]);
    } else if (key && /^\s+\S/.test(line)) {
      attrs[key] = (attrs[key] + " " + line.trim()).trim();
    }
  }
  return { attrs, body: text.slice(end + 4) };
}

function git(...a) {
  return execFileSync("git", ["-C", repo, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function gitHistory(relPath) {
  try {
    const log = git("log", "--follow", "--format=%H|%as|%an|%ae", "--", relPath).trim();
    if (!log) return { history: null, contributors: null };
    const rows = log.split("\n").map((l) => l.split("|"));
    const byAuthor = new Map();
    for (const [, , name, email] of rows) {
      const k = email || name;
      const e = byAuthor.get(k) || { name, email, changes: 0 };
      e.changes++;
      byAuthor.set(k, e);
    }
    const first = rows[rows.length - 1][1];
    const last = rows[0][1];
    const ageDays = Math.round((Date.now() - new Date(first).getTime()) / 86400000);
    return {
      history: { sourceFiles: [relPath], totalChanges: rows.length, uniqueCommits: rows.length, firstCommit: first, lastUpdated: last, ageDays },
      contributors: [...byAuthor.values()].sort((a, b) => b.changes - a.changes),
    };
  } catch {
    return { history: null, contributors: null };
  }
}

function detectRemote() {
  try {
    const url = git("remote", "get-url", "origin").trim();
    const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
    let branch = "main";
    try { branch = git("rev-parse", "--abbrev-ref", "HEAD").trim(); } catch {}
    if (m) return `https://github.com/${m[1]}/${m[2]}/blob/${branch}/`;
  } catch {}
  return "";
}

function read(rel) {
  return readFileSync(join(repo, rel), "utf8");
}
function listDir(rel) {
  try { return readdirSync(join(repo, rel), { withFileTypes: true }); } catch { return []; }
}

// ---------- discovery ----------
const nodes = [];
const readList = [];

function addNode(node, sourceRel) {
  const { history, contributors } = gitHistory(sourceRel);
  nodes.push({ description: "", aliases: [], commands: [], ...node, history, contributors });
}

// Skills: directory form <dir>/<name>/SKILL.md and flat form <dir>/<name>.md
const SKILL_DIRS = [".claude/skills", "skills", ".agents/skills"];
const skillByName = new Map();
for (const dir of SKILL_DIRS) {
  for (const ent of listDir(dir)) {
    let rel = null, name = null;
    if (ent.isDirectory() && existsSync(join(repo, dir, ent.name, "SKILL.md"))) {
      rel = `${dir}/${ent.name}/SKILL.md`;
      name = ent.name;
    } else if (ent.isFile() && ent.name.endsWith(".md")) {
      rel = `${dir}/${ent.name}`;
      name = basename(ent.name, ".md");
    }
    if (!rel || skillByName.has(name)) continue;
    const { attrs } = parseFrontmatter(read(rel));
    const node = {
      id: `workflow:${name}`, kind: "workflow", label: name, path: rel,
      description: attrs.description || "",
    };
    skillByName.set(name, node);
    addNode(node, rel);
    readList.push(rel);
  }
}

// Commands: .claude/commands/**/*.md — fold into same-named skill, else standalone workflow node.
function walkCommands(rel) {
  for (const ent of listDir(rel)) {
    const childRel = `${rel}/${ent.name}`;
    if (ent.isDirectory()) walkCommands(childRel);
    else if (ent.name.endsWith(".md")) {
      const name = basename(ent.name, ".md");
      const { attrs } = parseFrontmatter(read(childRel));
      const cmd = { name, description: attrs.description || "", path: childRel };
      const skill = skillByName.get(name);
      if (skill) {
        nodes.find((n) => n.id === skill.id).commands.push(cmd);
      } else {
        addNode({ id: `workflow:${name}`, kind: "workflow", label: name, path: childRel, description: cmd.description, commands: [cmd] }, childRel);
        skillByName.set(name, { id: `workflow:${name}` });
        readList.push(childRel);
      }
    }
  }
}
walkCommands(".claude/commands");

// Agents: .claude/agents/*.md
for (const ent of listDir(".claude/agents")) {
  if (!ent.isFile() || !ent.name.endsWith(".md")) continue;
  const rel = `.claude/agents/${ent.name}`;
  const name = basename(ent.name, ".md");
  const { attrs } = parseFrontmatter(read(rel));
  addNode({
    id: `agent:${name}`, kind: "agent", label: name, path: rel,
    description: attrs.description || "",
    agent: { model: attrs.model || null, targets: ["claude"] },
  }, rel);
  readList.push(rel);
}

// MCP servers: .mcp.json
if (existsSync(join(repo, ".mcp.json"))) {
  let servers = {};
  try { servers = JSON.parse(read(".mcp.json")).mcpServers || {}; } catch {}
  for (const [name, cfg] of Object.entries(servers)) {
    addNode({
      id: `mcp:${name}`, kind: "mcp", label: name, path: ".mcp.json",
      description: "",
      mcp: {
        name, type: cfg.type || (cfg.url ? "http" : "stdio"),
        command: cfg.command || null, url: cfg.url || null,
        argsSummary: Array.isArray(cfg.args) ? cfg.args.join(" ") : null,
      },
    }, ".mcp.json");
  }
}

// ---------- output ----------
const scan = {
  schemaVersion: 1,
  meta: {
    title: `${basename(repo)} Harness Map`,
    repoName: basename(repo),
    sourceUrlBase: detectRemote(),
    generatedAt: new Date().toISOString(),
    generator: "harness-map@0.1.0",
  },
  nodes,
  readList,
};
writeFileSync(join(outDir, "scan.json"), JSON.stringify(scan, null, 2) + "\n");
console.log(`scan.json: ${nodes.length} nodes (${nodes.filter(n=>n.kind==="workflow").length} workflows, ${nodes.filter(n=>n.kind==="agent").length} agents, ${nodes.filter(n=>n.kind==="mcp").length} mcp), ${readList.length} files to read -> ${join(outDir, "scan.json")}`);
