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

**1. Deploy the function to Netlify.** Connect this repo as a new Netlify site.
`netlify.toml` already sets the publish directory (`docs`), the functions
directory, and the `/submit-checklist` redirect, so there is nothing to
configure in the UI beyond the env vars.

**2. Create the token and set the env vars.** See
[`.env.example`](.env.example) for exactly how to scope the fine-grained PAT
(Contents: read & write, this repo only — nothing else). Set `GITHUB_TOKEN` and
`GITHUB_REPO` under Site configuration → Environment variables. The real token
is never committed; `.env` is gitignored.

**3. Point the form at the deployed function.** Netlify gives the site a
domain; put it in the `ENDPOINT` constant near the top of the script in
`docs/index.html`. It currently reads:

```js
var ENDPOINT = 'https://tcr-checklist.netlify.app/submit-checklist';
```

There is deliberately no `?api=` URL override — that would let anyone hand a
crew boss a link that quietly posts the crew's details somewhere else.

**4. Enable GitHub Pages.** Settings → Pages → Source: *Deploy from a branch*,
branch `main`, folder `/docs`.

**5. Run one end-to-end test.** Submit the form on a phone and confirm the
record appears in `data/submissions/` and on the dashboard.

> Steps 1, 2, 4 and 5 need account access and a token, so they have **not** been
> done — the code is ready but nothing is deployed or tested end to end against
> the real GitHub API yet. Everything is verified against a mocked API (below).

## Tests

```bash
node tools/verify-checklist-sync.js      # the two copies of the checklist agree
node tools/test-submit-checklist.js      # the function, against a mocked GitHub API

# needs playwright available; deliberately not a declared dependency
NODE_PATH=$(npm root -g) node tools/test-pages.js
```

`tools/test-pages.js` drives both pages in a real browser: validation, the full
submit flow, the exact payload the function will receive, hostile input, and the
dashboard's populated / empty / rate-limited / offline states. 112 assertions
across the function and browser suites, all passing.

The checklist wording lives in two places — `checklist-items.json` (canonical,
what the function validates against) and the `CHECKLIST` array in
`docs/index.html` (what a crew boss reads). **Edit one, edit both**, then run
`verify-checklist-sync.js`. The function rejects any submission whose item text
does not match the canonical list, so drift would otherwise turn every
submission into a 400.

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
  "checklistVersion": "0.1.0-prototype",
  "prototype": true,
  "legalReviewPending": true
}
```

`submittedAt` is the server's clock and is what the filename and the dashboard
use; `clientSubmittedAt` is what the phone reported, kept beside it because a
phone's clock is whatever the phone says it is.

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

## Known gaps

- **The logo is missing.** The spec said `tcr_logo.png` was included in the
  delivery; no such file arrived, so there was nothing to commit. Both pages
  reference `assets/tcr_logo.png` and fall back to a CSS/SVG wordmark until it
  exists. Dropping the real PNG at `docs/assets/tcr_logo.png` is the whole fix —
  no code change. See [`docs/assets/README.md`](docs/assets/README.md), which
  also explains why it is `docs/assets/` and not the repo root.
- **Nothing is deployed.** Deploy steps 1, 2, 4 and 5 above need account access.
- **Anyone who knows the endpoint can post a submission.** There is no
  authentication and no rate limit; a name is just typed in. Fine for a
  prototype, not fine as the real workflow — see the open questions.

## Open questions for Justin

**1. Should this repo be public or private?** It is public now, which is what
makes the no-auth dashboard work: it reads `data/submissions/` straight from
GitHub with no token. The tradeoff is that **every crew boss name and job
address is publicly readable by anyone**, including search engines, forever.
Making the repo private breaks the dashboard as built — reading submissions
would then need a token, which means a second Netlify function to proxy the
reads (an hour or two of work, not a redesign). Worth deciding before real jobs
go through it, because submissions already committed to a public repo stay in
the git history even after the repo is flipped to private.

**2. Do you want a PIN or phone-number check per crew boss?** Right now a
submission is just a typed name, so anyone with the link can file one under
anyone's name — which undercuts the point if these records are ever meant to
show who confirmed what. Out of scope for v1 as agreed, but this is the gap that
matters most before it becomes the real workflow. A per-crew-boss PIN is the
cheap version; a magic link to a known phone number is the sturdier one.

**3. Retention — keep every submission forever, or roll off?** Every submission
is a git commit, so "delete after 90 days" means rewriting history, not just
removing files. If there is any chance of a retention policy, it is much cheaper
to decide now than to unpick later. Related: these records could be either an
asset or a liability in a dispute, which is really a question for the same lawyer
reviewing the checklist language.

**4. Which Netlify site should the function live on?** It could go on the
existing `juiceworks-api` site alongside the CarrierCalc lead endpoint (one site
to maintain, one set of env vars) or on its own. This repo is set up for its own
site; say the word and it can point at the existing one instead.
