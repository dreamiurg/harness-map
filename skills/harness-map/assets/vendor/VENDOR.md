# Vendored libraries — provenance

Both files are byte-identical copies of official published npm dist builds. No
modifications of any kind. Verify at any time:

| File | Package | Source | SHA-256 |
|------|---------|--------|---------|
| `vendor-0.js` | `@dagrejs/dagre@1.1.4` | https://cdn.jsdelivr.net/npm/@dagrejs/dagre@1.1.4/dist/dagre.min.js | `2cde82baf0b9232c00aa13932945ff92a17fb08c6885a635592330a4c2c567c5` |
| `vendor-1.js` | `d3@7.9.0` | https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js | `f2094bbf6141b359722c4fe454eb6c4b0f0e42cc10cc7af921fc158fceb86539` |

```bash
shasum -a 256 vendor-0.js vendor-1.js
curl -sL https://cdn.jsdelivr.net/npm/@dagrejs/dagre@1.1.4/dist/dagre.min.js | shasum -a 256
curl -sL https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js | shasum -a 256
```

Why vendored at all: generated maps are single-file, fully offline HTML — `build.mjs`
inlines these files as `data:` URI script tags so the output loads with no network
access and no CDN dependency. The files are used for graph layout (dagre) and
force-directed simulation + helpers (d3) in the map renderer. They execute only in
the consumer's browser when viewing the generated map, never during skill execution.
