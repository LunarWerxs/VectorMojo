# PSD fidelity notes

VectorMojo aims for a useful, honest SVG rather than claiming that every
Photoshop feature has a one-to-one SVG equivalent.

## Shape layers and gradients

Photoshop can keep a stale solid vector fill while the visible artwork is
actually painted by a stroke gradient. `ag-psd` exposes both the stroke
(`vectorStroke.content`) and fill (`vectorFill`), so VectorMojo uses the active
paint source instead of assuming the fill is what appears on the canvas.

Gradient coordinates are emitted in `userSpaceOnUse` across the layer bounds.
That matches Photoshop's “align with layer” behavior and avoids the skew that
`objectBoundingBox` introduces.

## Pixels inside SVG

Raster layers, text layers, and smart objects keep their stored appearance as
positioned PNG images inside the SVG. This avoids silently substituting fonts or
discarding effects that the browser cannot reconstruct.

These elements are preserved visually, but they do not become editable vector
paths.

## Intersections, patterns, and masks

- Photoshop `intersect` path operations are resolved into real clipped vector
  geometry by a lazy-loaded polygon clipping engine.
- Pattern fills are stored as embedded PNG tiles inside SVG `<pattern>`
  elements.
- Bitmap and vector layer masks become SVG masks, including density and feather
  settings.

## Warnings

When a layer uses a feature that cannot be represented reliably, the converter
adds a visible warning to the result. Known unsupported or approximate behavior
should never fail silently.

The regression suite in `tools/` renders generated SVG through `resvg` and
pixel-compares it against generated neutral PSD fixtures.
