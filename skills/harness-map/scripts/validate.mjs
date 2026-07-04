#!/usr/bin/env node
// validate.mjs — fail-closed checks on an agent-authored graph.json.
// Usage: node validate.mjs --graph <file> --repo <path>
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const arg = (n, f) => {
  const i = argv.indexOf(n);
  return i === -1 ? f : argv[i + 1];
};
const graphFile = resolve(arg("--graph", "harness-map-work/graph.json"));
const repo = resolve(arg("--repo", "."));

const assetsDir = join(dirname(fileURLToPath(import.meta.url)), "../assets");
const edgeTypes = JSON.parse(readFileSync(join(assetsDir, "edge-types.json"), "utf8"));
const KINDS = new Set(["workflow", "agent", "mcp", "prompt"]);

const errors = [];
const err = (m) => errors.push(m);

let g;
try {
  g = JSON.parse(readFileSync(graphFile, "utf8"));
} catch (e) {
  console.error(`ERROR: cannot parse ${graphFile}: ${e.message}`);
  process.exit(1);
}

if (g.schemaVersion !== 1) err(`schemaVersion must be 1, got ${g.schemaVersion}`);
for (const k of ["stats", "edgeTypes", "positions"])
  if (k in g) err(`"${k}" is injected by build.mjs — the agent must not author it`);
if (!g.meta || typeof g.meta.title !== "string" || !g.meta.title) err("meta.title is required");
if (!Array.isArray(g.nodes) || g.nodes.length === 0) err("nodes must be a non-empty array");
if (!Array.isArray(g.edges)) err("edges must be an array");

const ids = new Set();
for (const n of g.nodes || []) {
  if (!n.id || ids.has(n.id)) err(`duplicate or missing node id: ${n.id}`);
  ids.add(n.id);
  if (!KINDS.has(n.kind)) err(`${n.id}: unknown kind "${n.kind}"`);
  if (n.id && !n.id.startsWith(`${n.kind}:`)) err(`${n.id}: id must start with "${n.kind}:"`);
  if (!n.label) err(`${n.id}: label is required`);
  if (!n.path) err(`${n.id}: path is required`);
  else if (!existsSync(join(repo, n.path))) err(`${n.id}: path does not exist in repo: ${n.path}`);
  if (typeof n.summary !== "string" || n.summary.trim().length < 3)
    err(`${n.id}: summary (agent-written one-liner) is required`);
}

const seenEdges = new Set();
for (const e of g.edges || []) {
  const tag = `${e.source} -[${e.kind}]-> ${e.target}`;
  if (!ids.has(e.source)) err(`edge ${tag}: unknown source`);
  if (!ids.has(e.target)) err(`edge ${tag}: unknown target ${e.target}`);
  if (!edgeTypes[e.kind])
    err(`edge ${tag}: unknown kind "${e.kind}" (see references/edge-taxonomy.md)`);
  if (seenEdges.has(tag)) err(`edge ${tag}: duplicate (raise weight instead)`);
  seenEdges.add(tag);
  if (!Array.isArray(e.evidence) || e.evidence.length === 0)
    err(`edge ${tag}: evidence[] required`);
  for (const p of e.evidence || [])
    if (!existsSync(join(repo, p))) err(`edge ${tag}: evidence path does not exist: ${p}`);
}

for (const c of g.clusters || []) {
  if (!c.name) err("cluster without name");
  for (const m of c.members || [])
    if (!ids.has(m.id)) err(`cluster ${c.name}: unknown member ${m.id}`);
}

if (errors.length) {
  for (const m of errors) console.error(`ERROR: ${m}`);
  console.error(`\n${errors.length} error(s). Fix graph.json and re-run.`);
  process.exit(1);
}
console.log(
  `OK: ${g.nodes.length} nodes, ${g.edges.length} edges, ${(g.clusters || []).length} clusters`,
);
