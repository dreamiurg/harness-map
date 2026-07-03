import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const VALIDATE = join(here, "../skills/harness-map/scripts/validate.mjs");
const MINI = join(here, "fixtures/mini-repo");
const SAMPLE = JSON.parse(readFileSync(join(here, "fixtures/sample-graph.json"), "utf8"));

function run(graph) {
  const f = join(mkdtempSync(join(tmpdir(), "hm-val-")), "graph.json");
  writeFileSync(f, JSON.stringify(graph));
  try {
    execFileSync(process.execPath, [VALIDATE, "--graph", f, "--repo", MINI], { encoding: "utf8" });
    return { code: 0, out: "" };
  } catch (e) {
    return { code: e.status, out: String(e.stdout) + String(e.stderr) };
  }
}

test("valid graph passes", () => {
  assert.equal(run(SAMPLE).code, 0);
});

test("dangling edge target fails", () => {
  const g = structuredClone(SAMPLE);
  g.edges[0].target = "workflow:ghost";
  const r = run(g);
  assert.equal(r.code, 1);
  assert.match(r.out, /ghost/);
});

test("unknown edge kind fails", () => {
  const g = structuredClone(SAMPLE);
  g.edges[0].kind = "teleports";
  const r = run(g);
  assert.equal(r.code, 1);
  assert.match(r.out, /teleports/);
});

test("missing evidence path fails", () => {
  const g = structuredClone(SAMPLE);
  g.edges[0].evidence = ["does/not/exist.md"];
  const r = run(g);
  assert.equal(r.code, 1);
  assert.match(r.out, /does\/not\/exist\.md/);
});

test("duplicate node id, missing summary, agent-authored stats all fail", () => {
  const g = structuredClone(SAMPLE);
  g.nodes.push(structuredClone(g.nodes[0]));
  g.nodes[1].summary = "";
  g.stats = { skills: 1 };
  const r = run(g);
  assert.equal(r.code, 1);
  assert.match(r.out, /duplicate/i);
  assert.match(r.out, /summary/i);
  assert.match(r.out, /stats/i);
});
