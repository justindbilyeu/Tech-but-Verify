# Pick up here

Written 3 September, from a phone in a parking lot, for a person at a desk.

Everything below is either **done** or a **numbered step you can finish in a
browser**. Nothing needs a terminal.

---

## Where things actually stand

| | Status |
|---|---|
| Checklist page | **Live** — https://justindbilyeu.github.io/Tech-but-Verify/ |
| Dashboard | **Live** — https://justindbilyeu.github.io/Tech-but-Verify/dashboard.html |
| Submit endpoint | **Deployed** — https://tcr-checklist.justindbilyeu.workers.dev |
| Submit actually working | **No.** Two secrets missing. That is step 1. |
| Netlify | **Out of the path entirely.** Nothing here needs it. |
| Tests | 266 assertions, all passing |

The Worker is live but refuses every submission with
`500 Server is not configured`, on purpose, because it has no GitHub token yet.
That is the last thing between here and a working form.

---

## 1. Two secrets on the Worker  ·  5 minutes

You need a GitHub token first.

**Make the token** — github.com/settings/personal-access-tokens → **Generate
new token**

- Name: `tcr-checklist worker`
- **Expiration:** pick deliberately. On the default 30 or 90 days the checklist
  silently stops saving when it lapses and nobody is watching. Either set no
  expiration, or set a long one *and* put a calendar reminder a week out.
- Resource owner: `justindbilyeu`
- Repository access: **Only select repositories** → `Tech-but-Verify`
- Permissions → Repository permissions → **Contents: Read and write**. Nothing
  else.
- Generate. **It shows the token once.** Copy it now.

**Set them** — Cloudflare dashboard → Compute → Workers → **tcr-checklist** →
Settings → **Variables and Secrets** → Add, type **Secret**:

| Name | Value |
|---|---|
| `GITHUB_TOKEN` | the token you just copied |
| `GITHUB_REPO` | `justindbilyeu/Tech-but-Verify` |

**Then test it.** Open the checklist, tick everything, submit.

- Success screen → a JSON file appeared in `data/submissions/`. Done.
- `Server is not configured` → a secret did not save.
- "Check your signal" → CORS. `ALLOWED_ORIGIN` in `adapters/wrangler.toml`
  does not match where the page is served from.

---

## 2. Narrow the GitHub App  ·  1 minute

github.com/settings/installations → **Cloudflare Workers and Pages** →
Repository access → **Only select repositories** → `Tech-but-Verify` and
`tcr-estimator` → Save.

It is currently set to **All repositories**, and that app holds read *and write*
access to code. Nothing is wrong; the scope is just wider than it needs to be.

---

## 3. Delete the merged branch  ·  optional

`claude/tcr-crew-boss-checklist-1lhdot` is fully merged into `main`. Safe to
delete on GitHub whenever.

---

## Still open, and not blocking anything

- **Legal.** Two checklist items are deliberate placeholders and render as
  visibly unfinished. The independent-contractor framing, the photography
  clause (currently says "internally"), `NOTICE.md`, and the public-adjuster
  line all want a lawyer's eye before this is used in earnest.
- **PINs are off.** `PIN_REQUIRED = false` in `docs/index.html`. Turning them on
  means setting `CREW_PINS` as a Worker secret *and* flipping that flag —
  one without the other either adds a box nobody checks or rejects every
  submission. See the PIN section of the README first: it is a speed bump
  against filing under the wrong name, not authentication.
- **Retention.** Every submission is a git commit, so "delete after 90 days"
  means rewriting history, not deleting files. Cheaper to decide before there
  are three hundred of them.
- **Repo is public.** Fine for a prototype. Worth revisiting before real crew
  names and job addresses accumulate in it.

---

## The sister project

`tcr-estimator` (private) has its own `PICKUP.md` with the same shape. It is
further behind: the Worker is written and tested but has never been deployed,
and the inspection page is not hosted anywhere yet.
