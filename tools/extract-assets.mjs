#!/usr/bin/env node
// One-off extractor: splits the Call-E skill-dependency-map artifacts into
// reusable template + renderer + vendor libs + edge-type metadata.
//
// Adapted from the original plan (see .superpowers/sdd/task-2-brief.md Step 1):
// the source HTML does NOT inline the data/renderer scripts as <script>...</script>
// blocks with embedded JS. It loads them via
//   <script src="./skill-dependency-map.data.js"></script>
//   <script src="./skill-dependency-map.renderer.js"></script>
// and there is no separate avatar-resource script (window.__resources is read
// defensively by renderer.js but never populated in the source artifact).
// Only the vendor libraries (d3, and one UMD helper) are inlined as
// `<script src="data:application/javascript;base64,...">` tags. The classifier
// below was rewritten around that reality; the four-placeholder template
// contract and separate renderer.js/edge-types.json outputs are unchanged.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SRC = "/Users/dreamiurg/src/calle/calle/.coding-agents-config";
const OUT = new URL("../skills/harness-map/assets/", import.meta.url).pathname;
mkdirSync(join(OUT, "vendor"), { recursive: true });

const html = readFileSync(join(SRC, "skill-dependency-map.html"), "utf8");
const renderer = readFileSync(join(SRC, "skill-dependency-map.renderer.js"), "utf8");
const dataJs = readFileSync(join(SRC, "skill-dependency-map.data.js"), "utf8");

// 1. Vendor libs: every <script src="data:application/javascript;base64,...">
let vendorCount = 0;
let template = html.replace(
  /<script[^>]*src="data:application\/javascript;base64,([^"]+)"[^>]*>\s*<\/script>/g,
  (_, b64) => {
    const code = Buffer.from(b64, "base64").toString("utf8");
    writeFileSync(join(OUT, "vendor", `vendor-${vendorCount}.js`), code);
    vendorCount++;
    return vendorCount === 1 ? "<!--HM:VENDOR-->" : "";
  },
);

// 2. Data + renderer: the source loads these as external <script src="./...">
//    tags (not inlined). Replace the pair with the two remaining placeholders.
let sawData = false;
let sawRenderer = false;
template = template.replace(
  /<script src="\.\/skill-dependency-map\.data\.js"><\/script>\s*<script src="\.\/skill-dependency-map\.renderer\.js"><\/script>/,
  () => {
    sawData = true;
    sawRenderer = true;
    return "<!--HM:DATA-->\n<!--HM:RENDERER-->";
  },
);

// 3. Title placeholder (tag text)
template = template.replace(/<title>[\s\S]*?<\/title>/, "<title><!--HM:TITLE--></title>");

// 4. Genericize visible header branding (h1 + subtitle), since HM:TITLE only
//    covers the <title> tag, not body copy. The renderer sets these from
//    data.meta.title at runtime (see Step 5 guard below), so static fallback
//    copy here just needs to be neutral, not repo-specific.
template = template.replace(
  /<h1>Call-E Skill Dependency Map<\/h1>/,
  "<h1>Harness Map</h1>",
);
template = template.replace(
  /<div class="sub">[^<]*<\/div>/,
  '<div class="sub">How skills, commands, agents, and MCP servers connect in this repo.</div>',
);

// 5. edge-types.json: pull the edgeTypes object out of data.js by evaluating it.
const sandbox = {};
new Function("window", dataJs)(sandbox);
const data = sandbox.SkillDependencyMapData;
if (!data || !data.edgeTypes) throw new Error("edgeTypes not found in data.js");
writeFileSync(join(OUT, "edge-types.json"), JSON.stringify(data.edgeTypes, null, 2) + "\n");

writeFileSync(join(OUT, "template.html"), template);
writeFileSync(join(OUT, "renderer.js"), renderer);

console.log(JSON.stringify({
  vendorCount, sawData, sawRenderer,
  templateBytes: template.length,
  edgeKinds: Object.keys(data.edgeTypes),
}, null, 2));
