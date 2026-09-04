# Working on this repo

A pre-job safety checklist a crew boss taps through before starting. Read this
before changing anything; the README covers what each part does.

```bash
npm test                                   # sync check, function, adapter, bundle
NODE_PATH=$(npm root -g) npm run test:pages   # both pages, in a real browser
npm run build:worker                       # regenerate the pasteable Worker file
```

## The checklist text lives in three places and they must agree

`checklist-items.json` is the original. `docs/index.html` carries a copy because
the page renders from it. `netlify/functions/submit-checklist.js` carries
another because it validates against it and gets deployed **alone**, where this
repo's root is not on disk — a `require` would throw on the first invocation.

`tools/verify-checklist-sync.js` runs first in `npm test` and fails on drift.
The function matches submitted item text against its canonical copy exactly, so
a stray curly apostrophe in one copy 400s every submission. That has happened.

## Things that are decisions, not defaults

- **The two legal placeholders render as visibly unfinished** and cannot be
  confirmed. The function rejects a submission that ticks one. They stay that
  way until counsel supplies real language.
- **A malformed `CREW_PINS` fails closed.** Set-but-unreadable refuses
  submissions rather than falling back to an open checklist. A typo in a
  dashboard must not quietly reopen the form.
- **The PIN never reaches the record.** The roster name wins over the typed one.
- **The masthead is light on purpose.** In the TCR mark, "ROOFING" and the house
  under the roofline are solid black — on a dark band they vanish and the red
  Texas shape floats alone. There is a comment in the CSS saying so.
- **The endpoint is hard-coded and must stay absolute https.** A relative path
  or one read from the query string would let somebody hand a crew boss a link
  that quietly posts the crew's details elsewhere. There is a test.

## The acknowledgment is not a checklist item

The signature card sits **above** the items, because the items are what is being
committed to — signing after ticking would read as an afterthought. It is a
different kind of thing from the thirteen below it: they are conditions somebody
verified, this is a commitment somebody makes.

**The drawn signature is never sent.** This repository is public and a signature
is personal data. The record carries that a signature was taken, by whom, and
when — the function refuses a payload containing an image or an `imageStored`
flag, so that turning storage on later is a deliberate act in the function
rather than an accident in the page. It happens **after** the repo is private,
not before.

The statement itself is a placeholder like the other two, and it says out loud
that counsel should confirm it does not cut across the independent-contractor
arrangement. Do not draft that language.

## Where it runs

Pages are on GitHub Pages from `/docs`. The submit endpoint is a **Cloudflare
Worker** built from `adapters/` on every push to `main` — root directory
`adapters`, deploy command `npx wrangler deploy`. Netlify is out of the path;
`adapters/README.md` explains why and keeps the Netlify instructions for anyone
who wants them back.

`adapters/dist/` is **generated** by `tools/build-worker-bundle.js` and committed
so it can be copied out of GitHub on a phone. `npm test` fails if it is stale —
it is the file somebody pastes believing it is the code that passed the tests.
