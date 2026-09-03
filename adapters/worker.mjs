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
//   import { toWorker } from './worker.js';
//   import fn from '../netlify/functions/submit-checklist.js';
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
export function b64encode(str) {
  return btoa(bytesToBinary(new TextEncoder().encode(String(str))));
}

export function b64decode(b64) {
  const bin = atob(String(b64));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// Enough Buffer for what the handlers actually call, and no more. Pretending to
// be Buffer in general would be a trap for the next person: this covers
// Buffer.from(x, 'utf8'|'base64').toString('base64'|'utf8') and nothing else,
// and says so loudly if asked for anything past that.
export function bufferShim() {
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

export function toWorker(handler) {
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
