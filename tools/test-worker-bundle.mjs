//   node tools/test-worker-bundle.mjs
//
// The same suite, run against adapters/dist/ - the flattened single file that
// gets pasted into Cloudflare's dashboard - rather than against the sources it
// was built from. A generated file nobody tested is a trap: the bundler could
// drop an export, mangle a regex, or shadow a name, and every source test would
// still pass while the thing actually deployed was broken.

import worker from '../adapters/dist/submit-checklist.worker.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const CANONICAL = require('../netlify/functions/submit-checklist.js')._internal.canonical;

let pass = 0, fail = 0;
const check = (l, c, x) => {
  if (c) { pass++; console.log('  ok   ' + l); }
  else { fail++; console.log('  FAIL ' + l + (x !== undefined ? '  -> ' + x : '')); }
};

console.log('\n1. the bundle, end to end, with no network');
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  calls.push({ url: String(url), opts });
  return { ok: true, status: 201, text: async () => '{}' };
};

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
  const name = (over && over.crewBossName) || 'Nuñez';
  return Object.assign({
    crewBossName: name, jobAddress: '10817 Echo Cañón Dr, Austin, TX', items,
    acknowledgment: {
      signed: true, signedAt: '2026-09-04T13:00:00.000Z', signerName: name,
      statementVersion: 'placeholder-pending-legal-review', imageStored: false
    }
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

console.log('\n2. PINs still fail closed on a binding');
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

console.log('\n3. the same run with Buffer genuinely absent');
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
  noBuffer = await worker.fetch(plainReq, ENV);
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
