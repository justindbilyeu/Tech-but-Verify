//   node tools/test-adapter.mjs
//
// The adapter that lets the Netlify handler run on a Worker. Two things have to
// hold: the handler must not be able to tell the difference, and the shims must
// agree with the Node originals they stand in for - especially on base64, where
// btoa quietly mangles anything past Latin-1 and a homeowner called Nuñez is
// not an edge case, they are a Tuesday.

import { toWorker, b64encode, b64decode, bufferShim } from '../adapters/worker.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const fn = require('../netlify/functions/submit-checklist.js');
const CANONICAL = fn._internal.canonical;

let pass = 0, fail = 0;
const check = (l, c, x) => {
  if (c) { pass++; console.log('  ok   ' + l); }
  else { fail++; console.log('  FAIL ' + l + (x !== undefined ? '  -> ' + x : '')); }
};

console.log('\n1. base64 agrees with Node, including past Latin-1');
['plain ascii', 'Nuñez', '10817 Echo Cañón Dr', 'Ω≈ç√ 🙂', '', 'a'].forEach((s) => {
  check('encode ' + JSON.stringify(s),
    b64encode(s) === Buffer.from(s, 'utf8').toString('base64'),
    b64encode(s) + ' vs ' + Buffer.from(s, 'utf8').toString('base64'));
  check('round trip ' + JSON.stringify(s), b64decode(b64encode(s)) === s);
});
// The path the handler actually walks: a whole JSON record out, and a base64
// request body back in.
const rec = JSON.stringify({ name: 'Nuñez', note: 'ridge — 40 ft, 5×5' }, null, 2) + '\n';
check('a full record matches Node byte for byte',
  b64encode(rec) === Buffer.from(rec, 'utf8').toString('base64'));

console.log('\n2. the Buffer shim covers what is called, and refuses the rest');
const B = bufferShim();
check('from(str, utf8).toString(base64)',
  B.from(rec, 'utf8').toString('base64') === Buffer.from(rec, 'utf8').toString('base64'));
check('from(b64, base64).toString(utf8)',
  B.from(b64encode(rec), 'base64').toString('utf8') === rec);
check('from(str) defaults to utf8',
  B.from('hi').toString('base64') === Buffer.from('hi').toString('base64'));
const throws = (f) => { try { f(); return false; } catch (e) { return /unsupported/.test(e.message); } };
check('an encoding it does not do throws instead of guessing',
  throws(() => B.from('x', 'hex')) && throws(() => B.from('x').toString('hex')));
check('byteLength counts utf-8 bytes, not characters',
  B.byteLength('Nuñez') === Buffer.byteLength('Nuñez') && B.byteLength('Nuñez') === 6);

console.log('\n3. the request the handler sees');
let seen = null;
const spy = toWorker(async (event) => { seen = event; return { statusCode: 200, headers: {}, body: '{}' }; });
await spy.fetch(new Request('https://x.dev/submit?a=1&b=two', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': 'https://o.dev' },
  body: '{"hello":"there"}'
}), {});
check('httpMethod', seen.httpMethod === 'POST');
check('body arrives as text', seen.body === '{"hello":"there"}');
check('headers are lower-cased the way Netlify does',
  seen.headers.origin === 'https://o.dev' && seen.headers['content-type'] === 'application/json');
check('path', seen.path === '/submit');
check('query string', seen.queryStringParameters.a === '1' && seen.queryStringParameters.b === 'two');
check('isBase64Encoded is false, since the body came through as text',
  seen.isBase64Encoded === false);

await spy.fetch(new Request('https://x.dev/submit', { method: 'OPTIONS' }), {});
check('a preflight is not asked for a body it does not have', seen.body === '');

console.log('\n4. secrets come off the binding, not the environment');
// A Worker isolate is reused across requests, so the adapter has to put back
// exactly what it displaced. Otherwise the first bindings an isolate ever sees
// become permanent: a rotated token never takes, and one request's config is
// still answering the next one's.
const KEY = 'ADAPTER_TEST_SECRET';
delete process.env[KEY];
let sawSecret = null;
const envSpy = toWorker(async () => {
  sawSecret = process.env[KEY];
  return { statusCode: 200, headers: {}, body: '{}' };
});
const hit = (env) => envSpy.fetch(
  new Request('https://x.dev/', { method: 'POST', body: '{}' }), env);

await hit({ [KEY]: 'from-binding' });
check('a Worker binding reaches process.env', sawSecret === 'from-binding');
await hit({ [KEY]: 'rotated' });
check('a rotated binding takes effect on the very next request', sawSecret === 'rotated');
await hit({});
check('a key the adapter invented does not outlive the request that set it',
  sawSecret === undefined && !(KEY in process.env), sawSecret);

process.env[KEY] = 'pre-existing';
await hit({ [KEY]: 'from-binding' });
check('a binding wins over a value that was already in the environment',
  sawSecret === 'from-binding');
await hit({});
check('and the pre-existing value is put back, not deleted',
  sawSecret === 'pre-existing', sawSecret);
delete process.env[KEY];

console.log('\n5. a handler that goes wrong does not put a stack on a phone');
const boom = toWorker(async () => { throw new Error('token=ghp_secret leaked'); });
const bad = await boom.fetch(new Request('https://x.dev/', { method: 'POST', body: '{}' }), {});
check('it is a 500', bad.status === 500);
const badBody = await bad.text();
check('the message does not travel', !/ghp_secret/.test(badBody), badBody);
check('it is still JSON', JSON.parse(badBody).error === 'Server error.');
const shapeless = toWorker(async () => ({ oops: true }));
check('a handler returning the wrong shape is a 500, not a crash',
  (await shapeless.fetch(new Request('https://x.dev/', { method: 'POST', body: '{}' }), {})).status === 500);

console.log('\n6. the real handler, end to end, with no network');
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  calls.push({ url: String(url), opts });
  return { ok: true, status: 201, text: async () => '{}' };
};

const worker = toWorker(fn.handler);
const ORIGIN = 'https://justindbilyeu.github.io';
const ENV = { GITHUB_TOKEN: 'test-token', GITHUB_REPO: 'justindbilyeu/Tech-but-Verify',
              ALLOWED_ORIGIN: ORIGIN };

// The handler checks the items against its own canonical list, in order, text
// and all - so the payload is built from that list rather than typed out here.
// The legal placeholders must come back unconfirmed; confirming one is itself
// a rejection.
function body(over) {
  const items = CANONICAL.categories.flatMap((c) => c.items.map((i) => ({
    id: i.id, text: i.text, confirmed: i.pendingLegalReview ? false : true
  })));
  return Object.assign({
    crewBossName: 'Nuñez', jobAddress: '10817 Echo Cañón Dr, Austin, TX', items
  }, over || {});
}
const post = (b, origin, env) => worker.fetch(new Request('https://x.dev/submit-checklist', {
  method: 'POST',
  headers: Object.assign({ 'Content-Type': 'application/json' },
    origin === null ? {} : { Origin: origin || ORIGIN }),
  body: typeof b === 'string' ? b : JSON.stringify(b)
}), env || ENV);

const ok = await post(body());
check('a completed checklist is a 200', ok.status === 200, ok.status + ' ' + await ok.clone().text());
check('it wrote once, to the Contents API',
  calls.length === 1 && /api\.github\.com\/repos\/.*\/contents\//.test(calls[0].url),
  calls[0] && calls[0].url);
const written = JSON.parse(
  Buffer.from(JSON.parse(calls[0].opts.body).content, 'base64').toString('utf8'));
check('the crew boss name survived the trip with its accents intact',
  written.crewBossName === 'Nuñez', written.crewBossName);
check('and the address did too',
  written.jobAddress === '10817 Echo Cañón Dr, Austin, TX', written.jobAddress);

const pre = await worker.fetch(new Request('https://x.dev/submit-checklist', {
  method: 'OPTIONS', headers: { Origin: ORIGIN } }), ENV);
check('a preflight is 204 with no body', pre.status === 204 && (await pre.text()) === '');
check('and carries the allow-origin header',
  pre.headers.get('access-control-allow-origin') === ORIGIN);

check('an origin that is not allowed is refused',
  (await post(body(), 'https://evil.example')).status === 403);
check('a body that is not JSON is a 400', (await post('not json')).status === 400);
check('a GET is 405',
  (await worker.fetch(new Request('https://x.dev/submit-checklist'), ENV)).status === 405);
const unticked = body();
unticked.items[0].confirmed = false;
check('an unticked item is still rejected under the adapter',
  (await post(unticked)).status === 400);
const forged = body();
const pendingAt = forged.items.findIndex((_, i) =>
  CANONICAL.categories.flatMap((c) => c.items)[i].pendingLegalReview);
if (pendingAt !== -1) {
  forged.items[pendingAt].confirmed = true;
  check('confirming a legal placeholder is still rejected',
    (await post(forged)).status === 400);
}

console.log('\n7. PINs still fail closed on a binding');
// The roster reads process.env.CREW_PINS. On a Worker that arrives as a secret
// binding, and the rule that a malformed roster locks the door rather than
// opening it has to survive the trip.
calls.length = 0;
const pinned = Object.assign({}, ENV, { CREW_PINS: '{"1234":"Sample Crew Boss"}' });
check('a good PIN is accepted', (await post(body({ pin: '1234' }), ORIGIN, pinned)).status === 200);
check('and the roster name is what gets filed',
  JSON.parse(Buffer.from(JSON.parse(calls[0].opts.body).content, 'base64').toString('utf8'))
    .crewBossName === 'Sample Crew Boss');
check('a wrong PIN is refused', (await post(body({ pin: '9999' }), ORIGIN, pinned)).status === 401);
check('a missing PIN is refused when a roster is configured',
  (await post(body(), ORIGIN, pinned)).status === 401);
const broken = Object.assign({}, ENV, { CREW_PINS: '{not json' });
check('a malformed roster fails CLOSED, it does not reopen the form',
  (await post(body({ pin: '1234' }), ORIGIN, broken)).status >= 400,
  (await post(body({ pin: '1234' }), ORIGIN, broken)).status);
check('the PIN is never written into the record',
  !JSON.stringify(calls.map((c) => c.opts.body)).includes('1234'));

console.log('\n8. the same run with Buffer genuinely absent');
const RealBuffer = globalThis.Buffer;
calls.length = 0;
const req = new Request('https://x.dev/submit-checklist', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
  body: JSON.stringify(body())
});
const bodyText = await req.clone().text();
const plainReq = {
  method: 'POST', url: 'https://x.dev/submit-checklist',
  headers: { forEach: (f) => { f('application/json', 'Content-Type'); f(ORIGIN, 'Origin'); } },
  text: async () => bodyText
};
let noBuffer;
try {
  delete globalThis.Buffer;
  check('Buffer really is gone', typeof globalThis.Buffer === 'undefined');
  noBuffer = await toWorker(fn.handler).fetch(plainReq, ENV);
  check('the shim got installed in its place', typeof globalThis.Buffer === 'object');
} finally {
  globalThis.Buffer = RealBuffer;
  check('a submission with no Buffer is still a 200',
    noBuffer && noBuffer.status === 200, noBuffer && (noBuffer.status || 'threw'));
  check('and it wrote the same bytes the Node run did',
    calls.length === 1 &&
    JSON.parse(RealBuffer.from(JSON.parse(calls[0].opts.body).content, 'base64').toString('utf8'))
      .jobAddress === '10817 Echo Cañón Dr, Austin, TX',
    calls.length ? 'wrote ' + calls.length : 'no call');
}

globalThis.fetch = realFetch;

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
