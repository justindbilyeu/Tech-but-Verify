'use strict';
process.env.GITHUB_TOKEN = 'ghp_faketoken';
process.env.GITHUB_REPO = 'justindbilyeu/Tech-but-Verify';

// Exercises the function against a mocked GitHub API. No network, no token.
//
//   node tools/test-submit-checklist.js

const path = require('path');
const ROOT = path.join(__dirname, '..');
const CANON = require(path.join(ROOT, 'checklist-items.json'));
const fn = require(path.join(ROOT, 'netlify/functions/submit-checklist.js'));

// ── mock GitHub ─────────────────────────────────────────────────────────────
let calls = [];
let nextStatus = [201];
global.fetch = async (url, opts) => {
  calls.push({ url, body: JSON.parse(opts.body), headers: opts.headers, method: opts.method });
  const st = nextStatus.length > 1 ? nextStatus.shift() : nextStatus[0];
  return { ok: st >= 200 && st < 300, status: st, text: async () => '{"content":{}}' };
};

const ORIGIN = 'https://justindbilyeu.github.io';

function goodItems(over = {}) {
  return CANON.categories.flatMap((c) =>
    c.items.map((i) => {
      const rec = {
        id: i.id, category: c.name, text: i.text,
        confirmed: i.pendingLegalReview ? false : true
      };
      if (i.pendingLegalReview) rec.pendingLegalReview = true;
      if (over[i.id]) Object.assign(rec, over[i.id]);
      return rec;
    }));
}
function ack(o = {}) {
  return Object.assign({
    signed: true,
    signedAt: new Date().toISOString(),
    signerName: 'John Smith',
    statementVersion: 'placeholder-pending-legal-review',
    imageStored: false
  }, o);
}
function payload(o = {}) {
  const name = o.crewBossName !== undefined ? o.crewBossName : 'John Smith';
  return Object.assign({
    crewBossName: name,
    jobAddress: '1204 Oak Hollow Dr, Houston, TX 77008',
    submittedAt: new Date().toISOString(),
    items: goodItems(o.__items || {}),
    // The signer is the crew boss by definition, so it tracks whatever the
    // test set - otherwise every name test would fail on the wrong assertion.
    acknowledgment: ack(typeof name === 'string' ? { signerName: name } : {}),
    allConfirmed: true,
    prototype: true
  }, o);
}
function ev(body, o = {}) {
  return Object.assign({
    httpMethod: 'POST',
    headers: { origin: ORIGIN },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  }, o);
}

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra ? '  -> ' + extra : '')); }
}

(async () => {
  console.log('\n1. happy path');
  calls = []; nextStatus = [201];
  let r = await fn.handler(ev(payload()));
  let b = JSON.parse(r.body);
  check('200', r.statusCode === 200, r.statusCode + ' ' + r.body);
  check('CORS echoes allowed origin', r.headers['Access-Control-Allow-Origin'] === ORIGIN);
  check('one GitHub call', calls.length === 1);
  check('path shape', /^data\/submissions\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z_john-smith\.json$/.test(b.path), b.path);
  check('PUT to contents endpoint',
    calls[0].url === 'https://api.github.com/repos/justindbilyeu/Tech-but-Verify/contents/' + b.path, calls[0].url);
  check('bearer token sent', calls[0].headers.Authorization === 'Bearer ghp_faketoken');
  const rec = JSON.parse(Buffer.from(calls[0].body.content, 'base64').toString('utf8'));
  check('15 items recorded', rec.items.length === 15, rec.items.length);
  check('allConfirmed true', rec.allConfirmed === true);
  check('placeholders not confirmed',
    rec.items.filter(i => i.pendingLegalReview).every(i => i.confirmed === false));
  check('legalReviewPending flag', rec.legalReviewPending === true);
  check('checklistVersion recorded', rec.checklistVersion === CANON.version, rec.checklistVersion);
  check('commit message names crew boss', /John Smith/.test(calls[0].body.message), calls[0].body.message);
  check('record is valid JSON w/ trailing newline',
    Buffer.from(calls[0].body.content, 'base64').toString('utf8').endsWith('\n'));

  console.log('\n2. rejections');
  calls = [];
  r = await fn.handler(ev(payload({ __items: { s3: { confirmed: false } } })));
  check('unconfirmed item -> 400', r.statusCode === 400, r.body);
  check('names the item', /s3/.test(r.body), r.body);

  r = await fn.handler(ev(payload({ __items: { r3: { confirmed: true } } })));
  check('confirmed placeholder -> 400', r.statusCode === 400, r.body);

  r = await fn.handler(ev(payload({ __items: { s1: { text: 'I promise nothing' } } })));
  check('tampered item text -> 400', r.statusCode === 400, r.body);

  r = await fn.handler(ev(payload({ crewBossName: 'J' })));
  check('short name -> 400', r.statusCode === 400, r.body);

  r = await fn.handler(ev(payload({ jobAddress: 'x' })));
  check('short address -> 400', r.statusCode === 400, r.body);

  r = await fn.handler(ev({ crewBossName: 'John Smith', jobAddress: '1204 Oak Hollow Dr', items: [] }));
  check('empty items -> 400', r.statusCode === 400, r.body);

  r = await fn.handler(ev('{not json'));
  check('bad JSON -> 400', r.statusCode === 400, r.body);

  r = await fn.handler(ev(payload(), { headers: { origin: 'https://evil.example' } }));
  check('foreign origin -> 403', r.statusCode === 403, r.body);
  check('no ACAO for foreign origin', !r.headers['Access-Control-Allow-Origin']);

  r = await fn.handler(ev(payload(), { httpMethod: 'GET' }));
  check('GET -> 405', r.statusCode === 405, r.body);

  r = await fn.handler(ev(payload(), { httpMethod: 'OPTIONS' }));
  check('OPTIONS -> 204', r.statusCode === 204, r.body);

  r = await fn.handler(ev('x'.repeat(40000)));
  check('oversize body -> 413', r.statusCode === 413, r.body);
  check('nothing written on any rejection', calls.length === 0, calls.length);

  console.log('\n3. typography tolerance');
  calls = []; nextStatus = [201];
  const curly = payload();
  const r2 = curly.items.find(i => i.id === 'r2');
  r2.text = r2.text.replace("'", '’');           // curly apostrophe
  const s4 = curly.items.find(i => i.id === 's4');
  s4.text = s4.text.replace('—', '–') + ' ';  // en dash + trailing space
  r = await fn.handler(ev(curly));
  check('curly quotes / dash variants accepted -> 200', r.statusCode === 200, r.body);
  const rec2 = JSON.parse(Buffer.from(calls[0].body.content, 'base64').toString('utf8'));
  check('canonical text stored, not client copy',
    rec2.items.find(i => i.id === 'r2').text === CANON.categories.flatMap(c => c.items).find(i => i.id === 'r2').text);

  console.log('\n4. path safety');
  const cases = [
    ['../../../../etc/passwd', 'etc-passwd'],
    ['..', 'unnamed'],
    ['a/b\\c', 'a-b-c'],
    ['O’Brien-Smíth', 'o-brien-smith'],
    ['<script>x</script>', 'script-x-script'],
    ['   ', 'unnamed'],
    ['中文名字', 'unnamed']
  ];
  for (const [inp, want] of cases) {
    const got = fn._internal.slug(inp);
    check('slug(' + JSON.stringify(inp) + ') = ' + JSON.stringify(got), got === want, 'wanted ' + want);
  }
  calls = []; nextStatus = [201];
  r = await fn.handler(ev(payload({ crewBossName: '../../../../etc/passwd' })));
  check('traversal name still writes inside data/submissions',
    r.statusCode === 200 && /^data\/submissions\/[^/]+\.json$/.test(JSON.parse(r.body).path),
    r.body);

  console.log('\n5. collision retry');
  calls = []; nextStatus = [422, 201];
  r = await fn.handler(ev(payload()));
  check('retries once on 422 and succeeds', r.statusCode === 200 && calls.length === 2,
    r.statusCode + ' calls=' + calls.length);
  check('retry used a different path', calls[0].url !== calls[1].url);

  console.log('\n6. failure handling');
  calls = []; nextStatus = [401];
  r = await fn.handler(ev(payload()));
  check('GitHub 401 -> 502', r.statusCode === 502, r.body);
  check('no token or GitHub detail leaked to client',
    !/ghp_|scope|Tech-but-Verify/.test(r.body), r.body);

  console.log('\n7b. crew boss PINs');
  const PINS = { '481027': 'John Smith', '730914': 'Ana Reyes' };
  process.env.CREW_PINS = JSON.stringify(PINS);

  calls = []; nextStatus = [201];
  r = await fn.handler(ev(payload({ pin: '481027' })));
  check('valid PIN -> 200', r.statusCode === 200, r.body);
  let recP = JSON.parse(Buffer.from(calls[0].body.content, 'base64').toString('utf8'));
  check('record marked identityVerified', recP.identityVerified === true);
  check('PIN itself is never written to the public record',
    !JSON.stringify(recP).includes('481027'), JSON.stringify(recP).slice(0, 200));

  calls = [];
  r = await fn.handler(ev(payload({ pin: '000000' })));
  check('unknown PIN -> 401', r.statusCode === 401, r.body);
  check('nothing written for an unknown PIN', calls.length === 0);
  r = await fn.handler(ev(payload()));
  check('missing PIN once configured -> 401', r.statusCode === 401, r.body);
  r = await fn.handler(ev(payload({ pin: 'constructor' })));
  check('prototype-chain key is not a valid PIN', r.statusCode === 401, r.body);
  r = await fn.handler(ev(payload({ pin: '__proto__' })));
  check('__proto__ is not a valid PIN', r.statusCode === 401, r.body);
  r = await fn.handler(ev(payload({ pin: 481027 })));
  check('numeric (non-string) PIN -> 401', r.statusCode === 401, r.body);

  // The roster decides who this is, not the name typed into the box.
  calls = []; nextStatus = [201];
  r = await fn.handler(ev(payload({ pin: '730914', crewBossName: 'Somebody Else' })));
  check('typed name cannot override the roster -> 200', r.statusCode === 200, r.body);
  recP = JSON.parse(Buffer.from(calls[0].body.content, 'base64').toString('utf8'));
  check('record uses the roster name', recP.crewBossName === 'Ana Reyes', recP.crewBossName);
  check('the mismatched typed name is kept for the audit trail',
    recP.typedName === 'Somebody Else', recP.typedName);
  check('filename uses the roster name',
    /_ana-reyes\.json$/.test(JSON.parse(r.body).path), JSON.parse(r.body).path);

  // A typo in the Netlify UI must not silently reopen the checklist.
  for (const bad of ['{not json', '[]', '{}', '{"1234":""}', '{"1234":5}', 'null']) {
    process.env.CREW_PINS = bad;
    calls = [];
    r = await fn.handler(ev(payload({ pin: '481027' })));
    check('malformed CREW_PINS ' + JSON.stringify(bad) + ' fails closed (500)',
      r.statusCode === 500 && calls.length === 0, r.statusCode + ' calls=' + calls.length);
  }

  process.env.CREW_PINS = '   ';
  calls = []; nextStatus = [201];
  r = await fn.handler(ev(payload()));
  check('blank CREW_PINS means PINs are simply off', r.statusCode === 200, r.body);
  recP = JSON.parse(Buffer.from(calls[0].body.content, 'base64').toString('utf8'));
  check('identityVerified false when PINs are off', recP.identityVerified === false);
  delete process.env.CREW_PINS;

  console.log('\n7. unconfigured server');
  const savedT = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  r = await fn.handler(ev(payload()));
  check('missing GITHUB_TOKEN -> 500', r.statusCode === 500, r.body);
  process.env.GITHUB_TOKEN = savedT;
  process.env.GITHUB_REPO = 'not-a-repo';
  r = await fn.handler(ev(payload()));
  check('malformed GITHUB_REPO -> 500', r.statusCode === 500, r.body);
  process.env.GITHUB_REPO = 'justindbilyeu/Tech-but-Verify';

  console.log('\n10. the acknowledgment');
  // The page will not let anybody past the signature pad, but the page is the
  // friendly validator and not the only one. A submission that reaches here
  // unsigned is refused rather than filed as if it had been.
  const noAck = payload(); delete noAck.acknowledgment;
  r = await fn.handler(ev(noAck));
  check('no acknowledgment is refused', r.statusCode === 400 &&
    /acknowledgment is required/.test(r.body), r.statusCode + ' ' + r.body);

  r = await fn.handler(ev(payload({ acknowledgment: ack({ signed: false }) })));
  check('signed:false is refused', r.statusCode === 400, r.body);

  r = await fn.handler(ev(payload({ acknowledgment: ack({ signerName: 'Somebody Else' }) })));
  check('a signer who is not the crew boss is refused',
    r.statusCode === 400 && /must match crewBossName/.test(r.body), r.body);

  r = await fn.handler(ev(payload({ acknowledgment: ack({ statementVersion: '' }) })));
  check('an unversioned statement is refused', r.statusCode === 400, r.body);

  // This repository is public. A drawn signature is personal data and does not
  // belong in it. The refusal lives in the function so that turning storage on
  // later is a deliberate act here, not an accident in the page.
  r = await fn.handler(ev(payload({ acknowledgment: ack({ imageStored: true }) })));
  check('a stored-image flag is refused while the repo is public',
    r.statusCode === 400 && /not accepted while this repository is public/.test(r.body),
    r.body);
  r = await fn.handler(ev(payload({
    acknowledgment: ack({ image: 'data:image/png;base64,iVBORw0KGgo=' }) })));
  check('an actual image is refused too', r.statusCode === 400, r.body);

  calls = []; nextStatus = [201];
  r = await fn.handler(ev(payload()));
  check('a signed submission is filed', r.statusCode === 200, r.statusCode + ' ' + r.body);
  const filed = JSON.parse(Buffer.from(calls[0].body.content, 'base64').toString('utf8'));
  check('the record carries that it was signed, by whom and when',
    filed.acknowledgment.signed === true &&
    filed.acknowledgment.signerName === 'John Smith' &&
    typeof filed.acknowledgment.signedAt === 'string',
    JSON.stringify(filed.acknowledgment));
  check('and records that no image was stored',
    filed.acknowledgment.imageStored === false);
  check('no image reached the record by any route',
    !JSON.stringify(filed).includes('data:image'));


  // ── 11. the notification ────────────────────────────────────────────────
  // Chanel gets an email the moment a checklist is filed. The record is still
  // the file in the repo; this is a message about it, and it is allowed to
  // fail without taking the submission down with it.
  console.log('\n11. the notification to the office');

  const mailOf = (c) => c.find((x) => /resend\.com/.test(x.url));

  calls = []; nextStatus = [201];
  r = await fn.handler(ev(payload()));
  check('with nothing configured, no mail is attempted',
    r.statusCode === 200 && calls.length === 1 && !mailOf(calls));
  check('and the response says so plainly',
    JSON.parse(r.body).notified === 'skipped', r.body);

  process.env.RESEND_API_KEY = 're_faketoken';
  process.env.NOTIFY_TO = 'chanel@example.com';

  calls = []; nextStatus = [201];
  r = await fn.handler(ev(payload()));
  const mail = mailOf(calls);
  check('configured, it sends one', r.statusCode === 200 && !!mail && calls.length === 2,
    r.statusCode + ' calls=' + calls.length);
  check('the response says it went', JSON.parse(r.body).notified === 'sent', r.body);
  check('with the key as a bearer token',
    mail.headers.Authorization === 'Bearer re_faketoken');
  check('to the configured address', JSON.stringify(mail.body.to) === '["chanel@example.com"]',
    JSON.stringify(mail.body.to));

  check('the subject names the crew boss and the address',
    /John Smith/.test(mail.body.subject) && /Oak Hollow/.test(mail.body.subject),
    mail.body.subject);
  check('every checklist item is in the text',
    CANON.categories.every((c) => c.items.every((i) => mail.body.text.includes(i.text))));
  // A placeholder is not a failed item and must not read as one: [-] rather
  // than an empty box, plus a line at the bottom saying what it means.
  check('the two placeholders are marked unconfirmable, not failed',
    (mail.body.text.match(/^ {2}\[-\] /gm) || []).length === 2 &&
    /\[-\] marks the placeholders/.test(mail.body.text),
    (mail.body.text.match(/^ {2}\[-\] /gm) || []).length + ' marked items');
  check('and no confirmed item is marked as missed',
    !/^ {2}\[ \] /m.test(mail.body.text));
  check('the signature is described, never attached',
    /signature is not stored/.test(mail.body.text) &&
    !/data:image/.test(JSON.stringify(mail.body)));
  check('it links to the filed record',
    mail.body.text.includes('https://github.com/justindbilyeu/Tech-but-Verify/blob/'));
  check('an HTML part goes along with it',
    typeof mail.body.html === 'string' && mail.body.html.includes('John Smith'));

  // The GitHub write comes first on purpose. If mail were sent first, a mail
  // outage would be reported to nobody and the record might not exist.
  check('the record was written before the mail went out',
    /api\.github\.com/.test(calls[0].url) && /resend\.com/.test(calls[1].url),
    calls.map((c) => c.url).join(' then '));

  // A checklist that is filed but not announced is a smaller problem than a
  // crew boss who cannot file one. The submission stands.
  calls = []; nextStatus = [201, 500];
  r = await fn.handler(ev(payload()));
  check('a refused send does NOT fail the submission', r.statusCode === 200, r.statusCode);
  check('but the response names it', JSON.parse(r.body).notified === 'failed', r.body);
  check('and the record is still in the repo',
    calls.length === 2 && /api\.github\.com/.test(calls[0].url));

  // A GitHub failure is a different matter: there is no record to announce.
  calls = []; nextStatus = [401];
  r = await fn.handler(ev(payload()));
  check('no mail goes out when nothing was filed',
    r.statusCode === 502 && !mailOf(calls), r.statusCode + ' calls=' + calls.length);

  process.env.NOTIFY_TO = 'chanel@example.com, not-an-address, david@example.com';
  calls = []; nextStatus = [201];
  r = await fn.handler(ev(payload()));
  check('a junk entry in NOTIFY_TO is dropped, the good ones still get it',
    JSON.stringify(mailOf(calls).body.to) ===
      '["chanel@example.com","david@example.com"]',
    JSON.stringify(mailOf(calls).body.to));

  process.env.NOTIFY_TO = 'not-an-address';
  calls = []; nextStatus = [201];
  r = await fn.handler(ev(payload()));
  check('and if none of them survive, nothing is sent to nobody',
    r.statusCode === 200 && !mailOf(calls) &&
    JSON.parse(r.body).notified === 'skipped', r.body);

  // The PIN never reaches the record; it must not reach the inbox either.
  process.env.NOTIFY_TO = 'chanel@example.com';
  process.env.CREW_PINS = '{"481027":"Ana Reyes"}';
  calls = []; nextStatus = [201];
  r = await fn.handler(ev(payload({ crewBossName: 'Someone Else', pin: '481027' })));
  const pinMail = mailOf(calls);
  check('the roster name is the one in the email, not the typed one',
    /Ana Reyes/.test(pinMail.body.subject) && !/Someone Else/.test(pinMail.body.text),
    pinMail.body.subject);
  check('the PIN is nowhere in the email',
    !JSON.stringify(pinMail.body).includes('481027'));
  delete process.env.CREW_PINS;

  // A Subject is one line, and both halves of this one are free text off a
  // phone. A newline there would end the header and let the rest be read as
  // headers of its own.
  calls = []; nextStatus = [201];
  await fn.handler(ev(payload({
    crewBossName: 'John\nBcc: someone@elsewhere.example',
    jobAddress: '1204 Oak Hollow Dr\r\nX-Injected: yes'
  })));
  const subj = mailOf(calls).body.subject;
  check('a newline in the name or address cannot split the Subject',
    !/[\r\n]/.test(subj), JSON.stringify(subj));
  check('and what was after it is still there, as text',
    /Bcc: someone@elsewhere.example/.test(subj) && /X-Injected/.test(subj), subj);

  // new Date(null) is the epoch, so an absent timestamp used to read as a
  // confident "1 Jan 1970".
  calls = []; nextStatus = [201];
  await fn.handler(ev(payload({ acknowledgment: ack({ signedAt: undefined }) })));
  const noStamp = mailOf(calls).body.text;
  check('a missing signing time says unknown, not 1970',
    /Signed\s+unknown/.test(noStamp) && !/1970/.test(noStamp),
    (noStamp.match(/Signed.*/) || [''])[0]);

  const sender = 'TCR <checklist@texaschoiceroofing.example>';
  process.env.NOTIFY_FROM = sender;
  calls = []; nextStatus = [201];
  await fn.handler(ev(payload()));
  check('NOTIFY_FROM sets the sender', mailOf(calls).body.from === sender);
  delete process.env.NOTIFY_FROM;

  delete process.env.RESEND_API_KEY;
  delete process.env.NOTIFY_TO;

  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
