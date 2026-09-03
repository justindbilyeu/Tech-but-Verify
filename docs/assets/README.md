# Drop the logo here

Both pages reference `assets/tcr_logo.png`, so the file belongs at:

```
docs/assets/tcr_logo.png
```

**It is not in this repo yet.** The build spec said `tcr_logo.png` (extracted
from `TCR_Purpose_Statement_and_Values.pdf`) was included in the delivery, but
no such file arrived, so there was nothing to commit. Until it is added, both
pages fall back to a CSS/SVG wordmark — "Texas Choice" over "ROOFING" in the
brand red, under a small roofline — so a demo never shows a broken image.

Dropping the real PNG in at that path is the whole change. No HTML or CSS edit
is needed; the `onerror` fallback simply stops firing.

### Why `docs/assets/` and not `assets/`

The spec asked for `assets/tcr_logo.png` at the repo root. GitHub Pages is
configured to serve from `/docs`, and Pages publishes **only** the contents of
that folder — a file at the repo root is not reachable over HTTP at all, so the
`<img>` would 404 in production. `docs/assets/` is the same idea at the only
path Pages can actually serve.

If you would rather the file live at the repo root, the folder Pages serves has
to change too (Settings → Pages → source `/ (root)`), which also puts
`data/submissions/` and `netlify.toml` on the public site. Serving `/docs` is
the tidier of the two.

### Notes on the file itself

- Transparent PNG, sitting on the near-black masthead (`#161515`).
- It renders at up to 220px wide on the checklist page and 180px on the
  dashboard, at up to 3× device pixel ratio — so roughly 660px wide or more
  keeps it crisp on a phone.
- Brand colors sampled from the mark, used throughout both pages:
  red `#BA1313`, black `#161515`.
