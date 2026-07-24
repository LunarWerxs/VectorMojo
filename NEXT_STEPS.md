# VectorMojo, next steps

Status as of 2026-07-23: **v1 (PSD to SVG) is live** at
<https://vectormojo.pages.dev>, deployed to Cloudflare Pages (Lunawerx account),
source in this repo. The local worktree now implements the v2 roadmap below but
has not been deployed. This file tracks everything not yet done, roughly in
priority order.

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

## 2. The bundled sample

- [x] Replaced the Connections logo PSD with a generated, neutral shape-layer
  sample at `public/samples/vector-mojo-sample.psd`. Its reproducible source is
  `tools/generate-sample.ts`; other files in `public/samples/` stay git-ignored.

## 3. PSD fidelity, remaining gaps

The converter warns in the UI when it hits these; it does not silently render
them wrong. Worth closing when a real file needs them:

- [x] **Raster + text layers.** Their stored layer pixels are embedded as PNG
  `<image>` data URIs, preserving appearance without depending on local fonts.
  Shape layers remain true vector paths.
- [x] **`intersect` path combine mode.** Bézier paths are adaptively flattened
  to sub-pixel precision and resolved through a lazy-loaded polygon clipping
  engine; the result remains vector geometry in the SVG.
- [x] **Blend modes with no CSS equivalent.** CSS-expressible modes are mapped;
  unsupported modes, including `pass through` on non-groups, produce a warning
  and safely fall back to normal.
- [x] **Pattern fills.** Document pattern pixels are encoded as PNG tiles and
  emitted as SVG `<pattern>` definitions, including the Photoshop phase offset.
- [x] **Layer/vector masks.** Bitmap masks become luminance SVG masks (including
  bounds, default color, density, and feather); vector masks on raster/text
  artwork become vector SVG masks. Clipping masks remain supported separately.

## 4. Format roadmap (SVG is the hub; each is one lazy-loaded engine)

### v1.5

- [x] **PDF to SVG** via `mupdf` WASM (`drawPageAsSVG`). True vector out, with a
  local page selector for multi-page documents.
- [x] **Illustrator .ai to SVG.** Modern `.ai` is a PDF stream, so it reuses the
  mupdf path (detection already routes `.ai` correctly). Legacy/non-PDF `.ai` is
  out of scope.
- [x] **SVG in (optimize / normalize)** via `svgo` (bundles for the browser;
  keep it lazy-loaded so it does not bloat the initial JS).
- [x] **SVG to PDF export** via lazy-loaded `svg2pdf.js` + `jsPDF`. The export
  keeps the SVG's dimensions and vector geometry; its renderer is fetched only
  when the PDF download action is used.

### v2

- [x] **EPS / PostScript to SVG** via the non-threaded
  `@jspawn/ghostscript-wasm` build. Ghostscript converts EPS to an in-memory PDF,
  then the existing MuPDF path preserves its vector geometry as SVG. The 16 MB
  WASM asset is lazy-loaded; this build does not require `SharedArrayBuffer` or
  COOP/COEP.
- [x] **Raster (PNG/JPG) to vector (trace).** `ImageTracer.js` runs locally as a
  lazy-loaded pure-JS engine. Results and warnings explicitly say the trace is
  approximate; images above 2 MP are proportionally sampled for responsiveness
  while the SVG retains the source dimensions.

Each new engine has a `converterFor(format)` entry in `src/lib/registry.ts`,
sets `supported: true` in `src/lib/detect.ts`, and lazy-loads its runtime.

## 5. Engineering hardening

- [x] **Commit the regression gate as a real test.** `bun test` renders converted
  SVG through `resvg`, pixel-diffs vector and raster PSD fixtures, and asserts
  mean-difference and big-pixel thresholds. CI runs the test and production
  build. The gate uses generated neutral fixtures instead of reintroducing the
  seven branded scratch PSDs.
- [x] **COOP/COEP review.** `public/_headers` keeps the directives documented
  but deliberately disabled: every current engine is single-threaded, so
  enabling cross-origin isolation would add compatibility cost without benefit.
- [x] **Bundle size.** The initial app remains ~125 KB gzip. PDF, SVG normalize,
  SVG→PDF, EPS, raster tracing, compression, and polygon clipping are emitted as
  lazy chunks; the 10 MB MuPDF and 16 MB Ghostscript assets load only on demand.

## 6. Product / UX

- [x] Multi-page / multi-artboard handling for PDF-compatible PDF/AI files.
  Results expose a page selector and reuse the local source bytes when switching;
  no re-upload or server round trip is needed.
- [x] Per-conversion export options: transparent/white background, 0–4 decimal
  precision, and compact/pretty SVG formatting. The selected settings feed SVG,
  PNG, and PDF downloads from that result.
- [x] A real vector logo/wordmark system. The Bézier-node "V" + spark mark lives
  in `public/vectormojo-mark.svg`, drives the favicon, and pairs with the
  gradient wordmark in the app header.
- [x] "Copy SVG to clipboard" alongside download, using the same background,
  precision, and minify settings as the exported file.
