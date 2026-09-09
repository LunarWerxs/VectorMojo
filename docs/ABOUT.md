# VectorMojo

> Turns PSD, PDF, AI, or EPS files into real SVG vectors, entirely in the browser tab - no upload, no Photoshop.

<!-- odin:about HAND-OWNED above the GENERATED marker. Edit freely; `odin codex about --ingest` carries it back into Odin's Codex. -->

## What it is

VectorMojo is a client-side design-file-to-vector converter: drop in a PSD, PSB, PDF, modern (PDF-compatible) Illustrator AI, EPS, SVG, PNG, or JPEG file and it produces an SVG, then lets you export SVG, PNG (at exact pixel dimensions, transparent or white background), or PDF, or copy the SVG markup. All parsing, tracing, and rendering happen in the browser tab via JavaScript and WebAssembly (ag-psd, MuPDF.js, Ghostscript WASM, ImageTracer.js) - there is no backend and no upload step. Aimed at designers/developers who need a logo or asset out of an awkward legacy design file without owning Photoshop or Illustrator. Its differentiator versus CloudConvert/Vectorizer.AI/Vector Magic is architectural: it opens real design formats (not just raster images) and the file never leaves the tab.

## Things not to forget

_The intricacies worth remembering: the gotchas, the half-built parts, the decisions whose
reason lives nowhere else. Odin never overwrites this section._

- The Cloudflare deploy step has been silently no-op-but-green since its secrets were never configured on the repo - every push to main passes CI but has not actually deployed, so the live site can be stuck on a stale build with no red flag anywhere. anchors: `.github/workflows/ci.yml:47-55`
- Deploy runs through a GitHub Actions + wrangler step instead of Cloudflare's native Git integration on purpose: the Pages project was created as Direct Upload and Cloudflare's API refuses to convert one in place, and recreating it would risk losing the pages.dev subdomain and deployment history. anchors: `.github/workflows/ci.yml:22-31`
- Each input-format converter (PSD, PDF, EPS, raster, etc.) is registered as a lazy-loaded module in one registry map, so a user converting a PNG never downloads the PSD or Ghostscript WASM engines they don't need. anchors: `src/lib/registry.ts:24-25`
- The production build hard-fails if anything other than one specific, hash-pinned sample PSD exists under public/samples/, even if it is git-ignored, because Vite copies everything under public/ into the shipped bundle regardless of gitignore - this is what stops private scratch artwork from ever reaching the live bundle. anchors: `tools/check-public-assets.ts:8-17`
- Raster (PNG/JPEG) tracing downsamples large images to a fixed 2,000,000-pixel budget before tracing and always attaches an approximation warning - it is deliberately a draft/icon starting point via color tracing, not real vector path reconstruction, and should not be treated as a bug to fix. anchors: `src/lib/raster-to-svg.ts:6`
- The guest conversion cap is a plain localStorage counter rather than device fingerprinting, a deliberate tradeoff favoring the product's no-tracking, client-only positioning over making the cap hard to reset - do not silently 'harden' this without revisiting that stance. anchors: `src/lib/guest-usage.ts:1-23`
- The entire UI - drop zone, per-item queue, export controls, help dialog, sign-in dialog - lives in one 899-line Vue SFC with no component decomposition yet, so any UI change today means editing this one file. anchors: `src/App.vue:1-899`

<!-- odin:about GENERATED BEGIN - rewritten by `odin codex about --publish`; edit the Codex, not this -->

## What Odin knows about this project

Everything from here down is generated from this project's Codex dossier
(`codex/projects/vectormojo.md` in the Odin clone) and is **rewritten on every publish** -
edit the dossier, not this block. Everything ABOVE the marker is yours.

### At a glance

- **Ships as:** web app - static bundle (no backend) deployed to Cloudflare Pages
- **Live at:** https://vectormojo.lunarwerx.com
- **Written in:** TypeScript (31 files), Vue (1 files)
- **Built with:** Tailwind, TypeScript, Vite, Vue
- **Package:** `vectormojo` 0.1.0
- **Entry points:** `scripts`, `site_root`
- **Tests:** 9 test file(s)
- **CI:** `ci.yml`
- **Domain:** psd, photoshop, svg, pdf, illustrator-ai, eps, postscript, ghostscript, png, jpeg, vector-tracing, design-file-conversion, webassembly, client-side-only
- **Remote:** https://github.com/LunarWerxs/VectorMojo.git

### Architecture

- `src/App.vue` - the entire UI in one Vue 3 SFC: drop zone, per-item list with page/export controls, help dialog, account/sign-in dialog
- `src/lib/` - conversion engines (one *-to-svg.ts per input format), the SVG-hub registry, export pipeline (outputs.ts), format detection, guest quota, Connections auth client, analytics ping
- `src/lib/registry.ts` - the converter registry: maps a detected Format to a lazy-loaded ToSvgConverter so unused engines never load
- `tools/` - dev scripts and the bun test suite: sample-PSD generator, public-asset guard, pixel-diff regression tests per converter
- `public/` - static assets served as-is: the bundled neutral sample PSD, OG image, third-party WASM license notices
- `docs/` - CONNECTIONS.md (auth/quota architecture) and PSD_FIDELITY.md (what does and does not survive PSD conversion)
- `.github/workflows/` - CI: bun test + build on every push, then a guarded Cloudflare Pages deploy on main

### Features

18 recorded - 18 shipped, 0 partial, 0 planned. Each `path:line` is where the feature is DEFINED, checked by `odin codex check`.

**Shipped**

- **PSD/PSB to SVG** _(free)_ - Converts Photoshop PSD/PSB shape layers, gradients, patterns, and masks into real SVG vector geometry, embedding raster/text/smart-object appearance as PNG where no vector form exists. - `src/lib/psd-to-svg.ts:888`, `src/lib/registry.ts:25`
- **PDF to SVG (multi-page)** _(free)_ - Turns a selected page of a PDF into real SVG geometry via MuPDF.js, with a page picker for multi-page documents. - `src/lib/pdf-to-svg.ts:26`, `src/App.vue:232`
- **Modern Illustrator (.ai) support** _(free)_ - Opens PDF-compatible Illustrator .ai files through the same PDF pipeline; older non-PDF .ai files are detected but explicitly unsupported. - `src/lib/detect.ts:29`, `src/lib/registry.ts:37`
- **EPS/PostScript to SVG** _(free)_ - Converts EPS/PostScript files to SVG by rendering to PDF through Ghostscript WASM, then through the PDF-to-SVG pipeline. - `src/lib/eps-to-svg.ts:10`
- **SVG cleanup and normalization** _(free)_ - Opens an existing SVG, strips executable content, and normalizes/rounds/prettifies or minifies the markup. - `src/lib/svg-to-svg.ts:39`, `src/lib/outputs.ts:9`
- **PNG/JPEG bitmap tracing** _(free)_ - Traces a raster PNG/JPEG into approximate SVG paths via a local color trace (ImageTracer.js) - a draft/icon starting point, not path reconstruction. - `src/lib/raster-to-svg.ts:30`
- **Format auto-detection** - Identifies the dropped file's real format from its magic bytes rather than trusting the filename extension, and flags unsupported formats before conversion is attempted. - `src/lib/detect.ts:19`
- **Multi-format export** _(free)_ - Exports the converted SVG as SVG, PNG (custom pixel width/height, transparent or white background), or PDF, or copies the SVG markup to the clipboard. - `src/App.vue:287`, `src/App.vue:297`, `src/App.vue:318`, `src/App.vue:330`
- **PNG export sizing and background** _(free)_ - Lets the user set exact PNG output width/height and choose a transparent or solid-white background before download. - `src/App.vue:357`, `src/lib/outputs.ts:88`
- **Drag-and-drop batch intake** _(free)_ - Drop one file or a whole batch onto the workbench (or use the file picker); each becomes its own item in the conversion queue. - `src/App.vue:258`, `src/App.vue:176`
- **Bundled sample file** _(free)_ - "No file handy? Try the sample" runs the full convert/export flow against a small neutral PSD shipped with the app, with no artwork of the user's own required. - `src/App.vue:269`, `tools/generate-sample.ts:16`
- **In-app usage guide** _(free)_ - A "What can I do here?" dialog explains the drop/convert/export workflow, what each format is good at, and where conversion is necessarily approximate. - `src/App.vue:73`, `src/App.vue:455`
- **Guest conversion quota** _(free)_ - Unauthenticated visitors get 10 successful conversions, counted in localStorage; failed/unsupported conversions don't consume an allowance. - `src/lib/guest-usage.ts:1`, `src/lib/guest-usage.ts:36`, `src/App.vue:183`
- **Connections sign-in for unlimited use** _(free)_ - A free Connections account (OAuth Authorization Code + PKCE via a cross-origin sign-in dialog) removes the 10-conversion guest cap; artwork is never sent to Connections, only the sign-in session. - `src/lib/connections.ts:6`, `src/App.vue:117`
- **Anonymous visit ping** - Sends one privacy-conscious visit ping per session to Connections' Studio service (random localStorage id, app version, referrer hostname only) to measure usage; skipped under Do Not Track/GPC or on localhost, and never carries file content. - `src/lib/analytics.ts:89`
- **Conversion fidelity warnings** _(free)_ - When a source file uses a feature that can't be represented reliably (stale fills under a stroke gradient, unsupported effects, approximate tracing), the result carries a visible warning instead of failing silently or misrepresenting the output. - `src/lib/psd-to-svg.ts:889`, `src/lib/raster-to-svg.ts:56`
- **Public-sample content guard** - The production build refuses to continue if anything other than the one reviewed neutral PSD is present in public/samples/, even if Git-ignored, so private scratch artwork can never ship in the bundle. - `tools/check-public-assets.ts:17`
- **Named usage-event tracking** - Fires a handful of narrow, enum-shaped named events (which converter ran, which export format was picked, hitting the guest quota) on the same privacy-respecting foundation as the visit ping - same visitor id, DNT/GPC honored, best-effort delivery - and never a filename, file bytes, or pixel/geometry dimensions. - `src/lib/analytics.ts:34`, `src/lib/analytics.ts:62`

### Where to add a new one

- **a new input file-format converter** - add the format to the Format union and detect() in src/lib/detect.ts, implement a ToSvgConverter in a new src/lib/<format>-to-svg.ts, register it in the converters map in src/lib/registry.ts, and add a matching tools/<format>-to-svg.test.ts anchors: `src/lib/detect.ts:3`, `src/lib/registry.ts:24`
- **a new export/output format from the converted SVG** - add a function to src/lib/outputs.ts (mirroring svgToPng/svgToPdf) and wire a button + handler into the export row in src/App.vue anchors: `src/lib/outputs.ts:106`, `src/App.vue:703`
- **a new conversion/pixel-regression test** - add a *.test.ts under tools/ following the resvg-render-and-pixel-compare pattern against a generated fixture; bun test picks it up automatically anchors: `tools/psd-pixel-regression.test.ts:7`
- **a rule about what may ship in public/samples/** - extend the approved-samples list checked by tools/check-public-assets.ts, which the production build (`bun run build`) runs before bundling anchors: `tools/check-public-assets.ts:6`
- **a new CI or deploy step** - add a step to the `test` job in .github/workflows/ci.yml; the `deploy` job (Cloudflare Pages via wrangler-action) runs only after `test` passes on a push to main, and is itself guarded so a missing Cloudflare token skips deploy with a loud CI warning rather than failing red anchors: `.github/workflows/ci.yml:11`, `.github/workflows/ci.yml:32`

### Gaps and wants

_Withheld: this repository is public, and the gap list is not published outside the private index._
_Read it with `python odin.py codex brief vectormojo` in the Odin clone._

---

_Generated by `odin codex about --publish vectormojo` on 2026-09-09 from a Codex dossier stamped 2026-09-05. Regenerate after the product moves; `odin codex about` reports drift._
<!-- odin:about GENERATED END sha=f2f1cb62c0be -->
