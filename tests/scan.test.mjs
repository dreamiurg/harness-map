import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SCAN = join(here, "../skills/harness-map/scripts/scan.mjs");
const MINI = join(here, "fixtures/mini-repo");

function runScan(repo) {
  const out = mkdtempSync(join(tmpdir(), "hm-scan-"));
  execFileSync(process.execPath, [SCAN, "--repo", repo, "--out", out], { encoding: "utf8" });
  return JSON.parse(readFileSync(join(out, "scan.json"), "utf8"));
}

test("discovers skills in both layouts, agents, commands, mcp servers", () => {
  const scan = runScan(MINI);
  const ids = scan.nodes.map((n) => n.id).sort();
  assert.deepEqual(ids, [
    "agent:helper",
    "mcp:remote",
    "mcp:thing",
    "workflow:alpha",
    "workflow:beta",
    "workflow:deploy",
  ]);
});

test("folds same-named command into skill node, keeps standalone command as workflow", () => {
  const scan = runScan(MINI);
  const alpha = scan.nodes.find((n) => n.id === "workflow:alpha");
  assert.equal(alpha.commands.length, 1);
  assert.equal(alpha.commands[0].path, ".claude/commands/alpha.md");
  const deploy = scan.nodes.find((n) => n.id === "workflow:deploy");
  assert.equal(deploy.commands.length, 1);
});

test("frontmatter description and kind-specific facts are captured", () => {
  const scan = runScan(MINI);
  const beta = scan.nodes.find((n) => n.id === "workflow:beta");
  assert.equal(beta.description, "Flat-form skill.");
  const helper = scan.nodes.find((n) => n.id === "agent:helper");
  assert.equal(helper.agent.model, "sonnet");
  const thing = scan.nodes.find((n) => n.id === "mcp:thing");
  assert.equal(thing.mcp.type, "stdio");
  assert.equal(thing.mcp.command, "uvx");
});

test("readList covers every skill, agent, and command file", () => {
  const scan = runScan(MINI);
  for (const p of [
    ".claude/skills/alpha/SKILL.md",
    ".claude/skills/beta.md",
    ".claude/agents/helper.md",
    ".claude/commands/deploy.md",
  ]) assert.ok(scan.readList.includes(p), `missing ${p}`);
});

test("history is null-or-object on the fixture; a real git repo yields strict history", () => {
  // The fixture lives inside the harness-map checkout, so git may or may not
  // resolve history for it depending on commit state — lenient here, strict below.
  const scan = runScan(MINI);
  const beta = scan.nodes.find((n) => n.id === "workflow:beta");
  assert.ok(beta.history === null || typeof beta.history === "object");

  const g = mkdtempSync(join(tmpdir(), "hm-git-"));
  mkdirSync(join(g, ".claude/skills"), { recursive: true });
  writeFileSync(join(g, ".claude/skills/solo.md"), "---\nname: solo\ndescription: d\n---\nbody");
  const env = { ...process.env, GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@t" };
  for (const cmd of [["init"], ["add", "."], ["commit", "-m", "x"]])
    execFileSync("git", ["-C", g, ...cmd], { env, encoding: "utf8" });
  const scan2 = runScan(g);
  const solo = scan2.nodes.find((n) => n.id === "workflow:solo");
  assert.equal(solo.history.uniqueCommits, 1);
  assert.equal(solo.contributors[0].name, "T");
});
