// GENERATED - do not edit. Source: adapters/worker.mjs + netlify/functions/submit-checklist.js
// Rebuild with: node tools/build-worker-bundle.js
//
// TCR crew boss checklist endpoint, flattened into one file for Cloudflare's dashboard editor.
//
// To deploy without a terminal:
//   1. Cloudflare dashboard -> Workers & Pages -> Create -> Start from Hello World
//   2. Deploy it, then Edit code, select all, paste this file over it, Deploy
//   3. Settings -> Variables:
//        GITHUB_TOKEN    Secret     fine-grained PAT, Contents read+write
//        GITHUB_REPO     Secret     owner/repo
//        ALLOWED_ORIGIN  Text       https://justindbilyeu.github.io
//   4. Copy the worker's URL and put it in ENDPOINT on the page

/* ---------- adapter ---------- */
// Runs a Netlify-style function on Cloudflare Workers (or Deno Deploy, or
// anything else that speaks the Fetch API) without touching the function.
//
// Why this exists: Netlify pauses production deploys when a team runs out of
// credits. The sites stay up, the code stops shipping. That is a fine trade for
// a hobby project and a bad one for a form a crew boss opens every morning, so
// the handler stays portable and where it runs becomes a deploy decision rather
// than a rewrite.
//
// This file is kept identical to the one in tcr-estimator on purpose. If you
// fix something here, fix it there.
//
//   (bundled below)
//   (bundled below)
//   export default toWorker(fn.handler);
//
// The handler keeps the Netlify contract exactly:
//   in    { httpMethod, headers, body, isBase64Encoded, path, queryStringParameters }
//   out   { statusCode, headers, body }
//
// It reads config from process.env and encodes with Buffer, neither of which a
// Worker has. Rather than rewrite it to take a config object - which would mean
// the tested, deployed, working thing changes shape to suit its host - this
// fills both in. Only when they are missing: on Node, or on a Worker with
// nodejs_compat, the real ones are already there and nothing is touched.

const BIN = 0x8000;   // chunk size for String.fromCharCode, well under the arg limit

function bytesToBinary(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += BIN) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + BIN));
  }
  return s;
}

// btoa and atob are Latin-1. A homeowner called Nuñez would come out mangled,
// or throw, so the bytes go through TextEncoder rather than the string.
function b64encode(str) {
  return btoa(bytesToBinary(new TextEncoder().encode(String(str))));
}

function b64decode(b64) {
  const bin = atob(String(b64));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// Enough Buffer for what the handlers actually call, and no more. Pretending to
// be Buffer in general would be a trap for the next person: this covers
// Buffer.from(x, 'utf8'|'base64').toString('base64'|'utf8') and nothing else,
// and says so loudly if asked for anything past that.
function bufferShim() {
  return {
    // Not called by the handlers. It is here because Node's own fetch
    // implementation calls Buffer.byteLength when it builds a Response, so
    // without it the shim cannot be exercised under Node at all - and a shim
    // that can only be tested in production is not tested.
    byteLength(s) { return new TextEncoder().encode(String(s)).length; },
    from(input, encoding) {
      const enc = encoding || 'utf8';
      if (enc !== 'utf8' && enc !== 'base64') {
        throw new Error('worker Buffer shim: unsupported input encoding "' + enc + '"');
      }
      const text = enc === 'base64' ? b64decode(input) : String(input);
      return {
        toString(out) {
          const o = out || 'utf8';
          if (o === 'utf8') return text;
          if (o === 'base64') return b64encode(text);
          throw new Error('worker Buffer shim: unsupported output encoding "' + o + '"');
        }
      };
    }
  };
}

// Netlify lower-cases header names. Workers preserve what the client sent, and
// the handler checks `origin` before `Origin`, so normalizing here is not
// cosmetic - it is the difference between a CORS check that runs and one that
// silently sees nothing.
function headerMap(request) {
  const out = {};
  request.headers.forEach((v, k) => { out[k.toLowerCase()] = v; });
  return out;
}

// Secrets arrive as bindings on `env`, not on process.env, and the handler only
// knows how to read process.env. So the bindings get copied across on every
// request.
//
// Every request, not just the first, and overwriting rather than filling gaps.
// A Worker isolate is reused across requests, so a version of this that skipped
// keys already present made the first bindings an isolate ever saw permanent: a
// rotated token would never take, and a value from one request could still be
// answering the next. That is the sort of bug you find in production at the
// worst moment, so anything a previous request put there is put back first.
// It remembers, per key, exactly what it displaced, and puts that back the
// moment a request stops supplying the key. So a binding always wins while it
// is set, a rotated one takes effect on the very next request, and nothing an
// earlier request left behind can answer a later one.
let applied = new Map();   // key -> the value it displaced (undefined = absent)

function applyEnv(env) {
  if (!globalThis.process) globalThis.process = { env: {} };
  if (!globalThis.process.env) globalThis.process.env = {};
  const pe = globalThis.process.env;
  const e = env || {};
  const has = (k) => Object.prototype.hasOwnProperty.call(pe, k);

  for (const [k, displaced] of applied) {
    if (typeof e[k] !== 'string') {
      if (displaced === undefined) delete pe[k];
      else pe[k] = displaced;
    }
  }

  const next = new Map();
  for (const k of Object.keys(e)) {
    if (typeof e[k] !== 'string') continue;
    next.set(k, applied.has(k) ? applied.get(k) : (has(k) ? pe[k] : undefined));
    pe[k] = e[k];
  }
  applied = next;
}

function toWorker(handler) {
  if (typeof handler !== 'function') {
    throw new Error('toWorker: expected a handler function');
  }
  return {
    async fetch(request, env, ctx) {
      applyEnv(env);
      if (!globalThis.Buffer) globalThis.Buffer = bufferShim();

      const url = new URL(request.url);
      const query = {};
      url.searchParams.forEach((v, k) => { query[k] = v; });

      // A GET or OPTIONS has no body and asking for one on some runtimes
      // throws rather than returning ''.
      const hasBody = request.method !== 'GET' && request.method !== 'HEAD' &&
                      request.method !== 'OPTIONS';

      const event = {
        httpMethod: request.method,
        headers: headerMap(request),
        path: url.pathname,
        queryStringParameters: query,
        body: hasBody ? await request.text() : '',
        isBase64Encoded: false
      };

      let out;
      try {
        out = await handler(event, ctx);
      } catch (err) {
        // The handler's own errors are already shaped and safe. This is for the
        // ones that got out, and it must not put an exception on a phone.
        console.error('worker adapter: handler threw', err && err.stack ? err.stack : err);
        return new Response(JSON.stringify({ error: 'Server error.' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } });
      }

      if (!out || typeof out.statusCode !== 'number') {
        console.error('worker adapter: handler returned no statusCode', out);
        return new Response(JSON.stringify({ error: 'Server error.' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(
        out.statusCode === 204 ? null : (out.body === undefined ? '' : out.body),
        { status: out.statusCode, headers: out.headers || {} });
    }
  };
}

/* ---------- handler ---------- */
const module = { exports: {} };
const exports = module.exports;
{
  'use strict';
  
  // Receives a pre-job checklist from docs/index.html and files it as one JSON
  // file in data/submissions/ via the GitHub Contents API.
  //
  // Why a function at all: GitHub Pages is static, and the token that can write
  // to the repo must never reach a phone. This is the only piece that holds a
  // credential, so it stays small and refuses anything it does not recognise.
  //
  // Env vars (see .env.example):
  //   GITHUB_TOKEN    fine-grained PAT, Contents: read+write on this repo only
  //   GITHUB_REPO     "owner/repo", e.g. justindbilyeu/Tech-but-Verify
  //   GITHUB_BRANCH   optional, defaults to the repo default branch
  //   ALLOWED_ORIGIN  optional, overrides the Pages origin allowed below
  //   CREW_PINS       optional, turns on per-crew-boss PINs (see roster() below)
  
  // The checklist, inlined rather than required from checklist-items.json at the
  // repo root. This file is deployed on its own into the juiceworks-api Netlify
  // site, in a different repo, where that relative path does not exist -- a
  // require would throw on the first invocation. Carrying its own copy makes the
  // function a single file you can drop into any Netlify site.
  //
  // The cost is a third copy of the wording. `node tools/verify-checklist-sync.js`
  // compares all three (this, checklist-items.json, docs/index.html) and fails on
  // any drift, so it cannot rot quietly.
  const CANONICAL = {
    version: '0.1.0-prototype',
    categories: [
      { name: 'Safety', items: [
        { id: 's1', text: 'Fall protection equipment is in place and inspected' },
        { id: 's2', text: 'Hard hats, gloves, and eye protection worn by all crew' },
        { id: 's3', text: 'Ladders are properly placed and secured' },
        { id: 's4', text: 'All crew members are fit for duty — rested, hydrated, and unimpaired by drugs or alcohol' },
        { id: 's5', text: 'First aid kit is on site and accessible' },
        { id: 's6', text: 'Weather checked — no lightning, high wind, or storm risk' }
      ] },
      { name: 'Visibility', items: [
        { id: 'v1', text: 'High-visibility gear worn where required (near roadway/traffic)' },
        { id: 'v2', text: 'Job site is clearly marked for homeowners and passersby' },
        { id: 'v3', text: 'Vehicles and equipment are parked safely and visibly' }
      ] },
      { name: 'Cleanliness', items: [
        { id: 'c1', text: 'Work area is clear of debris and trip hazards before starting' },
        { id: 'c2', text: 'Materials are staged neatly and the site will be kept clean throughout the job' }
      ] },
      { name: 'Crew readiness', items: [
        { id: 'r1', text: 'Crew has water on site and scheduled breaks planned' },
        { id: 'r2', text: 'Crew has been briefed on today\'s hazards and job scope' },
        { id: 'r3', text: '[LEGAL PLACEHOLDER — independent contractor acknowledgment / liability language, to be drafted by counsel]', pendingLegalReview: true },
        { id: 'r4', text: '[LEGAL PLACEHOLDER — OSHA reference / regulatory citation, to be confirmed by counsel]', pendingLegalReview: true }
      ] }
    ]
  };
  
  const DEFAULT_ORIGINS = [
    'https://justindbilyeu.github.io',
    'http://localhost:8888',
    'http://127.0.0.1:8888'
  ];
  
  const MAX_BODY = 32 * 1024; // a checklist is ~4KB; anything near this is not one
  
  // ── Helpers ─────────────────────────────────────────────────────────────────
  
  // Item text is compared against the canonical list, and a curly apostrophe or a
  // stray double space should not turn a good submission into a 400. Normalise
  // the typography that survives a copy-paste, then compare.
  function norm(s) {
    return String(s)
      .normalize('NFC')
      .replace(/[\u2018\u2019\u02bc]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2013\u2014]/g, '\u2014')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // The crew boss name becomes part of a file path in the repo. Allow only what
  // is safe there -- no dots, no slashes, nothing that could climb a directory.
  function slug(name) {
    const s = String(name)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '');
    return s || 'unnamed';
  }
  
  function corsHeaders(origin) {
    const allowed = process.env.ALLOWED_ORIGIN
      ? [process.env.ALLOWED_ORIGIN]
      : DEFAULT_ORIGINS;
    const h = {
      'Content-Type': 'application/json',
      'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    };
    if (origin && allowed.indexOf(origin) !== -1) {
      h['Access-Control-Allow-Origin'] = origin;
    }
    return h;
  }
  
  function reply(status, headers, body) {
    return { statusCode: status, headers: headers, body: JSON.stringify(body) };
  }
  
  // ── Validation ──────────────────────────────────────────────────────────────
  
  // The page is the friendly validator. This one assumes nothing about the caller:
  // a submission that does not match the canonical checklist exactly is rejected
  // rather than recorded, so the archive cannot fill up with items nobody wrote.
  function validate(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return 'Body must be a JSON object.';
    }
  
    const name = typeof payload.crewBossName === 'string' ? payload.crewBossName.trim() : '';
    const addr = typeof payload.jobAddress === 'string' ? payload.jobAddress.trim() : '';
    if (name.length < 2 || name.length > 80) return 'crewBossName must be 2-80 characters.';
    if (addr.length < 5 || addr.length > 200) return 'jobAddress must be 5-200 characters.';
  
    if (!Array.isArray(payload.items)) return 'items must be an array.';
  
    const expected = CANONICAL.categories.flatMap((c) =>
      c.items.map((i) => ({
        id: i.id,
        category: c.name,
        text: i.text,
        pending: !!i.pendingLegalReview
      })));
  
    if (payload.items.length !== expected.length) {
      return 'items must contain all ' + expected.length + ' checklist items, in order.';
    }
  
    for (let i = 0; i < expected.length; i++) {
      const got = payload.items[i];
      const want = expected[i];
      if (!got || typeof got !== 'object') return 'item ' + (i + 1) + ' is not an object.';
      if (got.id !== want.id) {
        return 'item ' + (i + 1) + ': expected id "' + want.id + '", got "' + got.id + '".';
      }
      if (norm(got.text) !== norm(want.text)) {
        return 'item ' + want.id + ': text does not match the current checklist. ' +
               'The page and checklist-items.json may be out of sync.';
      }
      if (typeof got.confirmed !== 'boolean') {
        return 'item ' + want.id + ': confirmed must be true or false.';
      }
      // Placeholders await counsel; nobody can meaningfully confirm one, and the
      // page does not offer it. Refuse a submission that claims otherwise.
      if (want.pending && got.confirmed === true) {
        return 'item ' + want.id + ' is pending legal review and cannot be confirmed.';
      }
      if (!want.pending && got.confirmed !== true) {
        return 'item ' + want.id + ' has not been confirmed.';
      }
    }
  
    return null;
  }
  
  // ── Crew boss PINs (optional) ───────────────────────────────────────────────
  
  // Set CREW_PINS on the Netlify site to a JSON object mapping PIN to crew boss:
  //
  //   {"481027":"John Smith","730914":"Ana Reyes"}
  //
  // Leave it unset and the checklist stays open to anyone with the link, which is
  // the prototype default. PINs live ONLY in the environment. They must never be
  // committed -- this repository is public, and a PIN in the repo is not a PIN.
  //
  // Returns an object when configured, null when not, and the string 'invalid'
  // when it is set but unreadable. That last case fails closed: a typo in the
  // Netlify UI must not quietly reopen the checklist to everyone.
  function roster() {
    const raw = process.env.CREW_PINS;
    if (!raw || !raw.trim()) return null;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return 'invalid';
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'invalid';
    const keys = Object.keys(parsed);
    if (!keys.length) return 'invalid';
    if (!keys.every((k) => typeof parsed[k] === 'string' && parsed[k].trim())) return 'invalid';
    return parsed;
  }
  
  // A PIN is a speed bump, not authentication -- see the README. Look the PIN up
  // as an own property so a crew boss typing "constructor" cannot match something
  // off the prototype chain.
  function whoseP1N(pins, pin) {
    if (typeof pin !== 'string') return null;
    const key = pin.trim();
    if (!key) return null;
    return Object.prototype.hasOwnProperty.call(pins, key) ? pins[key].trim() : null;
  }
  
  // ── GitHub write ────────────────────────────────────────────────────────────
  
  async function putFile(repo, branch, token, path, contentB64, message) {
    const body = { message: message, content: contentB64 };
    if (branch) body.branch = branch;
  
    const res = await fetch(
      'https://api.github.com/repos/' + repo + '/contents/' + path,
      {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'tcr-checklist-function',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
  
    return { ok: res.ok, status: res.status, text: await res.text() };
  }
  
  // ── Handler ─────────────────────────────────────────────────────────────────
  
  exports.handler = async function (event) {
    const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
    const headers = corsHeaders(origin);
  
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: headers, body: '' };
    }
    if (event.httpMethod !== 'POST') {
      return reply(405, headers, { error: 'Method not allowed.' });
    }
    if (!headers['Access-Control-Allow-Origin'] && origin) {
      return reply(403, headers, { error: 'Origin not allowed.' });
    }
  
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || '';
    if (!token || !repo) {
      console.error('submit-checklist: GITHUB_TOKEN or GITHUB_REPO is not set');
      return reply(500, headers, { error: 'Server is not configured.' });
    }
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
      console.error('submit-checklist: GITHUB_REPO is not "owner/repo"');
      return reply(500, headers, { error: 'Server is not configured.' });
    }
  
    const raw = event.body || '';
    if (raw.length > MAX_BODY) {
      return reply(413, headers, { error: 'Submission too large.' });
    }
  
    let payload;
    try {
      payload = JSON.parse(event.isBase64Encoded
        ? Buffer.from(raw, 'base64').toString('utf8')
        : raw);
    } catch (e) {
      return reply(400, headers, { error: 'Body is not valid JSON.' });
    }
  
    const problem = validate(payload);
    if (problem) return reply(400, headers, { error: problem });
  
    // Identity, when the site is configured for it.
    const pins = roster();
    if (pins === 'invalid') {
      console.error('submit-checklist: CREW_PINS is set but unreadable; refusing ' +
                    'submissions rather than falling back to an open checklist');
      return reply(500, headers, { error: 'Server is not configured.' });
    }
    let verifiedName = null;
    if (pins) {
      verifiedName = whoseP1N(pins, payload.pin);
      if (!verifiedName) {
        return reply(401, headers, {
          error: 'That PIN was not recognised. Check it and try again, or call the office.'
        });
      }
    }
  
    // The phone's clock is whatever the phone says it is. Order the archive by
    // the time the record actually arrived, and keep the device's claim beside it.
    const receivedAt = new Date();
    const stamp = receivedAt.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
    // With PINs on, the roster is the authority on who this is -- not the name
    // typed into the box. The PIN itself is never recorded: these files are
    // public.
    const name = verifiedName || payload.crewBossName.trim();
    const who = slug(name);
  
    const record = {
      crewBossName: name,
      jobAddress: payload.jobAddress.trim(),
      submittedAt: receivedAt.toISOString(),
      clientSubmittedAt: typeof payload.submittedAt === 'string'
        ? payload.submittedAt.slice(0, 40) : null,
      items: payload.items.map(function (it, i) {
        const want = CANONICAL.categories.flatMap(function (c) {
          return c.items.map(function (x) { return { c: c.name, x: x }; });
        })[i];
        const rec = {
          id: want.x.id,
          category: want.c,
          text: want.x.text,        // canonical text, never the client's copy
          confirmed: it.confirmed === true
        };
        if (want.x.pendingLegalReview) rec.pendingLegalReview = true;
        return rec;
      }),
      allConfirmed: false,
      identityVerified: !!verifiedName,
      typedName: verifiedName && verifiedName !== payload.crewBossName.trim()
        ? payload.crewBossName.trim() : undefined,
      checklistVersion: CANONICAL.version,
      prototype: true,
      legalReviewPending: true
    };
    record.allConfirmed = record.items
      .filter(function (i) { return !i.pendingLegalReview; })
      .every(function (i) { return i.confirmed; });
  
    const contentB64 = Buffer
      .from(JSON.stringify(record, null, 2) + '\n', 'utf8')
      .toString('base64');
    const message = 'checklist: ' + name + ' at ' + record.jobAddress;
  
    // Two crew bosses submitting in the same second would collide on the path.
    // A second attempt with a short suffix is cheaper than losing a record.
    let path = 'data/submissions/' + stamp + '_' + who + '.json';
    let res = await putFile(repo, branch, token, path, contentB64, message);
  
    if (!res.ok && (res.status === 409 || res.status === 422)) {
      path = 'data/submissions/' + stamp + '_' + who + '-' +
             Math.random().toString(36).slice(2, 6) + '.json';
      res = await putFile(repo, branch, token, path, contentB64, message);
    }
  
    if (!res.ok) {
      // The GitHub response can name the repo and the token's scopes. Log it,
      // do not hand it to the phone.
      console.error('submit-checklist: GitHub write failed', res.status, res.text.slice(0, 500));
      return reply(502, headers, { error: 'Could not file the checklist. Please try again.' });
    }
  
    return reply(200, headers, { ok: true, path: path, submittedAt: record.submittedAt });
  };
  
  // Exported for tests.
  exports._internal = { norm: norm, slug: slug, validate: validate, canonical: CANONICAL };
}

export default toWorker(module.exports.handler);
