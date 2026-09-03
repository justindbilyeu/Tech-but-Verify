> ## ⚠️ Prototype — not legally reviewed
>
> **Do not use for real job sign-off until counsel has reviewed the checklist
> language and the independent-contractor framing.** Two checklist items are
> unwritten placeholders awaiting a lawyer, and nothing on the form should be
> treated as a binding agreement. The banner is on both pages as well as here.

# TCR Crew Boss Pre-Job Checklist

A tap-to-confirm pre-job safety checklist for Texas Choice Roofing crew bosses.
A crew boss opens a link on their phone, enters their name and the job address,
confirms each line, and submits. Each submission is committed to this repo as one
JSON file, and a dashboard lists the history.

| | |
|---|---|
| **Checklist** | [`docs/index.html`](docs/index.html) → `https://justindbilyeu.github.io/Tech-but-Verify/` |
| **Dashboard** | [`docs/dashboard.html`](docs/dashboard.html) → `https://justindbilyeu.github.io/Tech-but-Verify/dashboard.html` |
| **Submit endpoint** | [`netlify/functions/submit-checklist.js`](netlify/functions/submit-checklist.js) |
| **Records** | [`data/submissions/`](data/submissions/) |
| **Checklist wording** | [`checklist-items.json`](checklist-items.json) |

## How it fits together

```
phone ──POST──> Netlify function ──GitHub Contents API──> data/submissions/*.json
                (holds the token)                              │
                                                               │ public read
GitHub Pages (docs/) ── checklist + dashboard <────────────────┘
```

No database and no paid backend. Everything static except the function, which
exists only because the token that can write to this repo must never reach a
phone. This mirrors the CarrierCalc lead-capture pattern; the new piece is the
GitHub Contents API write.

## Deploying

Two moving parts, neither of them Netlify any more.

**The pages** are served by **GitHub Pages** from this repo: Settings → Pages →
Source *Deploy from a branch*, branch `main`, folder `/docs`. Pushing to `main`
republishes them.

| | |
|---|---|
| Checklist | https://justindbilyeu.github.io/Tech-but-Verify/ |
| Dashboard | https://justindbilyeu.github.io/Tech-but-Verify/dashboard.html |

**The endpoint** is a **Cloudflare Worker** at
`https://tcr-checklist.justindbilyeu.workers.dev`, built from
[`adapters/`](adapters/) on every push to `main` — root directory `adapters`,
deploy command `npx wrangler deploy`, no build command. The handler in
`netlify/functions/` is unchanged and still Netlify-shaped; a small adapter
translates. See [`adapters/README.md`](adapters/README.md) for how and why,
including the Netlify instructions, which still work if you ever want them back.

**Two secrets** on the Worker (Settings → Variables and Secrets, type
**Secret**):

| Name | Value |
|---|---|
| `GITHUB_TOKEN` | fine-grained PAT — see [`.env.example`](.env.example) for the exact scoping |
| `GITHUB_REPO` | `justindbilyeu/Tech-but-Verify` |

`ALLOWED_ORIGIN` is already set in `adapters/wrangler.toml` under `[vars]`,
because it is not a secret and is worth seeing in a diff. Without the two above
the endpoint answers `500 Server is not configured` — refusing on purpose
rather than half-working.

**Why it moved.** Netlify pauses production deploys when a team runs out of
credits. Published sites stay live and new code stops shipping, so the failure
mode is that a fix exists and cannot be deployed. That is a fine trade for a
hobby project and a bad one for a form a crew boss opens every morning.

## Tests

```bash
node tools/verify-checklist-sync.js      # the two copies of the checklist agree
node tools/test-submit-checklist.js      # the function, against a mocked GitHub API
node tools/test-adapter.mjs              # the same function, running as a Worker

# needs playwright available; deliberately not a declared dependency
NODE_PATH=$(npm root -g) node tools/test-pages.js
```

`tools/test-pages.js` drives both pages in a real browser: validation, the full
submit flow, the exact payload the function will receive, hostile input, and the
dashboard's populated / empty / rate-limited / offline states.

`tools/test-adapter.mjs` runs the real handler end to end through the Worker
adapter with `fetch` stubbed, then does it again with `globalThis.Buffer`
deleted — the actual condition on a Worker, and the only way to know the shim
is exercised rather than merely present. It also checks that the rule a
malformed PIN roster fails **closed** survives the move. 243 assertions across
the function, adapter and browser suites, all passing.

The checklist wording lives in **three** places: `checklist-items.json`
(canonical), the `CHECKLIST` array in `docs/index.html` (what a crew boss
reads), and an inlined copy inside the function (what the server validates
against). The function carries its own copy because it gets deployed alone —
onto a Worker, or dropped into someone else's Netlify site — where this repo's
root is not on disk. A `require` of `checklist-items.json` would throw on the
first invocation.

**Edit one, edit all three**, then run `verify-checklist-sync.js`, which fails on
any drift. The function rejects submissions whose item text does not match its
copy, so drift would otherwise turn every submission into a 400.

## The checklist

15 items in four categories — safety, then visibility, then cleanliness, then
crew readiness. 13 are confirmable; items 14 and 15 are legal placeholders.

Fitness for duty sits at item 4, bundled with rest and hydration
("All crew members are fit for duty — rested, hydrated, and unimpaired by drugs
or alcohol") rather than standing alone. The whole form is written as a standard
TCR holds itself to, not as a suspicion aimed at the crew boss.

### The legal placeholders

Items 14 and 15 render as **visibly unfinished slots** — dashed border, muted
italic text, a "pending legal review" tag — and are deliberately **not
checkboxes**. A placeholder is not something anyone can honestly confirm, and a
prototype that trains crew bosses to tick an empty bracket is exactly what the
"don't mistake this for a finished document" warning is trying to prevent.

They are still recorded in every submission with `confirmed: false` and
`pendingLegalReview: true`, so the archive shows what was and was not covered
once counsel fills them in. The function **rejects** a submission claiming a
placeholder was confirmed. `allConfirmed` is computed from the 13 real items.

This is a small deviation from the spec's "block submit unless every checklist
item is filled in" — worth a look, and easy to change once there is real
language to confirm.

## Record format

One file per submission, `data/submissions/<timestamp>_<name-slug>.json`:

```json
{
  "crewBossName": "John Smith",
  "jobAddress": "1204 Oak Hollow Dr, Houston, TX 77008",
  "submittedAt": "2026-09-03T14:22:00Z",
  "clientSubmittedAt": "2026-09-03T14:21:58.412Z",
  "items": [
    { "id": "s1", "category": "Safety",
      "text": "Fall protection equipment is in place and inspected",
      "confirmed": true },
    { "id": "r4", "category": "Crew readiness",
      "text": "[LEGAL PLACEHOLDER — OSHA reference / regulatory citation, to be confirmed by counsel]",
      "confirmed": false, "pendingLegalReview": true }
  ],
  "allConfirmed": true,
  "identityVerified": false,
  "checklistVersion": "0.1.0-prototype",
  "prototype": true,
  "legalReviewPending": true
}
```

`submittedAt` is the server's clock and is what the filename and the dashboard
use; `clientSubmittedAt` is what the phone reported, kept beside it because a
phone's clock is whatever the phone says it is.

`identityVerified` is `false` while PINs are off — the name is simply what
someone typed. With PINs on it is `true`, `crewBossName` comes from the roster
rather than the box, and a disagreeing typed name is kept as `typedName`. The
PIN itself never appears in the file.

## Notes on the code

- **Item text is never trusted from the client.** The function matches each
  submitted item against `checklist-items.json` and stores the canonical
  wording, so a record can never claim someone agreed to something else.
  Typography differences (curly vs. straight quotes, en vs. em dash, stray
  whitespace) are normalised before comparing so they don't cause spurious 400s.
- **The crew boss name becomes part of a file path**, so it is aggressively
  slugified to `[a-z0-9-]`. `../../../../etc/passwd` becomes `etc-passwd`.
- **Names and addresses render with `textContent`, never `innerHTML`**, on both
  the success screen and the dashboard. A crew boss called
  `<img src=x onerror=alert(1)>` is an odd row in a table, not script running on
  the office's dashboard. This is tested.
- **CORS is restricted** to the Pages origin (plus localhost for `netlify dev`),
  not `*`.
- **GitHub's error responses are logged, not returned** — they can name the repo
  and the token's scopes.
- **The dashboard makes one API call**, listing the directory, then reads each
  record off the raw CDN. Reading each record through the API instead would
  spend one of the 60 anonymous calls an office IP gets per hour on every row.
- **A failed submit tells the crew boss what to do**: check signal and retry, or
  call the office and start the job — "this is a record, not a gate". A crew
  boss on a roof needs to know whether to start work, not to read "something
  went wrong".

## Branding

The mark at [`docs/assets/tcr_logo.png`](docs/assets/tcr_logo.png) is the real
one, extracted from page 1 of `TCR_Purpose_Statement_and_Values.pdf` with its
soft mask applied, trimmed to the artwork and sized for a phone (900 × 396,
transparent, 58 KB). Brand colors are sampled from it: red `#BA1313`, black
`#161515`.

**Both mastheads are white, and that is deliberate.** The logo is not all-red —
"ROOFING" is pure black, and so is the house silhouette under the roofline. On
the dark header this originally had, both vanished and roughly half the mark
went missing invisibly. White is the background the mark was drawn for; the
tests assert the masthead stays light so a future restyle fails loudly instead
of quietly mangling the logo. A dark header would need a light-on-dark variant
from whoever holds the source artwork.

Type is Fraunces + Spline Sans, matching CarrierCalc, so the tools look related.

## Known gaps

- ~~The logo is missing.~~ Resolved — the real mark is committed at
  [`docs/assets/tcr_logo.png`](docs/assets/tcr_logo.png), extracted from
  `TCR_Purpose_Statement_and_Values.pdf` with its transparency intact.
- **Nothing is deployed.** Every deploy step above needs account access.
- **Anyone who knows the endpoint can post a submission**, while PINs are off —
  which is the current state, deliberately, so the demo is not blocked. A name
  is just typed in. Turning PINs on closes the "filed under the wrong name" gap
  but is still not authentication; see the PIN section for what it does and
  does not buy.
- **No rate limiting** on the endpoint at all. Nothing stops someone filling
  `data/submissions/` with junk, or burning the site's function quota — which
  now matters more, since that quota is shared with CarrierCalc's lead capture.
- **Submission data is public** while the repo is. Keep the test records fake.

## Ownership and license

Short version, in full in [`NOTICE.md`](NOTICE.md):

- **The tool is JuiceWorks'.** The app, the dashboard, the function, the data
  model, and the tooling are © JuiceWorks, proprietary, all rights reserved.
  This is not open source.
- **The brand and the standards are Texas Choice Roofing's.** The name, the
  logo, the brand colours, the purpose statement, and the substance of the
  safety requirements are TCR's property. JuiceWorks claims none of it.
- **TCR's licence is free and permanent.** A perpetual, worldwide,
  royalty-free, non-exclusive licence to use, run, host, and modify the tool
  for TCR's own business — no fee, no expiry, not conditional on any continuing
  relationship. What it does not cover is reselling or licensing the tool onward
  to third parties as a product; that stays with JuiceWorks.

A one-line version of this sits in the footer of both pages.

> Like the checklist language, this is a plain statement of intent rather than a
> drafted agreement, and it names "JuiceWorks" where the exact legal entity
> still needs filling in. Worth putting in front of the same lawyer at the same
> time — it is a small addition to a review that is already happening.

## Decisions

**Repo stays public for now.** It is a demo — public is what makes the no-auth
dashboard work with no token and nothing to deploy. The tradeoff is live and
real: every crew boss name and job address in `data/submissions/` is readable by
anyone, and it stays in the git history even after the repo is later flipped to
private. So keep the test data fake. When this goes into real use the repo goes
private, the CarrierCalc-core way, and the dashboard then needs a second
function to proxy the reads with the token (an hour or two, not a redesign).

**PINs: built, switched off.** Per-crew-boss PINs are implemented end to end and
default to off, so today's demo is unblocked. See below to turn them on.

**The function is self-contained on purpose**, which is what let it move from
Netlify to a Cloudflare Worker without being rewritten.

**Retention is still open.** Every submission is a git commit, so "delete after
90 days" means rewriting history rather than deleting files. Cheaper to decide
before there is much history — and worth asking the same lawyer, since these
records cut both ways in a dispute.

## Crew boss PINs

Off by default. To turn them on, do **both** of these together:

1. Set `CREW_PINS` on the Worker (Settings -> Variables and Secrets, as a
   **Secret**) to a JSON map of PIN to name:
   `{"481027":"John Smith","730914":"Ana Reyes"}`
2. Flip `PIN_REQUIRED` to `true` in `docs/index.html`.

One without the other either adds a box nobody checks, or rejects every
submission with a 401.

With PINs on, **the roster decides who the record belongs to**, not the name
typed into the box — so a crew boss cannot file under someone else's name. The
PIN is never written into the submission file; these files are public. If the
typed name disagrees with the roster, the roster name is recorded and the typed
one is kept alongside it as `typedName`. A `CREW_PINS` value that is set but
malformed **fails closed** — submissions are refused rather than quietly
reverting to an open checklist.

**Be clear-eyed about what this buys.** A PIN is a speed bump against someone
filing under the wrong name, not authentication:

- PINs sit in an env var in plain text. Anyone with access to the Netlify site
  can read the whole roster.
- There is no rate limiting, so a 6-digit PIN is brute-forceable in principle.
  In practice a brute-force attempt would burn through the site's function
  invocations first, which is its own problem — it would take CarrierCalc's
  lead capture down with it.
- Use 6 digits, not 4. Do not reuse anything a crew boss uses elsewhere.
- Everyone who has ever seen a crew boss's PIN can file as them, forever, until
  it is changed.

If identity ever needs to actually hold up — a dispute, an insurance claim — the
answer is a magic link to a known phone number, not a shared digit string. Worth
raising with the same lawyer.

## Still open

- **Retention.** Keep every submission forever, or roll off? See above — it is
  a history-rewrite question, not a delete-files question.
- **Nothing depends on Netlify any more.** The endpoint is a Cloudflare Worker
  and the pages are on GitHub Pages, so the paused Netlify credits no longer
  block anything here.
- **Whether the two legal placeholders should become confirmable checkboxes**
  once counsel supplies real language. Right now they are deliberately not.
