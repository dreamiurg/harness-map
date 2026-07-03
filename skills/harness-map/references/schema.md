# graph.json schema (v1)

The contract between the scanning script, the inferring agent, and the build script.
`scan.mjs` emits `scan.json` (facts). The agent transforms it into `graph.json` (facts + judgment).
`validate.mjs` enforces this document. `build.mjs` consumes it.

## Top level

| Field | Type | Author | Notes |
|---|---|---|---|
| `schemaVersion` | `1` | agent (copy from scan.json) | required |
| `meta` | object | scan → agent may edit `title` | required |
| `nodes` | array | scan facts + agent judgment fields | required, ≥1 |
| `edges` | array | agent | required (may be empty) |
| `clusters` | array | agent, optional | v1: usually `[]` |

`stats`, `edgeTypes`, and `positions` are injected by `build.mjs` — the agent MUST NOT author them.

## meta

```json
{
  "title": "comms-center Harness Map",
  "repoName": "comms-center",
  "sourceUrlBase": "https://github.com/dreamiurg/comms-center/blob/main/",
  "generatedAt": "2026-07-03T00:00:00Z",
  "generator": "harness-map@0.1.0"
}
```

`sourceUrlBase` may be `""` when the repo has no remote — source links degrade to plain text.

## Node

```json
{
  "id": "workflow:daily-brief",
  "kind": "workflow",
  "label": "daily-brief",
  "path": ".claude/skills/daily-brief.md",
  "description": "<from frontmatter, may be empty>",
  "summary": "<agent-written one-liner, required>",
  "aliases": [],
  "cluster": "Briefings",
  "commands": [{ "name": "daily-briefing", "description": "...", "path": ".claude/commands/daily-briefing.md" }],
  "history": { "sourceFiles": ["..."], "totalChanges": 4, "uniqueCommits": 4, "firstCommit": "2026-01-01", "lastUpdated": "2026-06-01", "ageDays": 183 },
  "contributors": [{ "name": "Dmytro Gaivoronsky", "email": "x@y.z", "changes": 4 }]
}
```

- `id` = `<kind>:<slug>`; unique across the file.
- `kind` ∈ `workflow` | `agent` | `mcp` | `prompt`. Skills and standalone commands are both `workflow`
  (a command whose name matches a skill is folded into that skill's `commands[]` instead).
- `history`/`contributors` may be `null` (non-git repo or lookup failure).
- Agent-authored fields on every node: `summary` (required), `cluster` (optional string).
  Workflow nodes left without a `cluster` are assigned to a synthesized `"Workflows"`
  cluster by `build.mjs` (with a matching entry appended to `clusters`) so the renderer's
  cluster-box layout has somewhere to place them — the agent does not need to invent
  cluster names for a simple graph.
- Kind-specific sub-objects (facts, from scan): `agent: {model?, targets?}` on agent nodes;
  `mcp: {name, type, command?, url?, argsSummary?}` on mcp nodes.

## Edge

```json
{
  "source": "workflow:daily-brief",
  "target": "agent:mail-expert",
  "kind": "delegates",
  "evidence": [".claude/skills/daily-brief.md"],
  "weight": 1
}
```

- `source`/`target` MUST be existing node ids.
- `kind` MUST be a key of `assets/edge-types.json` (see edge-taxonomy.md).
- `evidence` MUST list ≥1 repo-relative path that exists; it is the file whose text justifies the edge.

## Cluster (optional, v1 rarely used)

```json
{ "name": "Briefings", "summary": "...", "members": [{ "id": "workflow:daily-brief", "label": "daily-brief", "summary": "..." }] }
```

Layout boxes (`x/y/w/h`) are NOT authored in v1; the renderer's dagre/force layouts are used.
