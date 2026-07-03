import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
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
