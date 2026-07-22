# VectorMojo

Convert design files to clean **SVG**, **100% in the browser**. Files never leave
the machine, there is no backend, and the built site is a bag of static files you
can drop on **Cloudflare Pages**, **GitHub Pages**, or any static host for free.

## Why client-side

- **Local compute.** All parsing/rendering runs as JS/WASM in the tab. Zero server
  cost, and your artwork stays private.
- **Free hosting.** A static bundle → Cloudflare Pages / GitHub Pages.

## Format support

SVG is the hub: every input converts **to SVG**, then SVG exports to PNG/PDF/etc.

| Input | Engine | Status |
| --- | --- | --- |
| **PSD / PSB** | `ag-psd` (pure JS) | ✅ v1 |
| PDF | `mupdf` (WASM) → SVG | ⏳ v1.5 |
| Illustrator `.ai` (modern = PDF) | `mupdf` (WASM) | ⏳ v1.5 |
| SVG (optimize/normalize) | `svgo` | ⏳ v1.5 |
| EPS / PostScript | Ghostscript (WASM) | 🔜 v2 |
| PNG / JPG → vector (trace) | VTracer (WASM) | 🔜 v2 |

**Outputs:** SVG (v1), PNG via canvas (v1), PDF via `svg2pdf.js` (v1.5).

### PSD fidelity

Connections-style logos paint each letter with a **stroke gradient** (the vector
_fill_ is disabled and left on a stale solid). ag-psd v31 exposes both the stroke
(`vectorStroke.content`) and the fill (`vectorFill`). Because ag-psd gives geometry
and the layer bounding box in absolute pixels, gradients are emitted as
`userSpaceOnUse` with endpoints across the **layer bbox**, which is how Photoshop's
"align with layer" maps them. That reproduces the correct shade with no
objectBoundingBox skew (see `src/lib/psd-to-svg.ts`). v1 renders **shape layers**;
raster/text layers are skipped (they'll embed/rasterize later).

## Develop

```bash
bun install
bun run dev        # http://127.0.0.1:5173
bun run build      # -> dist/  (static)
bun run preview
```

To try the bundled sample, drop a PSD into `public/samples/chat.psd` (this folder is
git-ignored so brand assets aren't committed) and click **Try a sample PSD**.

## Deploy

**Cloudflare Pages** (recommended). Live at <https://vectormojo.pages.dev>. The
no-CI path used here: build locally, then push the static output with wrangler:

```bash
bun run build
bunx wrangler pages deploy dist --project-name vectormojo --branch main
```

(If you instead wire git-triggered CF builds, note the build image detects Bun
from `bun.lockb` but may not from the newer text `bun.lock`; set a `BUN_VERSION`
env var or deploy prebuilt as above.) The `public/_headers` file sets asset
caching and documents how to enable `COOP/COEP` when threaded WASM (EPS) lands.

**GitHub Pages:** publish `dist/`. `base` is already `./` (relative) so it works from
a project subpath. Note GitHub Pages cannot set custom headers, so the threaded-WASM
path (EPS) will need a `coi-serviceworker` shim there. Plain PSD/PDF/SVG are fine.

## Layout

```
src/
  lib/
    psd-to-svg.ts   # PSD → SVG (ag-psd) + gradient fidelity   ← the interesting bit
    detect.ts       # magic-byte format detection
    registry.ts     # (format → to-SVG) converter map, SVG as hub
    outputs.ts      # SVG tidy, SVG→PNG (canvas), download
  App.vue           # drag-drop UI, preview, downloads
tools/              # dev-only probes (not shipped)
```
