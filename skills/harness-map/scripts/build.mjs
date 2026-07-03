#!/usr/bin/env node
// build.mjs — assemble the self-contained harness-map.html from a validated graph.json.
// Usage: node build.mjs --graph <file> --out <html-file>
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const arg = (n, f) => { const i = argv.indexOf(n); return i === -1 ? f : argv[i + 1]; };
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
  skillEdges: 0, mcpUses: 0, agentEdges: 0, promptEdges: 0,
};
for (const e of g.edges) {
  for (const counter of edgeTypes[e.kind]?.countAs || []) {
    if (counter in stats) stats[counter] += e.weight || 1;
    else stats[counter] = (stats[counter] || 0) + (e.weight || 1);
  }
}

const data = { ...g, edgeTypes, stats, positions: {}, clusters: g.clusters || [] };

// ----- assemble -----
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const vendorTags = readdirSync(join(assets, "vendor"))
  .filter((f) => f.endsWith(".js"))
  .sort()
  .map((f) => `<script src="data:application/javascript;base64,${b64(readFileSync(join(assets, "vendor", f), "utf8"))}"></script>`)
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
console.log(`${outFile}: ${(html.length / 1024).toFixed(0)}KB, ${stats.skills} skills, ${stats.agents} agents, ${stats.mcpServers} mcp, ${stats.edges} edges`);
