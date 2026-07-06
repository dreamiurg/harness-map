# harness-map
[![CI](https://github.com/dreamiurg/harness-map/actions/workflows/ci.yml/badge.svg)](https://github.com/dreamiurg/harness-map/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/dreamiurg/harness-map/graph/badge.svg)](https://codecov.io/gh/dreamiurg/harness-map)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![skills.sh](https://skills.sh/b/dreamiurg/harness-map)](https://skills.sh/dreamiurg/harness-map)

An [Agent Skill](https://agentskills.io) that generates a **self-contained, interactive HTML
dependency map** of a repository's AI harness: skills, commands, agents, and MCP servers —
which skills hand off to which, which agents they delegate to, which MCP servers everything uses.

![Example: superpowers harness map](examples/superpowers.png)

*(Generated from the public [obra/superpowers](https://github.com/obra/superpowers) repo —
14 skills, 22 evidence-backed edges, auto-clustered.
Interactive version: [examples/superpowers.html](examples/superpowers.html).)*

Deterministic scripts scan the repo and build the HTML; the invoking agent does the one thing
scripts can't — reading each skill/agent body and inferring typed, evidence-backed dependency edges.

## Install

    npx skills add dreamiurg/harness-map

This installs the skill to `.agents/skills/harness-map/` in your project — the shared
location read by Claude Code, Codex, Cursor, and other Agent-Skills-compatible tools.

Or as a Claude Code plugin:

    /plugin marketplace add dreamiurg/harness-map
    /plugin install harness-map@harness-map-marketplace

## Use

Ask your agent: "map my AI harness" or invoke `/harness-map`. Output: `harness-map.html`
(single file, fully offline, open in any browser).

## Quickstart for agents

If you are a coding agent (Claude Code, Codex, Cursor, ...) whose human asked you to set
this up, do this — verified to work on a clean machine with only Node ≥ 20 and git:

1. From the root of the repository you want to map:

       npx -y skills add dreamiurg/harness-map -y

   The CLI detects agent environments and runs non-interactively. The skill lands in
   `.agents/skills/harness-map/`.

2. Generate the map now — do not wait for a new session to pick the skill up. Read
   `.agents/skills/harness-map/SKILL.md` and execute its four phases directly:
   **scan** (run the script) → **infer edges** (your judgment; every edge needs a quotable
   line of evidence) → **validate** (run the script, fix `graph.json` until it prints `OK`)
   → **build** (run the script).

3. Report to your human: the path to `harness-map.html`, node/edge counts, and 2–3
   notable findings (orphan skills, the most-depended-on agent, unused MCP servers).
   Delete `harness-map-work/` or gitignore it — only the HTML is the deliverable.

## License

MIT
