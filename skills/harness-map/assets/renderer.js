const data = window.SkillDependencyMapData;
if (!data) {
  throw new Error(
    "Harness map data was not loaded. Include the data script before the renderer."
  );
}
data.positions = data.positions || {};
data.clusters = data.clusters || [];
data.stats = data.stats || {};
data.meta = data.meta || {};
if (data.meta.title) {
  document.title = data.meta.title;
  const h1 = document.querySelector("h1");
  if (h1) h1.textContent = data.meta.title;
}
const AVATAR_RES = window.SkillDependencyMapAvatarResources || {};
function avatarSrc(u) {
  const id = AVATAR_RES[u];
  return id && window.__resources && window.__resources[id]
    ? window.__resources[id]
    : u;
}
const svg = document.getElementById("graph");
const graphWrap = document.getElementById("graphWrap");
const search = document.getElementById("search");
const details = document.getElementById("details");
const layoutModes = [...document.querySelectorAll('input[name="layoutMode"]')];
const layoutNote = document.getElementById("layoutNote");
const showSkills = document.getElementById("showSkills");
const showMcp = document.getElementById("showMcp");
const showAgents = document.getElementById("showAgents");
const showPrompts = document.getElementById("showPrompts");
const showClusters = document.getElementById("showClusters");
const zoomLabel = document.getElementById("zoomLabel");
const themeButtons = [...document.querySelectorAll(".thBtn")];
const zoomOut = document.getElementById("zoomOut");
const zoomIn = document.getElementById("zoomIn");
const zoomFit = document.getElementById("zoomFit");
const skillCount = document.getElementById("skillCount");
const agentCount = document.getElementById("agentCount");
const promptCount = document.getElementById("promptCount");
const mcpCount = document.getElementById("mcpCount");
const edgeCount = document.getElementById("edgeCount");
const clusterCount = document.getElementById("clusterCount");
window.__mapTweaks = { density: 1, wiring: "curved", chroma: 1.5 };
window.__applyMapTweaks = (t) => {
  Object.assign(window.__mapTweaks, t);
  relayout();
};
const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
const clusterByName = new Map(data.clusters.map((c) => [c.name, c]));
const clusterHues = new Map([
  ["Speckit", 285],
  ["PR / Shipping", 155],
  ["Release", 115],
  ["QA / Browser", 215],
  ["Legal", 55],
  ["On-call / Data", 15],
  ["Patrols", 330],
  ["Support / Ops", 180],
]);
function clusterColor(name, l, c) {
  const h = clusterHues.get(name) ?? 220;
  return `oklch(${l} ${c} ${h})`;
}
const clusterShades = {
  dark: {
    cf: [0.21, 0.025],
    cs: [0.42, 0.07],
    ct: [0.84, 0.08],
    ns: [0.48, 0.06],
  },
  light: {
    cf: [0.97, 0.012],
    cs: [0.72, 0.08],
    ct: [0.45, 0.09],
    ns: [0.62, 0.09],
  },
};
function shade(name, key) {
  const t =
    document.documentElement.dataset.theme === "light" ? "light" : "dark";
  const v = clusterShades[t][key];
  return clusterColor(
    name,
    v[0],
    +(v[1] * window.__mapTweaks.chroma).toFixed(4)
  );
}
const baseClusterOrder = [
  "Speckit",
  "PR / Shipping",
  "Release",
  "QA / Browser",
  "Legal",
  "On-call / Data",
  "Patrols",
  "Support / Ops",
];
let pos = structuredClone(data.positions);
let clusters = structuredClone(data.clusters);
let canvas = { width: 1600, height: 1100 };
let selected = null;
let panState = null;
let suppressNextBlankClick = false;
let zoom = 1;
let panX = 0,
  panY = 0;
function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]
  );
}
function short(s, n = 28) {
  s = String(s || "");
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
function naturalWidth(label) {
  return Math.max(
    150,
    Math.min(310, Math.round(38 + String(label).length * 7.4))
  );
}
function nodeSize(n) {
  const d = window.__mapTweaks.density;
  return {
    width: Math.round(naturalWidth(n.label) * d),
    height: Math.round(48 * d),
  };
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function selectedLayoutMode() {
  return layoutModes.find((input) => input.checked)?.value || "dagre-lr";
}
function applyViewportTransform() {
  svg.style.transform = `translate(${panX}px,${panY}px)`;
}
function applyCanvasSize() {
  const w = Math.max(320, Math.round(canvas.width * zoom)),
    h = Math.max(240, Math.round(canvas.height * zoom));
  svg.style.width = `${w}px`;
  svg.style.height = `${h}px`;
  svg.style.minWidth = `${w}px`;
  svg.style.minHeight = `${h}px`;
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  applyViewportTransform();
}
function setZoom(next) {
  const rect = graphWrap.getBoundingClientRect();
  setZoomAt(
    next,
    rect.left + graphWrap.clientWidth / 2,
    rect.top + graphWrap.clientHeight / 2
  );
}
function setZoomAt(next, clientX, clientY) {
  const old = zoom;
  const rect = graphWrap.getBoundingClientRect();
  const localX = clientX - rect.left,
    localY = clientY - rect.top;
  const worldX = (localX - panX) / old,
    worldY = (localY - panY) / old;
  zoom = clamp(next, 0.25, 2.5);
  panX = localX - worldX * zoom;
  panY = localY - worldY * zoom;
  applyCanvasSize();
}
function fitZoom() {
  const xFit = (graphWrap.clientWidth - 28) / canvas.width;
  const yFit = (graphWrap.clientHeight - 28) / canvas.height;
  zoom = Math.min(1, Math.max(0.25, Math.min(xFit, yFit)));
  panX = (graphWrap.clientWidth - canvas.width * zoom) / 2;
  panY = (graphWrap.clientHeight - canvas.height * zoom) / 2;
  applyCanvasSize();
}
function isMcp(n) {
  return n?.kind === "mcp";
}
function isAgent(n) {
  return n?.kind === "agent";
}
function isPrompt(n) {
  return n?.kind === "prompt";
}
function isWorkflow(n) {
  return !isMcp(n) && !isAgent(n) && !isPrompt(n);
}
function mcpTransportLabel(m) {
  return m?.type === "http"
    ? "HTTP"
    : m?.type === "stdio"
      ? "local command"
      : m?.type || "unknown";
}
function cleanAgentModel(s) {
  return String(s || "")
    .replace(/\[\d+m\]/g, "")
    .trim();
}
const EDGE_TYPE_FALLBACK = {
  category: "dependency",
  markerCategory: "default",
  outLabel: "depends on",
  inLabel: "used by",
  countAs: [],
};
function edgeType(kind) {
  return data.edgeTypes?.[kind] || EDGE_TYPE_FALLBACK;
}
function edgeCategory(kind) {
  return edgeType(kind).category || EDGE_TYPE_FALLBACK.category;
}
function edgeCountAs(kind, bucket) {
  return (edgeType(kind).countAs || []).includes(bucket);
}
function edgeMarker(kind) {
  const category = edgeType(kind).markerCategory || edgeCategory(kind);
  return category === "default" || category === "dependency"
    ? "arrow-default"
    : `arrow-${category}`;
}
function isAgentEdgeKind(kind) {
  return edgeCountAs(kind, "agent");
}
function isPromptEdgeKind(kind) {
  return edgeCountAs(kind, "prompt");
}
function isMcpEdgeKind(kind) {
  return edgeCountAs(kind, "mcp");
}
function currentNodes() {
  return data.nodes.filter(
    (n) =>
      (showSkills.checked || !isWorkflow(n)) &&
      (showMcp.checked || !isMcp(n)) &&
      (showAgents.checked || !isAgent(n)) &&
      (showPrompts.checked || !isPrompt(n))
  );
}
function currentNodeIds() {
  return new Set(currentNodes().map((n) => n.id));
}
function currentEdges() {
  const ids = currentNodeIds();
  return data.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
}
function currentClusterNames() {
  const names = new Set(currentNodes().map((n) => n.cluster));
  return baseClusterOrder.filter((name) => names.has(name));
}
const CLUSTER_PAD_X = 22,
  CLUSTER_PAD_TOP = 46,
  CLUSTER_PAD_BOTTOM = 20;
function lineWrap(label, max = 25) {
  const parts = String(label)
    .split(/([/.-])/)
    .reduce((a, p) => {
      if (!p) return a;
      if (/[/.:-]/.test(p) && a.length) a[a.length - 1] += p;
      else a.push(p);
      return a;
    }, []);
  const lines = [""];
  for (const p of parts) {
    if ((lines[lines.length - 1] + p).length > max && lines.length < 2)
      lines.push("");
    lines[lines.length - 1] += p;
  }
  return lines.map((x) => short(x, max));
}
function internalEdges(name) {
  const ids = new Set(
    currentNodes()
      .filter((n) => n.cluster === name)
      .map((n) => n.id)
  );
  return currentEdges().filter((e) => ids.has(e.source) && ids.has(e.target));
}
function arrangeClusterBoxes(localLayouts) {
  const rowDefs = [
    ["Speckit", "PR / Shipping", "Release"],
    ["QA / Browser", "Legal", "On-call / Data"],
    ["Patrols", "Support / Ops"],
  ];
  const den = window.__mapTweaks.density,
    gapX = 64 * den,
    gapY = 84 * den,
    startX = 40,
    startY = 54;
  const outClusters = [],
    offsets = new Map();
  let y = startY;
  for (const row of rowDefs) {
    let x = startX,
      rowH = 0;
    for (const name of row) {
      const layout = localLayouts.get(name);
      if (!layout) continue;
      const c = {
        name,
        x,
        y,
        w: layout.w,
        h: layout.h,
        count: layout.count,
        summary: clusterByName.get(name)?.summary || "",
        members: clusterByName.get(name)?.members || [],
      };
      outClusters.push(c);
      offsets.set(name, { x: x + CLUSTER_PAD_X, y: y + CLUSTER_PAD_TOP });
      x += layout.w + gapX;
      rowH = Math.max(rowH, layout.h);
    }
    y += rowH + gapY;
  }
  return {
    clusters: outClusters,
    offsets,
    width: Math.max(1200, ...outClusters.map((c) => c.x + c.w + 80)),
    height: Math.max(900, ...outClusters.map((c) => c.y + c.h + 80)),
  };
}
function hashId(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
function clusterBoundaryPoint(c, cx, cy, index) {
  const ccx = c.x + c.w / 2,
    ccy = c.y + c.h / 2;
  let dx = cx - ccx,
    dy = cy - ccy;
  if (Math.abs(dx) + Math.abs(dy) < 1) {
    const a = (((hashId(c.name) + index * 97) % 360) * Math.PI) / 180;
    dx = Math.cos(a);
    dy = Math.sin(a);
  }
  const scale = Math.min(
    Math.abs(c.w / 2 / (dx || 0.001)),
    Math.abs(c.h / 2 / (dy || 0.001))
  );
  return { x: ccx + dx * scale, y: ccy + dy * scale };
}
function overlapsAny(rect, rects, pad = 12) {
  return rects.some(
    (r) =>
      rect.x < r.x + r.w + pad &&
      rect.x + rect.w + pad > r.x &&
      rect.y < r.y + r.h + pad &&
      rect.y + rect.h + pad > r.y
  );
}
function pushOutsideClusters(rect, clusterRects, pad = 18) {
  let out = { ...rect };
  for (let guard = 0; guard < 10; guard++) {
    const hit = clusterRects.find(
      (c) =>
        out.x < c.x + c.w + pad &&
        out.x + out.w + pad > c.x &&
        out.y < c.y + c.h + pad &&
        out.y + out.h + pad > c.y
    );
    if (!hit) return out;
    const options = [
      {
        x: hit.x - pad - out.w,
        y: out.y,
        move: Math.abs(hit.x - pad - out.w - out.x),
      },
      {
        x: hit.x + hit.w + pad,
        y: out.y,
        move: Math.abs(hit.x + hit.w + pad - out.x),
      },
      {
        x: out.x,
        y: hit.y - pad - out.h,
        move: Math.abs(hit.y - pad - out.h - out.y),
      },
      {
        x: out.x,
        y: hit.y + hit.h + pad,
        move: Math.abs(hit.y + hit.h + pad - out.y),
      },
    ].sort((a, b) => a.move - b.move)[0];
    out = {
      x: Math.max(40, options.x),
      y: Math.max(40, options.y),
      w: out.w,
      h: out.h,
    };
  }
  return out;
}
function freeNodePosition(cx, cy, s, rects, clusterRects = []) {
  const base = pushOutsideClusters(
    {
      x: Math.max(40, cx - s.width / 2),
      y: Math.max(40, cy - s.height / 2),
      w: s.width,
      h: s.height,
    },
    clusterRects
  );
  if (!overlapsAny(base, rects)) return base;
  for (let i = 0; i < 180; i++) {
    const ring = Math.floor(i / 8) + 1,
      angle = ((i % 8) * Math.PI) / 4 + ring * 0.27,
      radius = ring * 34;
    const candidate = pushOutsideClusters(
      {
        x: Math.max(40, base.x + Math.cos(angle) * radius),
        y: Math.max(40, base.y + Math.sin(angle) * radius),
        w: s.width,
        h: s.height,
      },
      clusterRects
    );
    if (!overlapsAny(candidate, rects)) return candidate;
  }
  return base;
}
function mostCommonCluster(nodes) {
  const counts = new Map();
  for (const n of nodes)
    counts.set(n.cluster, (counts.get(n.cluster) || 0) + 1);
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  )[0]?.[0];
}
function rectOf(p) {
  return { x: p.x, y: p.y, w: p.w, h: p.h };
}
function placementSurface(targetPos) {
  const clusterBlocks = clusters.map((c) => ({
    x: c.x,
    y: c.y,
    w: c.w,
    h: c.h,
  }));
  const occupied = [...Object.values(targetPos).map(rectOf), ...clusterBlocks];
  let maxX = 0,
    maxY = 0;
  for (const p of Object.values(targetPos)) {
    maxX = Math.max(maxX, p.x + p.w);
    maxY = Math.max(maxY, p.y + p.h);
  }
  for (const c of clusterBlocks) {
    maxX = Math.max(maxX, c.x + c.w);
    maxY = Math.max(maxY, c.y + c.h);
  }
  const clusterRight = Math.max(0, ...clusterBlocks.map((c) => c.x + c.w));
  const clusterTop = Math.min(80, ...clusterBlocks.map((c) => c.y));
  const clusterBottom = Math.max(900, ...clusterBlocks.map((c) => c.y + c.h));
  return {
    clusterBlocks,
    occupied,
    maxX,
    maxY,
    clusterRight,
    clusterTop,
    clusterBottom,
  };
}
function connectedNodesFor(node, edges, targetPos, includeConnected) {
  return edges
    .filter((e) => e.source === node.id || e.target === node.id)
    .map((e) => nodeById.get(e.source === node.id ? e.target : e.source))
    .filter((x) => x && targetPos[x.id] && includeConnected(x));
}
function averageNodeCenter(nodes, targetPos) {
  return {
    x:
      nodes.reduce(
        (sum, n) => sum + targetPos[n.id].x + targetPos[n.id].w / 2,
        0
      ) / nodes.length,
    y:
      nodes.reduce(
        (sum, n) => sum + targetPos[n.id].y + targetPos[n.id].h / 2,
        0
      ) / nodes.length,
  };
}
function connectedPlacement(
  node,
  connected,
  targetPos,
  placedByBucket,
  config
) {
  const center = averageNodeCenter(connected, targetPos);
  const homeCandidates = config.homeCandidates(connected);
  const home = clusters.find(
    (c) => c.name === mostCommonCluster(homeCandidates)
  );
  const anchor = home
    ? clusterBoundaryPoint(
        home,
        center.x,
        center.y,
        hashId(node.id) % config.hashMod
      )
    : center;
  const key = config.connectedKey(home, center);
  const index = placedByBucket.get(key) || 0;
  placedByBucket.set(key, index + 1);
  const homeAngle = home
    ? Math.atan2(
        anchor.y - (home.y + home.h / 2),
        anchor.x - (home.x + home.w / 2)
      )
    : config.fallbackAngle;
  const angle =
    homeAngle +
    (index % 2 ? 1 : -1) * config.angleSpread +
    Math.floor(index / 2) * config.angleStep;
  const radius =
    config.radiusBase +
    Math.floor(index / config.radiusEvery) * config.radiusStep;
  return {
    x: anchor.x + Math.cos(angle) * radius,
    y: anchor.y + Math.sin(angle) * radius,
    bucket: key,
  };
}
function verticalRailPosition(surface, size, index, config) {
  const railSlots = Math.max(
    1,
    Math.floor(
      (surface.clusterBottom - surface.clusterTop) / config.railRowHeight
    )
  );
  const col = Math.floor(index / railSlots);
  const row = index % railSlots;
  const railX =
    Math.max(surface.clusterRight, surface.maxX) + config.railOffsetX;
  return {
    x: railX + col * config.railColWidth + size.width / 2,
    y: surface.clusterTop + row * config.railRowHeight + size.height / 2,
  };
}
function horizontalRailPosition(surface, size, index, config) {
  const railY = surface.clusterBottom + config.railOffsetY;
  const railCols = Math.max(
    2,
    Math.floor(Math.max(surface.maxX, 1200) / config.railColWidth)
  );
  const col = index % railCols;
  const row = Math.floor(index / railCols);
  return {
    x: config.railStartX + col * config.railColWidth + size.width / 2,
    y: railY + row * config.railRowHeight + size.height / 2,
  };
}
function positionExternalNodes(targetPos, config) {
  if (!config.enabled()) return { width: 0, height: 0 };
  const nodes = currentNodes()
    .filter((n) => config.includeNode(n, targetPos))
    .sort((a, b) => a.label.localeCompare(b.label));
  const edges = currentEdges();
  const connectedById = new Map(
    nodes.map((n) => [
      n.id,
      connectedNodesFor(n, edges, targetPos, config.includeConnected),
    ])
  );
  const orderedNodes = [
    ...nodes.filter((n) => (connectedById.get(n.id) || []).length),
    ...nodes.filter((n) => !(connectedById.get(n.id) || []).length),
  ];
  const placedByBucket = new Map();
  const surface = placementSurface(targetPos);
  let unconnectedIndex = 0;
  for (const n of orderedNodes) {
    const connected = config.dynamicConnections
      ? connectedNodesFor(n, edges, targetPos, config.includeConnected)
      : connectedById.get(n.id) || [];
    const s = nodeSize(n);
    let cx, cy, bucket;
    if (connected.length) {
      const placed = connectedPlacement(
        n,
        connected,
        targetPos,
        placedByBucket,
        config
      );
      cx = placed.x;
      cy = placed.y;
      bucket = placed.bucket;
    } else {
      const placed =
        config.rail === "horizontal"
          ? horizontalRailPosition(surface, s, unconnectedIndex, config)
          : verticalRailPosition(surface, s, unconnectedIndex, config);
      cx = placed.x;
      cy = placed.y;
      unconnectedIndex++;
      bucket = config.unconnectedBucket;
    }
    const collisionIndex = placedByBucket.get(`${bucket}:fine`) || 0;
    placedByBucket.set(`${bucket}:fine`, collisionIndex + 1);
    const jitterAngle = -Math.PI / 2 + collisionIndex * config.jitterAngleStep;
    const jitterRadius =
      bucket === config.unconnectedBucket
        ? 0
        : collisionIndex < 1
          ? 0
          : config.jitterBase +
            Math.floor(collisionIndex / config.jitterEvery) * config.jitterStep;
    const rect = freeNodePosition(
      cx + Math.cos(jitterAngle) * jitterRadius,
      cy + Math.sin(jitterAngle) * jitterRadius,
      s,
      surface.occupied,
      surface.clusterBlocks
    );
    targetPos[n.id] = rect;
    surface.occupied.push(rect);
    surface.maxX = Math.max(surface.maxX, rect.x + s.width);
    surface.maxY = Math.max(surface.maxY, rect.y + s.height);
  }
  return { width: surface.maxX + 80, height: surface.maxY + 80 };
}
function workflowHome(connected) {
  return connected.filter((n) => isWorkflow(n));
}
const externalNodeLayouts = {
  mcp: {
    enabled: () => showMcp.checked,
    includeNode: (n) => isMcp(n),
    includeConnected: (n) => !isMcp(n),
    homeCandidates: (connected) => connected,
    connectedKey: (home, center) =>
      home?.name ||
      `${Math.round(center.x / 220)},${Math.round(center.y / 160)}`,
    hashMod: 11,
    fallbackAngle: 0,
    angleSpread: 0.36,
    angleStep: 0.18,
    radiusBase: 76,
    radiusEvery: 4,
    radiusStep: 54,
    jitterAngleStep: 1.35,
    jitterBase: 22,
    jitterEvery: 6,
    jitterStep: 24,
    rail: "vertical",
    railOffsetX: 112,
    railColWidth: 190,
    railRowHeight: 82,
    unconnectedBucket: "unconnected",
  },
  agent: {
    enabled: () => showAgents.checked,
    includeNode: (n) => isAgent(n),
    includeConnected: () => true,
    dynamicConnections: true,
    homeCandidates: workflowHome,
    connectedKey: (home, center) =>
      home?.name ||
      `agent:${Math.round(center.x / 260)},${Math.round(center.y / 180)}`,
    hashMod: 13,
    fallbackAngle: -Math.PI / 7,
    angleSpread: 0.48,
    angleStep: 0.2,
    radiusBase: 102,
    radiusEvery: 3,
    radiusStep: 58,
    jitterAngleStep: 1.22,
    jitterBase: 26,
    jitterEvery: 6,
    jitterStep: 28,
    rail: "vertical",
    railOffsetX: 120,
    railColWidth: 210,
    railRowHeight: 82,
    unconnectedBucket: "unconnected-agent",
  },
  prompt: {
    enabled: () => showPrompts.checked,
    includeNode: (n, targetPos) => isPrompt(n) && !targetPos[n.id],
    includeConnected: () => true,
    homeCandidates: workflowHome,
    connectedKey: (home, center) =>
      home?.name ||
      `prompt:${Math.round(center.x / 260)},${Math.round(center.y / 180)}`,
    hashMod: 17,
    fallbackAngle: Math.PI / 5,
    angleSpread: 0.58,
    angleStep: 0.22,
    radiusBase: 138,
    radiusEvery: 3,
    radiusStep: 66,
    jitterAngleStep: 1.18,
    jitterBase: 30,
    jitterEvery: 6,
    jitterStep: 30,
    rail: "horizontal",
    railStartX: 70,
    railOffsetY: 110,
    railColWidth: 220,
    railRowHeight: 84,
    unconnectedBucket: "unconnected-prompt",
  },
};
function positionMcpNodes(targetPos) {
  return positionExternalNodes(targetPos, externalNodeLayouts.mcp);
}
function positionAgentNodes(targetPos) {
  return positionExternalNodes(targetPos, externalNodeLayouts.agent);
}
function positionPromptNodes(targetPos) {
  return positionExternalNodes(targetPos, externalNodeLayouts.prompt);
}

function fallbackLocalLayout(name, rankdir = "LR") {
  const items = currentNodes().filter((n) => n.cluster === name);
  const cols = rankdir === "TB" ? 1 : Math.ceil(Math.sqrt(items.length));
  const den = window.__mapTweaks.density,
    gapX = 32 * den,
    gapY = 17 * den,
    h = Math.round(48 * den),
    colW = Math.round(198 * den);
  const local = new Map();
  let maxX = 0,
    maxY = 0;
  items.forEach((n, i) => {
    const w = naturalWidth(n.label);
    const col = i % cols,
      row = Math.floor(i / cols);
    const x = col * (colW + gapX),
      y = row * (h + gapY);
    local.set(n.id, { x, y, w, h });
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  });
  return {
    local,
    w: maxX + CLUSTER_PAD_X * 2,
    h: maxY + CLUSTER_PAD_TOP + CLUSTER_PAD_BOTTOM,
    count: items.length,
  };
}
function dagreLocalLayout(name, rankdir) {
  if (!window.dagre) return fallbackLocalLayout(name, rankdir);
  const items = currentNodes().filter((n) => n.cluster === name);
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir,
    nodesep: Math.round(26 * window.__mapTweaks.density),
    ranksep: Math.round(60 * window.__mapTweaks.density),
    marginx: 0,
    marginy: 0,
  });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of items) {
    const s = nodeSize(n);
    g.setNode(n.id, { width: s.width, height: s.height });
  }
  for (const e of internalEdges(name)) g.setEdge(e.source, e.target);
  dagre.layout(g);
  const local = new Map();
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const n of items) {
    const s = nodeSize(n);
    const d = g.node(n.id);
    const x = d.x - s.width / 2,
      y = d.y - s.height / 2;
    local.set(n.id, { x, y, w: s.width, h: s.height });
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + s.width);
    maxY = Math.max(maxY, y + s.height);
  }
  for (const p of local.values()) {
    p.x -= minX;
    p.y -= minY;
  }
  return {
    local,
    w: maxX - minX + CLUSTER_PAD_X * 2,
    h: maxY - minY + CLUSTER_PAD_TOP + CLUSTER_PAD_BOTTOM,
    count: items.length,
  };
}
function radialLocalLayout(name) {
  const items = currentNodes().filter((n) => n.cluster === name);
  const local = new Map();
  const maxW = Math.max(...items.map((n) => naturalWidth(n.label)), 150);
  const radius = Math.max(95, items.length * 22);
  const cx = radius + maxW / 2,
    cy = radius + 40;
  items.forEach((n, i) => {
    const s = nodeSize(n);
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / Math.max(1, items.length);
    local.set(n.id, {
      x: cx + Math.cos(angle) * radius - s.width / 2,
      y: cy + Math.sin(angle) * radius - s.height / 2,
      w: s.width,
      h: s.height,
    });
  });
  let maxX = 0,
    maxY = 0;
  for (const p of local.values()) {
    maxX = Math.max(maxX, p.x + p.w);
    maxY = Math.max(maxY, p.y + p.h);
  }
  return {
    local,
    w: maxX + CLUSTER_PAD_X * 2,
    h: maxY + CLUSTER_PAD_TOP + CLUSTER_PAD_BOTTOM,
    count: items.length,
  };
}
function forceLocalLayout(name) {
  const items = currentNodes().filter((n) => n.cluster === name);
  if (!window.d3) return fallbackLocalLayout(name, "LR");
  const simNodes = items.map((n, i) => {
    const s = nodeSize(n);
    const angle = (i * Math.PI * 2) / Math.max(1, items.length);
    return {
      id: n.id,
      width: s.width,
      height: s.height,
      x: Math.cos(angle) * 44,
      y: Math.sin(angle) * 34,
    };
  });
  const links = internalEdges(name).map((e) => ({
    source: e.source,
    target: e.target,
  }));
  const sim = d3
    .forceSimulation(simNodes)
    .force(
      "link",
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance(48)
        .strength(0.82)
    )
    .force("charge", d3.forceManyBody().strength(-45))
    .force(
      "collide",
      d3
        .forceCollide((d) => Math.max(d.width, d.height) / 2 + 12)
        .strength(1)
        .iterations(5)
    )
    .force("x", d3.forceX(0).strength(0.28))
    .force("y", d3.forceY(0).strength(0.28))
    .force("center", d3.forceCenter(0, 0))
    .stop();
  for (let i = 0; i < 320; i++) sim.tick();
  const ordered = [...simNodes].sort((a, b) => a.y - b.y || a.x - b.x);
  const cols = items.length <= 3 ? 1 : items.length <= 5 ? 2 : 3;
  const den = window.__mapTweaks.density,
    gapX = 28 * den,
    gapY = 17 * den,
    rowH = Math.round(48 * den);
  const colWidths = Array.from({ length: cols }, (_, col) =>
    Math.max(
      150,
      ...ordered.filter((_, i) => i % cols === col).map((d) => d.width)
    )
  );
  const colX = [];
  let runX = 0;
  for (let i = 0; i < cols; i++) {
    colX[i] = runX;
    runX += colWidths[i] + gapX;
  }
  const local = new Map();
  let maxX = 0,
    maxY = 0;
  ordered.forEach((d, i) => {
    const col = i % cols,
      row = Math.floor(i / cols);
    const x = colX[col],
      y = row * (rowH + gapY);
    local.set(d.id, { x, y, w: d.width, h: d.height });
    maxX = Math.max(maxX, x + d.width);
    maxY = Math.max(maxY, y + d.height);
  });
  return {
    local,
    w: maxX + CLUSTER_PAD_X * 2,
    h: maxY + CLUSTER_PAD_TOP + CLUSTER_PAD_BOTTOM,
    count: items.length,
  };
}
function computeManualLayout() {
  pos = structuredClone(data.positions);
  clusters = data.clusters.filter(
    (c) => !["MCP Servers", "Agents", "Prompts"].includes(c.name)
  );
  canvas = { width: 2078, height: 1566 };
  const mcpBounds = positionMcpNodes(pos);
  const agentBounds = positionAgentNodes(pos);
  const promptBounds = positionPromptNodes(pos);
  canvas = {
    width: Math.max(
      canvas.width,
      mcpBounds.width,
      agentBounds.width,
      promptBounds.width
    ),
    height: Math.max(
      canvas.height,
      mcpBounds.height,
      agentBounds.height,
      promptBounds.height
    ),
  };
  layoutNote.textContent = "manual embedded layout";
}
function computeLibraryLayout(mode) {
  if (mode === "manual") {
    computeManualLayout();
    return;
  }
  const localLayouts = new Map();
  for (const name of currentClusterNames()) {
    if (mode === "radial") localLayouts.set(name, radialLocalLayout(name));
    else if (mode === "force") localLayouts.set(name, forceLocalLayout(name));
    else
      localLayouts.set(
        name,
        dagreLocalLayout(name, mode === "dagre-tb" ? "TB" : "LR")
      );
  }
  const arranged = arrangeClusterBoxes(localLayouts);
  const newPos = {};
  for (const [name, layout] of localLayouts) {
    const off = arranged.offsets.get(name);
    for (const [id, p] of layout.local)
      newPos[id] = { x: p.x + off.x, y: p.y + off.y, w: p.w, h: p.h };
  }
  clusters = arranged.clusters;
  const mcpBounds = positionMcpNodes(newPos);
  const agentBounds = positionAgentNodes(newPos);
  const promptBounds = positionPromptNodes(newPos);
  pos = newPos;
  canvas = {
    width: Math.max(
      arranged.width,
      mcpBounds.width,
      agentBounds.width,
      promptBounds.width
    ),
    height: Math.max(
      arranged.height,
      mcpBounds.height,
      agentBounds.height,
      promptBounds.height
    ),
  };
  layoutNote.textContent = mode.startsWith("dagre")
    ? window.dagre
      ? "using @dagrejs/dagre"
      : "Dagre unavailable: fallback"
    : mode === "force"
      ? window.d3
        ? "using d3-force"
        : "D3 unavailable: fallback"
      : "built-in radial layout";
}
function anchor(a, b) {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 },
    bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = bc.x - ac.x,
    dy = bc.y - ac.y;
  if (Math.abs(dx) > Math.abs(dy))
    return dx > 0 ? [a.x + a.w, ac.y, b.x, bc.y] : [a.x, ac.y, b.x + b.w, bc.y];
  return dy > 0 ? [ac.x, a.y + a.h, bc.x, b.y] : [ac.x, a.y, bc.x, b.y + b.h];
}
function edgePoints(e) {
  const a = pos[e.source],
    b = pos[e.target];
  if (!a || !b) return null;
  const [sx, sy, tx, ty] = anchor(a, b);
  return { a, b, sx, sy, tx, ty, source: e.source, target: e.target };
}
function pathFor(e) {
  const ep = edgePoints(e);
  if (!ep) return "";
  const wiring = window.__mapTweaks.wiring;
  if (wiring === "straight") return `M${ep.sx},${ep.sy} L${ep.tx},${ep.ty}`;
  if (wiring === "circuit") {
    if (Math.abs(ep.tx - ep.sx) < 2 || Math.abs(ep.ty - ep.sy) < 2)
      return `M${ep.sx},${ep.sy} L${ep.tx},${ep.ty}`;
    const midx = (ep.sx + ep.tx) / 2,
      midy = (ep.sy + ep.ty) / 2;
    if (Math.abs(ep.tx - ep.sx) >= Math.abs(ep.ty - ep.sy))
      return `M${ep.sx},${ep.sy} L${midx},${ep.sy} L${midx},${ep.ty} L${ep.tx},${ep.ty}`;
    return `M${ep.sx},${ep.sy} L${ep.sx},${midy} L${ep.tx},${midy} L${ep.tx},${ep.ty}`;
  }
  const same =
    nodeById.get(ep.source).cluster === nodeById.get(ep.target).cluster;
  if (same) {
    const dx = Math.max(35, Math.abs(ep.tx - ep.sx) * 0.45);
    return `M${ep.sx},${ep.sy} C${ep.sx + dx},${ep.sy} ${ep.tx - dx},${ep.ty} ${ep.tx},${ep.ty}`;
  }
  const midx = (ep.sx + ep.tx) / 2;
  return `M${ep.sx},${ep.sy} C${midx},${ep.sy} ${midx},${ep.ty} ${ep.tx},${ep.ty}`;
}
function labelPointFor(e) {
  const ep = edgePoints(e);
  if (!ep) return { x: 0, y: 0 };
  return { x: (ep.sx + ep.tx) / 2, y: (ep.sy + ep.ty) / 2 - 6 };
}
function selectedCluster() {
  return selected?.startsWith("cluster:") ? selected.slice(8) : null;
}
function connectedSet(id) {
  const s = new Set([id]);
  currentEdges().forEach((e) => {
    if (e.source === id) s.add(e.target);
    if (e.target === id) s.add(e.source);
  });
  return s;
}
function nodeMatchesSearch(n, q) {
  if (!q) return true;
  const hay = [
    n.label,
    n.cluster,
    n.path,
    n.summary,
    n.mcp?.type,
    n.mcp?.url,
    n.mcp?.command,
    n.mcp?.argsSummary,
    n.agent?.model,
    n.agent?.reasoning,
    (n.agent?.targets || []).join(" "),
    (n.agent?.sections || []).join(" "),
    n.prompt?.category,
    n.prompt?.heading,
    (n.prompt?.sections || []).join(" "),
    (n.prompt?.references || []).join(" "),
    (n.aliases || []).join(" "),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}
function selectNode(id) {
  selected = selected === id ? null : id;
  search.value = "";
  render();
  renderDetails(selected);
}
function selectCluster(name) {
  selected = selected === `cluster:${name}` ? null : `cluster:${name}`;
  search.value = "";
  render();
  renderDetails(selected);
}
function clearSelection(resetSearch = false) {
  selected = null;
  if (resetSearch) search.value = "";
  render();
  renderDetails(null);
}
function updateCounts() {
  const nodes = currentNodes();
  const skillN = nodes.filter(isWorkflow).length;
  const agentN = nodes.filter(isAgent).length;
  const mcpN = nodes.filter(isMcp).length;
  const promptN = nodes.filter(isPrompt).length;
  const edges = currentEdges();
  const uses = edges.filter((e) => isMcpEdgeKind(e.kind)).length;
  const agentRefs = edges.filter((e) => isAgentEdgeKind(e.kind)).length;
  const promptRefs = edges.filter((e) => isPromptEdgeKind(e.kind)).length;
  skillCount.textContent = showSkills.checked
    ? `${skillN} skills`
    : "skills hidden";
  agentCount.textContent = showAgents.checked
    ? `${agentN} agents`
    : "agents hidden";
  promptCount.textContent = showPrompts.checked
    ? `${promptN} prompts`
    : "prompts hidden";
  mcpCount.textContent = showMcp.checked ? `${mcpN} MCP servers` : "MCP hidden";
  edgeCount.textContent = `${edges.length} edges (${uses} MCP, ${agentRefs} agent, ${promptRefs} prompt)`;
  clusterCount.textContent = showClusters.checked
    ? `${clusters.length} clusters`
    : "clusters hidden";
}
function render() {
  updateCounts();
  const q = search.value.trim().toLowerCase();
  const csel = showClusters.checked ? selectedCluster() : null;
  const focus = selected && !csel ? connectedSet(selected) : null;
  const searchHits = q
    ? new Set(
        currentNodes()
          .filter((n) => nodeMatchesSearch(n, q))
          .map((n) => n.id)
      )
    : null;
  svg.setAttribute("viewBox", `0 0 ${canvas.width} ${canvas.height}`);
  applyCanvasSize();
  svg.innerHTML =
    '<defs><marker id="arrow-default" viewBox="0 0 12 12" markerWidth="7" markerHeight="7" refX="10" refY="6" orient="auto" markerUnits="strokeWidth"><path d="M2 2 L10 6 L2 10" fill="none" style="stroke:var(--arrow-default)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></marker><marker id="arrow-handoff" viewBox="0 0 12 12" markerWidth="7" markerHeight="7" refX="10" refY="6" orient="auto" markerUnits="strokeWidth"><path d="M2 2 L10 6 L2 10" fill="none" style="stroke:var(--handoff)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></marker><marker id="arrow-mcp" viewBox="0 0 12 12" markerWidth="7" markerHeight="7" refX="10" refY="6" orient="auto" markerUnits="strokeWidth"><path d="M2 2 L10 6 L2 10" fill="none" style="stroke:var(--mcp-line)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></marker><marker id="arrow-agent" viewBox="0 0 12 12" markerWidth="7" markerHeight="7" refX="10" refY="6" orient="auto" markerUnits="strokeWidth"><path d="M2 2 L10 6 L2 10" fill="none" style="stroke:var(--agent-line)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></marker><marker id="arrow-prompt" viewBox="0 0 12 12" markerWidth="7" markerHeight="7" refX="10" refY="6" orient="auto" markerUnits="strokeWidth"><path d="M2 2 L10 6 L2 10" fill="none" style="stroke:var(--prompt-line)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></marker><marker id="arrow-active" viewBox="0 0 12 12" markerWidth="7" markerHeight="7" refX="10" refY="6" orient="auto" markerUnits="strokeWidth"><path d="M2 2 L10 6 L2 10" fill="none" style="stroke:var(--active)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></marker></defs>';
  const clusterLayer = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "g"
  );
  svg.appendChild(clusterLayer);
  if (showClusters.checked)
    for (const c of clusters) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "cluster");
      if (csel === c.name) g.classList.add("active");
      if (
        searchHits &&
        !currentNodes().some(
          (n) => n.cluster === c.name && searchHits.has(n.id)
        )
      )
        g.classList.add("dim");
      g.style.setProperty("--cf", shade(c.name, "cf"));
      g.style.setProperty("--cs", shade(c.name, "cs"));
      g.style.setProperty("--ct", shade(c.name, "ct"));
      const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      r.setAttribute("x", c.x);
      r.setAttribute("y", c.y);
      r.setAttribute("width", c.w);
      r.setAttribute("height", c.h);
      g.appendChild(r);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", c.x + 18);
      t.setAttribute("y", c.y + 28);
      t.textContent = c.name;
      g.appendChild(t);
      g.addEventListener("click", (ev) => {
        ev.stopPropagation();
        selectCluster(c.name);
      });
      clusterLayer.appendChild(g);
    }
  const edgeLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.appendChild(edgeLayer);
  for (const e of currentEdges()) {
    const s = nodeById.get(e.source),
      t = nodeById.get(e.target);
    const type = edgeType(e.kind);
    const category = edgeCategory(e.kind);
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "edge");
    if (category && category !== "dependency") g.classList.add(category);
    if (searchHits && !searchHits.has(e.source) && !searchHits.has(e.target))
      g.classList.add("dim");
    if (selected && !csel && e.source !== selected && e.target !== selected)
      g.classList.add("dim");
    if (csel && s.cluster !== csel && t.cluster !== csel)
      g.classList.add("dim");
    const activeEdge =
      (!csel && selected && (e.source === selected || e.target === selected)) ||
      (csel && (s.cluster === csel || t.cluster === csel));
    if (activeEdge) g.classList.add("active");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", pathFor(e));
    p.setAttribute(
      "marker-end",
      `url(#${activeEdge ? "arrow-active" : edgeMarker(e.kind)})`
    );
    g.appendChild(p);
    if (type.inlineLabel) {
      const lp = labelPointFor(e);
      const text = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      text.setAttribute("x", lp.x);
      text.setAttribute("y", lp.y);
      text.textContent = type.inlineLabel;
      g.appendChild(text);
    }
    edgeLayer.appendChild(g);
  }
  const nodeLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.appendChild(nodeLayer);
  for (const n of currentNodes()) {
    const p = pos[n.id];
    if (!p) continue;
    const match = nodeMatchesSearch(n, q);
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute(
      "class",
      isMcp(n)
        ? "node mcpNode"
        : isAgent(n)
          ? "node agentNode"
          : isPrompt(n)
            ? "node promptNode"
            : "node"
    );
    if (isWorkflow(n)) g.style.setProperty("--ns", shade(n.cluster, "ns"));
    g.dataset.id = n.id;
    g.setAttribute("transform", `translate(${p.x},${p.y})`);
    g.setAttribute("role", "button");
    g.setAttribute("tabindex", "0");
    if (q && !match) g.classList.add("dim");
    if (selected && !csel && !focus.has(n.id)) g.classList.add("dim");
    if (csel && n.cluster !== csel) g.classList.add("dim");
    if (selected === n.id) g.classList.add("active");
    const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    r.setAttribute("width", p.w);
    r.setAttribute("height", p.h);
    g.appendChild(r);
    lineWrap(n.label, Math.max(14, Math.floor((p.w - 24) / 7))).forEach(
      (line, i) => {
        const text = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "text"
        );
        text.setAttribute("x", 12);
        text.setAttribute("y", 16 + i * 12);
        text.textContent = line;
        g.appendChild(text);
      }
    );
    const alias = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text"
    );
    alias.setAttribute("class", "alias");
    alias.setAttribute("x", 12);
    alias.setAttribute("y", p.h - 7);
    alias.textContent = isMcp(n)
      ? mcpTransportLabel(n.mcp)
      : isAgent(n)
        ? `agent · ${cleanAgentModel(n.agent?.model) || "default"}`
        : isPrompt(n)
          ? `prompt · ${n.prompt?.category || "repo"}`
          : (n.aliases || [])[0] || "skill";
    g.appendChild(alias);
    g.addEventListener("click", (ev) => {
      ev.stopPropagation();
      selectNode(n.id);
    });
    g.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        selectNode(n.id);
      }
    });
    nodeLayer.appendChild(g);
  }
}
function fileLink(p) {
  if (!p) return "";
  const srcBase = (data.meta && data.meta.sourceUrlBase) || "";
  const href = srcBase ? srcBase.replace(/\/$/, "") + "/" + encodeURI(p) : "";
  return href
    ? `<a href="${href}" target="_blank" rel="noopener"><code>${esc(p)}</code></a>`
    : `<code>${esc(p)}</code>`;
}
function edgeItem(e, dir) {
  const other = nodeById.get(dir === "out" ? e.target : e.source);
  const type = edgeType(e.kind);
  const verb =
    dir === "out"
      ? type.outLabel || EDGE_TYPE_FALLBACK.outLabel
      : type.inLabel || EDGE_TYPE_FALLBACK.inLabel;
  const label = e.label
    ? `<br><span class="muted">${esc(e.label)} · ${esc(other.cluster)}</span>`
    : `<br><span class="muted">${esc(e.kind)} · ${esc(other.cluster)}</span>`;
  const evidence = e.evidence
    ? `<br><span class="muted">${esc(e.evidence)}</span>`
    : "";
  return `<li><b>${verb}</b> <button class="linkBtn" data-id="${esc(other.id)}">${esc(other.label)}</button>${label}${evidence}</li>`;
}
function renderContributors(n) {
  const items = n.contributors || [];
  if (!items.length)
    return '<p class="muted">No git history found for this source definition.</p>';
  return `<ul class="contributors">${items.map((c) => `<li><img class="avatar" src="${esc(avatarSrc(c.avatar))}" alt=""><div><div class="contribName">${esc(c.login)}</div><div class="contribSub">${esc(c.name || "")}${c.source === "git-fallback" ? " · git fallback" : ""}</div></div><div class="changes">${c.changes} changes</div></li>`).join("")}</ul>`;
}
function renderHistory(n) {
  const h = n.history || {};
  return `<div class="metaGrid"><div class="metaBox"><b>${esc(h.uniqueCommits ?? 0)}</b><span>unique commits</span></div><div class="metaBox"><b>${esc(h.firstCommit || "n/a")}</b><span>first seen</span></div><div class="metaBox"><b>${esc(h.lastUpdated || "n/a")}</b><span>last updated</span></div><div class="metaBox"><b>${esc(h.ageDays ?? "n/a")}</b><span>days old</span></div></div>`;
}
function renderCommands(n) {
  const cmds = n.commands || [];
  if (!cmds.length)
    return '<p class="muted">No folded slash command for this skill.</p>';
  return `<ul class="plainList">${cmds.map((c) => `<li><b>${esc(c.name)}</b><br>${esc(c.description)}<br><span class="muted">${esc(c.path)}</span></li>`).join("")}</ul>`;
}
function renderSkillDetails(id) {
  const n = nodeById.get(id);
  const edges = currentEdges();
  const out = edges.filter((e) => e.source === id);
  const inc = edges.filter((e) => e.target === id);
  details.innerHTML = `<h3>${esc(n.label)}</h3><span class="pill">${esc(n.cluster)}</span>${(n.aliases || []).length ? `<p><b>Aliases:</b> ${esc(n.aliases.join(", "))}</p>` : ""}<p>${fileLink(n.path)}</p><p class="summary">${esc(n.summary || n.description || "No summary available.")}</p><h4>Command aliases</h4>${renderCommands(n)}<h4>Definition history</h4>${renderHistory(n)}<h4>Top contributors</h4>${renderContributors(n)}<h4>Outbound (${out.length})</h4><ul class="edgeList">${out.length ? out.map((e) => edgeItem(e, "out")).join("") : '<li class="muted">None.</li>'}</ul><h4>Inbound (${inc.length})</h4><ul class="edgeList">${inc.length ? inc.map((e) => edgeItem(e, "in")).join("") : '<li class="muted">None.</li>'}</ul>`;
  details.querySelectorAll("button[data-id]").forEach((b) => {
    b.addEventListener("click", () => {
      selectNode(b.dataset.id);
    });
  });
}
function renderAgentDetails(id) {
  const n = nodeById.get(id);
  const edges = currentEdges();
  const out = edges.filter((e) => e.source === id);
  const inc = edges.filter((e) => e.target === id);
  const a = n.agent || {};
  const firstDocs = (a.firstDocs || []).length
    ? `<h4>First-step docs</h4><ul class="plainList">${a.firstDocs.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>`
    : "";
  const sections = (a.sections || []).length
    ? `<h4>Key sections</h4><ul class="plainList">${a.sections.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`
    : "";
  details.innerHTML = `<h3>${esc(n.label)}</h3><span class="pill">agent</span><span class="pill">${esc(cleanAgentModel(a.model) || "default")}</span><span class="pill">${esc(a.reasoning || "default")}</span><p>${fileLink(n.path)}</p><p class="summary">${esc(n.summary || n.description || "No summary available.")}</p><div class="metaGrid"><div class="metaBox"><b>${esc((a.targets || []).join(", ") || "default")}</b><span>targets</span></div><div class="metaBox"><b>${esc(a.memory || "default")}</b><span>memory</span></div></div>${firstDocs}${sections}<h4>Definition history</h4>${renderHistory(n)}<h4>Top contributors</h4>${renderContributors(n)}<h4>Outbound (${out.length})</h4><ul class="edgeList">${out.length ? out.map((e) => edgeItem(e, "out")).join("") : '<li class="muted">None.</li>'}</ul><h4>Inbound (${inc.length})</h4><ul class="edgeList">${inc.length ? inc.map((e) => edgeItem(e, "in")).join("") : '<li class="muted">None.</li>'}</ul>`;
  details.querySelectorAll("button[data-id]").forEach((b) => {
    b.addEventListener("click", () => {
      selectNode(b.dataset.id);
    });
  });
}
function renderPromptDetails(id) {
  const n = nodeById.get(id);
  const edges = currentEdges();
  const out = edges.filter((e) => e.source === id);
  const inc = edges.filter((e) => e.target === id);
  const p = n.prompt || {};
  const sections = (p.sections || []).length
    ? `<h4>Key sections</h4><ul class="plainList">${p.sections.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`
    : "";
  const refs = (p.references || []).length
    ? `<h4>Referenced by repo files</h4><ul class="plainList">${p.references.map((r) => `<li>${fileLink(r)}</li>`).join("")}</ul>`
    : '<p class="muted">No explicit repo file references found outside the prompt itself.</p>';
  details.innerHTML = `<h3>${esc(n.label)}</h3><span class="pill">prompt</span><span class="pill">${esc(p.category || "repo")}</span><p>${fileLink(n.path)}</p><p class="summary">${esc(n.summary || n.description || "No summary available.")}</p><div class="metaGrid"><div class="metaBox"><b>${esc((p.references || []).length)}</b><span>repo references</span></div><div class="metaBox"><b>${esc((p.sections || []).length)}</b><span>sections</span></div></div>${sections}<h4>Definition history</h4>${renderHistory(n)}<h4>Top contributors</h4>${renderContributors(n)}<h4>Referenced by repo files</h4>${refs}<h4>Outbound (${out.length})</h4><ul class="edgeList">${out.length ? out.map((e) => edgeItem(e, "out")).join("") : '<li class="muted">None.</li>'}</ul><h4>Inbound (${inc.length})</h4><ul class="edgeList">${inc.length ? inc.map((e) => edgeItem(e, "in")).join("") : '<li class="muted">None.</li>'}</ul>`;
  details.querySelectorAll("button[data-id]").forEach((b) => {
    b.addEventListener("click", () => {
      selectNode(b.dataset.id);
    });
  });
}
function renderMcpDetails(id) {
  const n = nodeById.get(id);
  const m = n.mcp || {};
  const inc = currentEdges().filter((e) => e.target === id);
  const endpoint = m.url || m.argsSummary || m.command || "n/a";
  const toolCount = m.toolCountLabel || m.toolCount || "unknown";
  details.innerHTML = `<h3>${esc(n.label)}</h3><span class="pill">MCP server</span><span class="pill">${esc(mcpTransportLabel(m))}</span><p>${fileLink(n.path)}</p><p class="summary">${esc(n.summary || "No summary available.")}</p><div class="metaGrid"><div class="metaBox"><b>${inc.length}</b><span>skills using it</span></div><div class="metaBox"><b>${esc(toolCount)}</b><span>known tools exposed</span></div><div class="metaBox"><b>${m.configured ? "yes" : "no"}</b><span>configured</span></div></div><h4>Endpoint / command</h4><ul class="plainList"><li>${esc(endpoint)}</li></ul><h4>Inbound uses (${inc.length})</h4><ul class="edgeList">${inc.length ? inc.map((e) => edgeItem(e, "in")).join("") : '<li class="muted">No explicit skill uses found.</li>'}</ul>`;
  details.querySelectorAll("button[data-id]").forEach((b) => {
    b.addEventListener("click", () => {
      selectNode(b.dataset.id);
    });
  });
}
function renderClusterDetails(name) {
  const c = clusterByName.get(name);
  const members = currentNodes().filter((n) => n.cluster === name);
  const skillMembers = members.filter(isWorkflow);
  const promptMembers = members.filter(isPrompt);
  const agentMembers = members.filter(isAgent);
  const commandCount = members.reduce(
    (sum, n) => sum + (n.commands || []).length,
    0
  );
  details.innerHTML = `<h3>${esc(name)}</h3><span class="pill">cluster</span><p class="summary">${esc(c?.summary || "No cluster summary available.")}</p><div class="metaGrid"><div class="metaBox"><b>${members.length}</b><span>items</span></div><div class="metaBox"><b>${skillMembers.length}</b><span>skills</span></div><div class="metaBox"><b>${promptMembers.length}</b><span>prompts</span></div><div class="metaBox"><b>${agentMembers.length}</b><span>agents</span></div><div class="metaBox"><b>${commandCount}</b><span>commands</span></div></div><h4>Member items</h4><ul class="plainList">${members.map((n) => `<li><button class="linkBtn" data-id="${esc(n.id)}">${esc(n.label)}</button><br><span class="muted">${esc(isPrompt(n) ? "prompt" : isAgent(n) ? "agent" : isMcp(n) ? "MCP server" : "skill")}</span><br>${esc(n.summary || n.description || "")}</li>`).join("")}</ul>`;
  details.querySelectorAll("button[data-id]").forEach((b) => {
    b.addEventListener("click", () => {
      selectNode(b.dataset.id);
    });
  });
}
function renderDetails(sel) {
  if (!sel) {
    details.innerHTML =
      '<p class="muted">Click a skill, agent, prompt, or MCP server to inspect summaries, contributors, and dependencies. Click a cluster box to inspect its member items.</p>';
    return;
  }
  if (sel.startsWith("cluster:")) renderClusterDetails(sel.slice(8));
  else if (isMcp(nodeById.get(sel))) renderMcpDetails(sel);
  else if (isAgent(nodeById.get(sel))) renderAgentDetails(sel);
  else if (isPrompt(nodeById.get(sel))) renderPromptDetails(sel);
  else renderSkillDetails(sel);
}
function relayout() {
  if (
    selected &&
    !currentNodeIds().has(selected) &&
    !String(selected).startsWith("cluster:")
  )
    selected = null;
  computeLibraryLayout(selectedLayoutMode());
  render();
  renderDetails(selected);
}
function startPan(ev) {
  if (ev.button !== 0 || ev.target !== svg) return;
  panState = { x: ev.clientX, y: ev.clientY, panX, panY, moved: false };
  graphWrap.classList.add("grabbing");
  ev.preventDefault();
}
function movePan(ev) {
  if (!panState) return;
  const dx = ev.clientX - panState.x,
    dy = ev.clientY - panState.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) panState.moved = true;
  panX = panState.panX + dx;
  panY = panState.panY + dy;
  applyViewportTransform();
}
function endPan() {
  if (!panState) return;
  suppressNextBlankClick = panState.moved;
  panState = null;
  graphWrap.classList.remove("grabbing");
}
function wheelZoom(ev) {
  ev.preventDefault();
  const unit =
    ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? graphWrap.clientHeight : 1;
  const delta = ev.deltaY * unit;
  const factor = Math.exp(-delta * 0.0015);
  setZoomAt(zoom * factor, ev.clientX, ev.clientY);
}
search.addEventListener("input", () => {
  selected = null;
  render();
  renderDetails(null);
});
layoutModes.forEach((input) => {
  input.addEventListener("change", () => {
    selected = null;
    relayout();
  });
});
zoomOut.addEventListener("click", () => setZoom(zoom / 1.2));
zoomIn.addEventListener("click", () => setZoom(zoom * 1.2));
zoomFit.addEventListener("click", () => fitZoom());
showSkills.addEventListener("change", () => {
  selected = null;
  relayout();
});
showAgents.addEventListener("change", () => {
  selected = null;
  relayout();
});
showPrompts.addEventListener("change", () => {
  selected = null;
  relayout();
});
showMcp.addEventListener("change", () => {
  selected = null;
  relayout();
});
showClusters.addEventListener("change", () => {
  if (selectedCluster()) selected = null;
  render();
  renderDetails(selected);
});
graphWrap.addEventListener("wheel", wheelZoom, { passive: false });
svg.addEventListener("mousedown", startPan);
window.addEventListener("mousemove", movePan);
window.addEventListener("mouseup", endPan);
svg.addEventListener("click", (ev) => {
  if (suppressNextBlankClick) {
    suppressNextBlankClick = false;
    return;
  }
  if (selected && ev.target === svg) clearSelection();
});
document
  .getElementById("reset")
  .addEventListener("click", () => clearSelection(true));
const detailPanel = document.querySelector(".detailPanel");
const panelToggle = document.getElementById("panelToggle");
function setPanelCollapsed(c) {
  detailPanel.classList.toggle("collapsed", c);
  panelToggle.textContent = c ? "\u2039" : "\u203A";
  panelToggle.setAttribute("aria-expanded", String(!c));
  try {
    localStorage.setItem("sdm-panel", c ? "closed" : "open");
  } catch (_e) {}
}
panelToggle.addEventListener("click", () =>
  setPanelCollapsed(!detailPanel.classList.contains("collapsed"))
);
let savedPanel = "open";
try {
  savedPanel = localStorage.getItem("sdm-panel") || "open";
} catch (_e) {}
setPanelCollapsed(savedPanel === "closed");
function reflectTheme(t) {
  themeButtons.forEach((b) => {
    b.classList.toggle("on", b.dataset.theme === t);
  });
}
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  reflectTheme(t);
  try {
    localStorage.setItem("sdm-theme", t);
  } catch (_e) {}
  render();
}
themeButtons.forEach((b) => {
  b.addEventListener("click", () => applyTheme(b.dataset.theme));
});
let savedTheme = "light";
try {
  savedTheme = localStorage.getItem("sdm-theme") || "light";
} catch (_e) {}
document.documentElement.dataset.theme = savedTheme;
reflectTheme(savedTheme);
relayout();
