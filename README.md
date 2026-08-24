<div align="center">

<a href="https://vectormojo.lunarwerx.com">
  <img src="public/og.png" alt="VectorMojo: turn the file you have into the vector you need" width="880" />
</a>

<p>
  <a href="https://vectormojo.lunarwerx.com"><b>Open VectorMojo</b></a>
  &nbsp;·&nbsp; <a href="#what-it-does">What it does</a>
  &nbsp;·&nbsp; <a href="#what-goes-in">Formats</a>
  &nbsp;·&nbsp; <a href="#run-it-yourself">Run locally</a>
</p>

<p>
  <a href="https://vectormojo.lunarwerx.com"><img alt="Live site" src="https://img.shields.io/badge/live-vectormojo.lunarwerx.com-8b5cf6?style=flat-square" /></a>
  <a href="https://github.com/LunarWerxs/vectormojo/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/LunarWerxs/vectormojo/ci.yml?branch=main&style=flat-square&label=CI" /></a>
  <img alt="Runs locally in your browser" src="https://img.shields.io/badge/files-stay%20in%20your%20browser-06b6d4?style=flat-square" />
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" /></a>
</p>

</div>

---

VectorMojo is a client-side design-file-to-vector converter that turns PSD,
PSB, PDF, modern Illustrator AI, EPS, SVG, and PNG/JPEG files into vector SVG,
then exports SVG, PNG, or PDF. All parsing, tracing, and rendering happen in
the browser tab via JavaScript and WebAssembly; there is no server and no
upload step.

Most of the time, you do not need Photoshop. You need the logo trapped inside
the PSD. Or a clean SVG from a PDF somebody sent three years ago. Or a PNG you
can turn into *something* editable before lunch.

**VectorMojo is the escape hatch.** Drop in the awkward design file, let the
browser pull out what it can, then take the result as SVG, PNG, PDF, or copied
markup. The first 10 conversions work as a guest; a free Connections account
unlocks unlimited conversions. There is no upload step and no server holding on
to the original.

<p align="center">
  <img src=".github/screenshots/conversion.png" alt="VectorMojo converting the bundled PSD sample into an SVG with export controls" width="880" />
</p>

## What it does

- **Rescues vector artwork.** Pulls shape layers and paths out of PSD/PSB, PDF,
  modern Illustrator, and EPS files.
- **Makes SVGs easier to ship.** Opens, sanitizes, normalizes, rounds, prettifies,
  or minifies the SVG you already have.
- **Traces the bitmap when that is the only option.** PNG and JPEG tracing is
  approximate, but it is often enough for a draft, icon, or starting point.
- **Exports the useful version.** Download SVG, transparent or white-background
  PNG at exact pixel dimensions, and PDF, or copy the SVG straight into a
  project.
- **Handles the small annoying details.** Multi-page PDFs, background choice,
  export precision, batch drops, masks, patterns, gradients, and transparent
  previews are already accounted for.

## Try it

Open **[vectormojo.lunarwerx.com](https://vectormojo.lunarwerx.com)** and drop a file.
That is the whole setup.

No suitable file nearby? Click **No file handy? Try the sample**. VectorMojo
ships with a small, neutral PSD so you can see the complete conversion and
export flow without handing it any of your own artwork.

The **What can I do here?** button explains the workflow, the good fits, and the
places where conversion is necessarily approximate:

<p align="center">
  <img src=".github/screenshots/how-it-works.png" alt="VectorMojo's in-app guide explaining drop, convert, and export" width="760" />
</p>

## What goes in

| Input | What VectorMojo does |
| --- | --- |
| **PSD / PSB** | Keeps shape layers as vectors; preserves raster, text, and smart-object appearance as embedded pixels when needed |
| **PDF** | Turns each selected page into real SVG geometry |
| **Illustrator `.ai`** | Opens modern PDF-compatible AI files; older non-PDF AI files are not supported |
| **EPS / PostScript** | Converts through local Ghostscript and MuPDF WebAssembly |
| **SVG** | Removes executable content and cleans, normalizes, rounds, or minifies the markup |
| **PNG / JPEG** | Runs a local approximate color trace into SVG paths |

Everything lands in SVG first. From there, VectorMojo can export **SVG, PNG,
PDF, or clipboard-ready SVG markup**.

## Private by architecture

There is no VectorMojo backend. File reading, parsing, tracing, rendering, and
export all happen in the current browser tab with JavaScript and WebAssembly.
Closing the tab closes the workbench; VectorMojo does not upload or store the
files you give it.

The production build is a collection of static files, which is why it can live
on Cloudflare Pages without a database, upload bucket, or processing server.
Connections supplies optional account authentication through its public,
PKCE-only browser SDK; only the sign-in session leaves the tab. The artwork
never does. The quota and authentication decisions are documented in
[`docs/CONNECTIONS.md`](docs/CONNECTIONS.md).

### The one network call

VectorMojo's "100% local compute" promise is about the files you convert, and
that part is absolute: file reading, parsing, tracing, and export never leave
the tab. The app does make exactly one outbound call on its own, and it is
worth stating plainly rather than leaving implicit.

Once per browser session, VectorMojo sends a single anonymous visit ping to
Connections' Studio service (`studio.connections.icu/v1/app/vectormojo/latest`)
so we know the site is still being used. What it sends: a random visitor id
stored in `localStorage` (not tied to any account or file you touch), the app
version, and, if you arrived from a link, the referring site's hostname only -
never the full URL. What the server derives from the request itself and
stores alongside that: coarse geo (country, region, city, timezone), network
ASN, locale, and a truncated user agent. It never logs an IP address. The
ping is skipped entirely when Do Not Track or Global Privacy Control is
enabled, and skipped on localhost. No file, filename, or conversion result is
ever part of it. The source is [`src/lib/analytics.ts`](src/lib/analytics.ts).

## A realistic note about fidelity

Design formats are messy. A Photoshop file can mix true paths, pixels, fonts,
smart objects, masks, patterns, and blend modes in the same layer stack.
VectorMojo keeps vector geometry vector where the source exposes it, and embeds
stored pixels where that is the honest way to preserve the appearance.

That means a PSD can produce a very useful SVG without every object becoming a
perfectly editable Bézier path. PNG/JPEG tracing is even more explicitly an
approximation. The app shows warnings instead of pretending otherwise.

The deeper implementation notes live in
[`docs/PSD_FIDELITY.md`](docs/PSD_FIDELITY.md).

## Run it yourself

### Quick start

You need [Bun](https://bun.sh).

```sh
git clone https://github.com/LunarWerxs/vectormojo.git
cd vectormojo
bun install
bun run dev
```

The useful checks:

```sh
bun test          # conversion + pixel-diff regression suite
bun run build     # audited production bundle in dist/
bun run preview   # serve that bundle locally
```

The production build refuses to continue if anything other than the reviewed
neutral PSD appears in `public/samples/`, even when that file is ignored by Git.
Private scratch artwork belongs in the ignored `local-samples/` directory.

## Built with

**Bun** · **Vue 3** · **Vite** · **Tailwind CSS 4** · **Connections** ·
**ag-psd** · **MuPDF.js** · **Ghostscript WASM** · **SVGO** ·
**ImageTracer.js** · **jsPDF**

The converter registry is in [`src/lib/registry.ts`](src/lib/registry.ts);
each format lazy-loads its own engine, so opening the page does not immediately
pull down the large PDF or EPS runtimes.

## How it compares

VectorMojo's niche is narrow on purpose: get vector geometry out of a design
file you already have, without leaving the browser tab. Here is how it
compares to the tools people usually reach for first.

- **Adobe Illustrator's Image Trace** turns raster images into vector paths,
  but it is a feature of the paid Creative Cloud desktop app, not a
  standalone converter, and it does not open PSD, EPS, or non-PDF AI files
  the way VectorMojo does.
- **Vector Magic** is a longstanding online and desktop raster tracer. Its
  online version accepts JPG, PNG, BMP, and GIF only (no PSD, PDF, AI, or EPS
  input), uploads the image to its own servers, and runs on a subscription or
  pay-per-use plan.
- **Vectorizer.AI** is a browser-based AI raster tracer for PNG, JPG, GIF,
  BMP, and WebP (up to 3 MP / 30 MB), with a free interactive preview and
  paid downloads. Like Vector Magic, it traces bitmaps; it does not open
  PSD, PDF, AI, or EPS design files directly.
- **CloudConvert** is a general-purpose file converter spanning 200+ formats.
  It uploads your file to CloudConvert's own servers, converts it there, and
  deletes it afterward, rather than never sending it anywhere.

VectorMojo's difference is architectural: it opens PSD/PSB, PDF, AI, and EPS
design files directly, not just raster images, and the conversion, from
reading the file to exporting the result, never leaves the browser tab.

## FAQ

**Is VectorMojo free?**
Yes for most use. The first 10 conversions work as a guest with no account.
After that, a free Connections account unlocks unlimited conversions. There
is no paid tier and no usage-based pricing; the guest limit exists to
prevent abuse, not to hold back a paid feature.

**Is my data sent anywhere?**
No. VectorMojo has no backend: file reading, parsing, tracing, rendering,
and export all run in the current browser tab with JavaScript and
WebAssembly. The only outbound request is a single anonymous visit ping to
Connections' Studio service (skipped if Do Not Track or Global Privacy
Control is on), and it never contains a file, filename, or conversion
result.

**Does VectorMojo work offline?**
The conversion itself does: once the page is loaded, parsing, tracing, and
export all run locally and never call out to a server. Loading the page for
the first time still needs a network connection, unless you clone the
MIT-licensed source, install dependencies with Bun, and run it yourself;
after that, no network connection is required.

**What file types does VectorMojo support?**
As input: PSD, PSB, PDF, modern PDF-compatible Illustrator `.ai` files,
EPS/PostScript, SVG, PNG, and JPEG. Older, non-PDF Illustrator files are not
supported. As output: SVG, PDF, and PNG at exact pixel dimensions with a
transparent or white background, plus clipboard-ready SVG markup you can
paste straight into a project.

**Can VectorMojo turn a PNG or JPEG into a real vector?**
It traces the bitmap into SVG paths using a local color trace, and the
result is explicitly approximate rather than a faithful reconstruction.
That's usually enough for a draft, an icon, or a starting point to clean up
by hand, but it will not recover the original vector paths, because a
raster image never had any.

**What are the system requirements?**
A modern desktop or mobile browser with JavaScript and WebAssembly support;
there is nothing else to install for the hosted app. No account, GPU, or
special hardware is required. Large PSD files or high-resolution bitmap
traces use more memory and take longer, because everything runs in the tab
instead of on a server.

## License

VectorMojo's original source is [MIT](LICENSE) © VectorMojo contributors. Do
what you want with it.

The browser bundle also includes MuPDF.js and Ghostscript WASM under the AGPL.
Those components keep their own licenses; public builds include their full
license texts and a corresponding-source pointer. See
[`public/THIRD_PARTY_NOTICES.txt`](public/THIRD_PARTY_NOTICES.txt).

<div align="center">
  <br />
  <a href="https://vectormojo.lunarwerx.com"><img src="public/vectormojo-mark.svg" alt="VectorMojo" width="48" /></a>
  <br /><br />
  <sub>Built by <a href="https://lunarwerx.com"><b>LunarWerxs</b></a> · Deployed on Cloudflare Pages</sub>
  <br /><br />
  <sub>Also from LunarWerxs: <a href="https://repoyeti.com">RepoYeti</a> · <a href="https://sagethumbs.lunarwerx.com">SageThumbs</a> · <a href="https://quickdictate.lunarwerx.com">QuickDictate</a></sub>
</div>
