import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const BUILD = join(here, "../skills/harness-map/scripts/build.mjs");
const SAMPLE = join(here, "fixtures/sample-graph.json");

test("build produces a self-contained html with data, renderer, vendor, and no placeholders", () => {
  const out = join(mkdtempSync(join(tmpdir(), "hm-build-")), "map.html");
  execFileSync(process.execPath, [BUILD, "--graph", SAMPLE, "--out", out], { encoding: "utf8" });
  const html = readFileSync(out, "utf8");
  assert.ok(html.length > 100000, "vendor libs should make this large");
  assert.doesNotMatch(html, /<!--HM:/, "all placeholders replaced");
  assert.match(html, /window\.SkillDependencyMapData\s*=/);
  assert.match(html, /window\.SkillDependencyMapAvatarResources\s*=/);
  assert.match(html, /mini-repo Harness Map/);
  assert.doesNotMatch(html, /<script\s+src="(?!data:)/, "no external script srcs");

  const dataJson = html.match(/window\.SkillDependencyMapData\s*=\s*(\{[\s\S]*?\});\s*\n/)[1];
  const data = JSON.parse(dataJson);
  assert.equal(data.stats.skills, 2);
  assert.equal(data.stats.agents, 1);
  assert.equal(data.stats.mcpServers, 1);
  assert.equal(data.stats.edges, 3);
  assert.ok(data.edgeTypes.handoff, "edgeTypes injected");
  assert.deepEqual(data.positions, {});
});

test("build reconciles a non-empty clusters array that omits a used node.cluster value", () => {
  // Regression for: a graph with clusters:[{name:"Alpha"}] plus a node whose
  // cluster is "Beta-Typo" (drift/typo between the two free-typed fields).
  // build.mjs must synthesize the missing cluster entry so the renderer's
  // cluster-box layout has somewhere to place every node — nothing should be
  // silently dropped for want of a matching `clusters` entry.
  const dir = mkdtempSync(join(tmpdir(), "hm-build-reconcile-"));
  const graphFile = join(dir, "graph.json");
  const out = join(dir, "map.html");
  const graph = {
    schemaVersion: 1,
    meta: { title: "reconcile-test", repoName: "reconcile-test", sourceUrlBase: "", generatedAt: "2026-07-03T00:00:00.000Z", generator: "harness-map@0.1.0" },
    nodes: [
      { id: "workflow:a", kind: "workflow", label: "a", path: "a.md", description: "", summary: "s", aliases: [], cluster: "Alpha", commands: [], history: null, contributors: null },
      { id: "workflow:b", kind: "workflow", label: "b", path: "b.md", description: "", summary: "s", aliases: [], cluster: "Beta-Typo", commands: [], history: null, contributors: null },
    ],
    edges: [],
    clusters: [{ name: "Alpha", summary: "", members: [] }],
  };
  writeFileSync(graphFile, JSON.stringify(graph));
  execFileSync(process.execPath, [BUILD, "--graph", graphFile, "--out", out], { encoding: "utf8" });
  const html = readFileSync(out, "utf8");
  const dataJson = html.match(/window\.SkillDependencyMapData\s*=\s*(\{[\s\S]*?\});\s*\n/)[1];
  const data = JSON.parse(dataJson);
  const names = data.clusters.map((c) => c.name).sort();
  assert.deepEqual(names, ["Alpha", "Beta-Typo"], "clusters array must cover every distinct node.cluster value");
});
