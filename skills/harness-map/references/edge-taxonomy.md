# Edge taxonomy

Every edge kind, and when the inferring agent should emit it. Only kinds present in
`assets/edge-types.json` are valid; `validate.mjs` rejects anything else.

| kind | source → target | Emit when the source's text... |
|---|---|---|
| `uses` | workflow → workflow | names another skill as a dependency or required sub-step |
| `handoff` | workflow → workflow | tells the user/agent to run another skill NEXT (sequential pipeline) |
| `references-skill` | any → workflow | mentions a skill informationally without invoking it |
| `delegates` | workflow/agent → agent | dispatches work to a named agent identity |
| `uses-agent` | workflow → agent | instructs spawning that agent as the executor persona |
| `uses-mcp` | any → mcp | calls tools from that MCP server (match tool prefixes and server names) |
| `uses-prompt` | any → prompt | loads or embeds a prompt document |
| `references-prompt` | any → prompt | mentions a prompt document informationally |
| `prompt-uses-agent` | prompt → agent | a prompt document instructs use of an agent |
| `prompt-uses-mcp` | prompt → mcp | a prompt document instructs use of an MCP server |
| `prompt-references-skill` | prompt → workflow | a prompt document references or mentions a skill |

Rules:
- Prefer the most specific kind (`handoff` over `uses`, `delegates` over `references-skill`).
- One edge per (source, target, kind); raise `weight` instead of duplicating.
- No edge without evidence you can quote. If you cannot point at the line, do not emit the edge.
- Do not invent nodes: edges may only connect ids present in `nodes`.
