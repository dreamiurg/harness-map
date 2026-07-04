#!/usr/bin/env node
// build.mjs — assemble the self-contained harness-map.html from a validated graph.json.
// Usage: node build.mjs --graph <file> --out <html-file>
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const arg = (n, f) => {
  const i = argv.indexOf(n);
  return i === -1 ? f : argv[i + 1];
};
const graphFile = resolve(arg("--graph", "harness-map-work/graph.json"));
const outFile = resolve(arg("--out", "harness-map.html"));

const assets = join(dirname(fileURLToPath(import.meta.url)), "../assets");
const g = JSON.parse(readFileSync(graphFile, "utf8"));
const edgeTypes = JSON.parse(readFileSync(join(assets, "edge-types.json"), "utf8"));

// ----- stats: node-kind counts + countAs counters from edge metadata -----
const stats = {
  skills: g.nodes.filter((n) => n.kind === "workflow").length,
  agents: g.nodes.filter((n) => n.kind === "agent").length,
  mcpServers: g.nodes.filter((n) => n.kind === "mcp").length,
  prompts: g.nodes.filter((n) => n.kind === "prompt").length,
  edges: g.edges.length,
  clusters: (g.clusters || []).length,
  skillEdges: 0,
  mcpUses: 0,
  agentEdges: 0,
  promptEdges: 0,
};
for (const e of g.edges) {
  for (const counter of edgeTypes[e.kind]?.countAs || []) {
    if (counter in stats) stats[counter] += e.weight || 1;
    else stats[counter] = (stats[counter] || 0) + (e.weight || 1);
  }
}

// cluster is documented as optional per-node (schema.md), but the renderer's
// cluster-box layout only positions nodes whose cluster matches a name in
// `clusters`. Default ungrouped workflow nodes into a single "Workflows"
// bucket so agent-authored graphs that skip clustering still render.
const DEFAULT_CLUSTER = "Workflows";
const nodes = g.nodes.map((n) =>
  n.kind === "workflow" && !n.cluster ? { ...n, cluster: DEFAULT_CLUSTER } : n,
);

// Reconcile deterministically: `clusters` is agent-authored and may drift from
// the free-typed `node.cluster` values (typos, or a non-empty clusters array
// that simply doesn't enumerate every cluster used by nodes). Rather than
// trusting `clusters` to be complete, always append a synthetic entry for
// every distinct workflow cluster name not already covered. This guarantees
// `currentClusterNames()` in the renderer can never silently exclude a node
// for want of a matching cluster entry.
const declaredNames = new Set((g.clusters || []).map((c) => c.name));
const usedNames = [
  ...new Set(nodes.filter((n) => n.kind === "workflow").map((n) => n.cluster)),
].sort();
const synthesized = usedNames
  .filter((name) => !declaredNames.has(name))
  .map((name) => ({ name, summary: "", members: [] }));
const clusters = [...(g.clusters || []), ...synthesized];

const data = { ...g, nodes, edgeTypes, stats, positions: {}, clusters };

// ----- assemble -----
// Vendor libraries are inlined as base64 data: URIs so the generated map is one
// self-contained offline file. The inputs are unmodified official npm dist builds —
// provenance and SHA-256 checksums in assets/vendor/VENDOR.md.
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const vendorTags = readdirSync(join(assets, "vendor"))
  .filter((f) => f.endsWith(".js"))
  .sort()
  .map(
    (f) =>
      `<script src="data:application/javascript;base64,${b64(readFileSync(join(assets, "vendor", f), "utf8"))}"></script>`,
  )
  .join("\n");

// JSON is embedded in a <script> block: escape "<" to avoid "</script>" termination.
const dataJson = JSON.stringify(data).replace(/</g, "\\u003c");
const dataTag = `<script>\nwindow.SkillDependencyMapData = ${dataJson};\nwindow.SkillDependencyMapAvatarResources = {};\nwindow.__resources = {};\n</script>`;
const rendererTag = `<script>\n${readFileSync(join(assets, "renderer.js"), "utf8")}\n</script>`;

let html = readFileSync(join(assets, "template.html"), "utf8");
const replaceOnce = (marker, value) => {
  if (!html.includes(marker)) throw new Error(`template missing ${marker}`);
  html = html.replace(marker, () => value);
};
replaceOnce("<!--HM:TITLE-->", data.meta.title);
replaceOnce("<!--HM:VENDOR-->", vendorTags);
replaceOnce("<!--HM:DATA-->", dataTag);
replaceOnce("<!--HM:RENDERER-->", rendererTag);

writeFileSync(outFile, html);
console.log(
  `${outFile}: ${(html.length / 1024).toFixed(0)}KB, ${stats.skills} skills, ${stats.agents} agents, ${stats.mcpServers} mcp, ${stats.edges} edges`,
);
