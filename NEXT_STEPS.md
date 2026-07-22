# VectorMojo, next steps

Status as of 2026-07-22: **v1 (PSD to SVG) is live** at
<https://vectormojo.pages.dev>, deployed to Cloudflare Pages (Lunawerx account),
source in this repo. This file tracks everything not yet done, roughly in
priority order. Nothing here is blocking; v1 works.

## 1. Deploy / hosting polish

- [ ] **Custom domain** (e.g. `vectormojo.lunarwerx.com`). Cloudflare dashboard
  to Pages to vectormojo to Custom domains. Needs a DNS record, so it is an
  owner action. ~5 min.
- [ ] **Git-triggered builds (optional).** Right now deploys are manual:
  `bun run build` then `bunx wrangler pages deploy dist --project-name vectormojo`.
  To auto-deploy on push, connect the GitHub repo in the CF Pages project.
  Caveat: the CF build image detects Bun from the legacy binary `bun.lockb`, and
  may NOT from this repo's newer text `bun.lock`; if the build errors with
  `bun: command not found`, either set a `BUN_VERSION` build env var, add an
  `engines`/`.nvmrc`, or keep deploying prebuilt `dist/` as we do now.
- [ ] **Repo visibility.** Created **private** under `lunawerx`. Flip to public
  when ready (`gh repo edit lunawerx/vectormojo --visibility public`), or from
  the GitHub settings page.

## 2. The bundled sample (brand-IP note)

The "Try a sample PSD" button loads `public/samples/chat.psd`. That folder is
git-ignored (not in this repo), but the file IS in the deployed build, so a
Connections logo PSD is currently public at
<https://vectormojo.pages.dev/samples/chat.psd>.

- [ ] Decide: replace it with a **neutral, non-brand** sample PSD (best for a
  public demo), or drop the sample button, or accept it (these are Lunarwerx/
  Connections own assets). If replacing, drop the new file at
  `public/samples/chat.psd` (or rename and update `trySample()` in
  `src/App.vue`). The button already 404s gracefully if the file is absent.

## 3. PSD fidelity, remaining gaps (v1 renders shape layers only)

The converter warns in the UI when it hits these; it does not silently render
them wrong. Worth closing when a real file needs them:

- [ ] **Raster + text layers.** Currently skipped (counted as "skipped"). Options:
  embed raster layers as `<image>` data URIs; render text layers as `<text>` (or
  outline them). Text needs font handling, so raster-embed first.
- [ ] **`intersect` path combine mode.** SVG fill rules cannot express "keep only
  the overlap" of two subpaths; we approximate and warn. Real fix: compute the
  boolean intersection of the subpaths (a path-clipping lib, e.g. a WASM build of
  Clipper) at convert time.
- [ ] **Blend modes with no CSS equivalent** (`pass through` on non-groups, any
  future PS-only modes). We map the CSS-expressible ones and warn on the rest.
- [ ] **Pattern fills.** Currently rendered transparent + warn. Emit an SVG
  `<pattern>` from the PSD pattern data.
- [ ] **Layer/vector masks (raster masks)** beyond clipping masks (which ARE
  handled). A pixel mask would need rasterizing or converting to a clip path.

## 4. Format roadmap (SVG is the hub; each is one lazy-loaded engine)

### v1.5

- [ ] **PDF to SVG** via `mupdf` WASM (`drawPageAsSVG`). True vector out.
- [ ] **Illustrator .ai to SVG.** Modern `.ai` is a PDF stream, so it reuses the
  mupdf path (detection already routes `.ai` correctly). Legacy/non-PDF `.ai` is
  out of scope.
- [ ] **SVG in (optimize / normalize)** via `svgo` (bundles for the browser;
  keep it lazy-loaded so it does not bloat the initial JS).
- [ ] **SVG to PDF export** via `svg2pdf.js` (cheap once any PDF lib is present).

### v2

- [ ] **EPS / PostScript to SVG** via a Ghostscript WASM build. Heavy (~10 MB)
  and may need `SharedArrayBuffer`, so lazy-load it and enable COOP/COEP (see
  `public/_headers`; works on Cloudflare Pages, needs a `coi-serviceworker` shim
  on GitHub Pages).
- [ ] **Raster (PNG/JPG) to vector (trace).** `VTracer` (Rust to WASM, best color
  tracing; would need building) or `ImageTracer.js` (pure JS, ships today).
  This is approximate tracing, not exact conversion; label it as such in the UI.

Each new engine: add a `converterFor(format)` entry in `src/lib/registry.ts`,
flip `supported: true` in `src/lib/detect.ts`, lazy-`import()` the WASM.

## 5. Engineering hardening

- [ ] **Commit the regression gate as a real test.** There is a pixel-diff
  harness (renders SVG with `resvg`, diffs against `psd_tools` composites of the
  7 Connections logo PSDs, asserts mean-diff and big-pixel thresholds). It lives
  only in the scratch session right now. Port it into `tools/` + a `bun test`
  script + a CI check so fidelity regressions are caught automatically.
- [ ] **COOP/COEP headers** (`public/_headers`) are stubbed/commented; enable
  when the first threaded WASM engine (EPS) lands.
- [ ] **Bundle size.** 121 KB gzip today (ag-psd + Vue). Fine for now; if it
  grows, code-split the converters (they already lazy-load conceptually).

## 6. Product / UX

- [ ] Multi-page / multi-artboard handling (PDF, AI) once those land.
- [ ] Per-conversion options (background transparency toggle, precision, minify).
- [ ] A real logo/wordmark (the favicon is a placeholder "V" mark).
- [ ] "Copy SVG to clipboard" alongside download.
