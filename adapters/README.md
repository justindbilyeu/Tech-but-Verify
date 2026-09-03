# Deploying the endpoint somewhere other than Netlify

The submit handler in `netlify/functions/` is unchanged and still deploys to
Netlify. This directory only adds a second place it can run.

## Why

Netlify pauses **production deploys** when a team runs out of credits. Published
sites stay live; new code stops shipping. That is a fine trade for a hobby
project and a bad one for a form a crew boss opens every morning — the failure
mode is that a fix exists and cannot be deployed.

So the handler stays portable, and where it runs becomes a deploy decision
rather than a rewrite.

## Deploy with no terminal (from a phone, if it comes to that)

[`dist/submit-checklist.worker.mjs`](dist/submit-checklist.worker.mjs) is the
adapter and the handler flattened into one file. Nothing to install.

1. Cloudflare dashboard -> **Workers & Pages** -> **Create** -> Hello World -> Deploy
2. **Edit code**, select all, paste that file over it, **Deploy**
3. **Settings -> Variables**:

   | Name | Type | Value |
   |---|---|---|
   | `GITHUB_TOKEN` | Secret | fine-grained PAT, Contents read+write on this repo |
   | `GITHUB_REPO` | Secret | `justindbilyeu/Tech-but-Verify` |
   | `CREW_PINS` | Secret | optional; JSON, and malformed still fails closed |
   | `ALLOWED_ORIGIN` | Text | `https://justindbilyeu.github.io` |

4. Copy the worker's URL into `ENDPOINT` in `docs/index.html`

The bundle is generated and committed, and `npm test` fails if it has gone
stale — it is the file someone copies out of GitHub believing it is the code
that passed the tests, so it had better be. The full end-to-end suite runs
against the bundle as well as the sources, because a bundler that drops an
export would otherwise leave every source test passing and the deployed thing
broken.

```bash
npm run build:worker     # rebuild it after changing the handler
```

## Deploy with wrangler

```bash
npx wrangler deploy --config adapters/wrangler.toml
npx wrangler secret put GITHUB_TOKEN --config adapters/wrangler.toml
npx wrangler secret put GITHUB_REPO  --config adapters/wrangler.toml
npx wrangler secret put CREW_PINS    --config adapters/wrangler.toml   # optional
```

Then point `ENDPOINT` in `docs/index.html` at the Worker's URL. That is the only
change to the page, and it is one line.

`ALLOWED_ORIGIN` lives in `wrangler.toml` under `[vars]` rather than as a
secret: it is not one, and it is worth seeing in a diff. `GITHUB_TOKEN` and
`CREW_PINS` are secrets and never go in the file — **this repository is
public**, and a PIN in the repo is not a PIN.

There is no `nodejs_compat` flag. The adapter supplies the two Node things the
handler uses — `process.env` and `Buffer` — so it runs on a stock Worker, and
would run on Deno Deploy or anything else with `fetch` unchanged.

## What the adapter actually does

| Netlify | Worker |
|---|---|
| `event.httpMethod` | `request.method` |
| `event.headers` (lower-cased) | `request.headers`, normalized |
| `event.body` | `await request.text()` |
| `process.env.X` | the `env` binding, copied across per request |
| `Buffer.from(…).toString(…)` | `TextEncoder` + `btoa`, UTF-8 correct |
| `{ statusCode, headers, body }` | `new Response(body, { status, headers })` |

Two of those are less boring than they look.

**Base64.** `btoa` is Latin-1. Encoding a crew boss called Nuñez with it either
mangles the name or throws, so the bytes go through `TextEncoder` first. There
is a test asserting the shim agrees with Node's `Buffer` byte for byte on
accented and non-Latin input.

**Environment.** A Worker isolate is reused across requests, so the adapter
remembers what each binding displaced and puts it back the moment a request
stops supplying that key. An earlier version filled in only missing keys, which
made the first bindings an isolate ever saw permanent — a rotated token would
never take effect, and one request's config could still answer the next one's.
The adapter test caught it by getting a `200` where a malformed PIN roster
should have produced a `401`. The rule that a malformed roster fails **closed**
has to survive the move, and there is a test for that too.

```bash
npm test            # includes tools/test-adapter.mjs (55 checks)
```

The adapter tests run the real handler end to end with `fetch` stubbed, and
once more with `globalThis.Buffer` deleted — which is the actual condition on a
Worker, and the only way to know the shim is exercised rather than merely
present.
