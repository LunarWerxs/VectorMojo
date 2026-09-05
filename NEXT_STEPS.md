# VectorMojo, next steps

Status as of 2026-09-05 (first written 2026-07-23): **v2 is live** at
<https://vectormojo.lunarwerx.com>, deployed to Cloudflare Pages from audited commit
`575d6bd`. The source repository is public under MIT for VectorMojo's original
code, with the AGPL runtime components disclosed separately. This file tracks
everything not yet done, roughly in priority order.

## 1. Deploy / hosting polish

- [x] **Public v2 deployment.** The production Pages deployment is built from
  the pushed `main` commit and includes source, license, and third-party notices.
- [x] **Custom domain.** `vectormojo.lunarwerx.com` is live with an active
  certificate (done 2026-08-02 over the API: the custom domain was added to the
  Pages project and the zone got a proxied `CNAME vectormojo -> vectormojo.pages.dev`).
  The old `vectormojo.pages.dev` still serves the same pages rather than
  redirecting; the canonical tag names the custom domain, so this is untidy
  rather than harmful.
- [ ] **Git-triggered builds: two repository secrets away.** Cloudflare's own
  Git integration cannot be turned on for this project (it was created as
  Direct Upload and the API refuses to change its `source`; recreating it would
  drop the deployment history and risk the `vectormojo.pages.dev` name). So the
  deploy lives in `.github/workflows/ci.yml` as a `deploy` job that runs after
  the tests on every push to `main`. It skips itself with a loud
  "NOT DEPLOYED" notice until two repository secrets exist:
  `CLOUDFLARE_API_TOKEN` (a token scoped to this account only, Workers and
  Pages edit) and `CLOUDFLARE_ACCOUNT_ID`. The vaulted account-wide token must
  not be pasted in because this repo is public. Until then, ship by hand:
  `bun run build` then `wrangler pages deploy dist --project-name=vectormojo --branch=main`.
  See `OWNER_ACTIONS.md` for the exact token scope and steps.
- [x] **Repo visibility.** Public at <https://github.com/LunarWerxs/vectormojo>
  with MIT project licensing, a security policy, secret scanning, push
  protection, dependency alerts, automated fixes, and private vulnerability
  reporting enabled.

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

- [x] **Public-release audit.** Full-history and staged-change secret scans are
  clean; commit identities use GitHub noreply addresses. The generated neutral
  PSD has no author/history/XMP metadata. Private design files live outside
  Vite's `public/` tree, and every build pins the one approved public sample by
  filename and SHA-256 before copying it to `dist/`.
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

- [x] First-visit onboarding that explains useful jobs, the three-step workflow,
  supported formats, and honest fidelity limits; the same guide stays available
  from the persistent "What can I do here?" button.
- [x] Portfolio-grade public presentation: human README copy, real product
  screenshots, a LunarWerxs-style social/header card, Open Graph/X metadata,
  and a dedicated PSD fidelity note outside the main README.
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
