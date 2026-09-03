# Brand assets

## `tcr_logo.png`

The real Texas Choice Roofing mark, extracted from
`TCR_Purpose_Statement_and_Values.pdf` (page 1, the only raster image in the
file) with its soft mask applied so the transparency is intact.

- 900 × 396, RGBA, transparent, 58 KB.
- Trimmed to the artwork — the source image carried ~140px of empty margin on
  each side, which would have shrunk the visible mark inside its own box.
- Downscaled from the 1425 × 627 original. It renders at 260px wide on the
  checklist page and 230px on the dashboard, so 900px stays crisp past 3×
  device pixel ratio while costing a third less than the full-resolution file
  on a phone with poor signal.

Both pages reference it as `assets/tcr_logo.png`.

### Colors

Sampled directly from the mark, and these are what the pages use:

| | |
|---|---|
| Red | `#BA1313` |
| Black | `#161515` and pure `#000000` |

`#BA1313` is exact — it is the single most common opaque pixel value in the
logo, and it matches the value given in the brief.

### The masthead is light on purpose

This is the one thing to know before restyling either page. The mark is **not**
all-red: the "ROOFING" wordmark is pure black, and so is the house silhouette
with the little window that sits under the roofline. On a dark background both
disappear, leaving the red Texas shape floating over what looks like empty
space — you lose a good half of the logo and never notice it is missing.

So both mastheads are white with a red rule beneath, which is the background
this mark was drawn for. `tools/test-pages.js` asserts the masthead background
stays light, so a future change to a dark band fails the tests rather than
quietly mangling the logo.

If a dark header is ever wanted, the mark needs a light-on-dark variant from
whoever holds the source artwork — recoloring the black elements here would be
altering the logo, not using it.

### Why `docs/assets/` and not `assets/`

The brief asked for `assets/tcr_logo.png` at the repo root. GitHub Pages serves
from `/docs` and publishes **only** that folder, so a file at the repo root is
not reachable over HTTP at all and the `<img>` would 404 in production.
`docs/assets/` is the same idea at the only path Pages can serve.

Serving the repo root instead would also put `data/submissions/` and
`netlify.toml` on the public site, so `/docs` is the tidier of the two.

### Fallback

Both pages keep a small CSS/SVG wordmark behind an `onerror` handler, in case
the PNG ever goes missing from a deploy. It is hidden whenever the real file
loads, and the tests check that too.
