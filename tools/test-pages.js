'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Drives both pages in a real browser: validation, the full submit flow, the
// payload the function will actually receive, XSS handling, the dashboard's
// rendering and its empty/rate-limited/offline states.
//
// Needs playwright available (it is not a declared dependency, so that Netlify
// does not install a browser it will never use):
//   NODE_PATH=$(npm root -g) node tools/test-pages.js
//
// Screenshots land in OUT.

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const OUT = process.env.OUT || require('os').tmpdir();
const CANON = require(path.join(ROOT, 'checklist-items.json'));

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra !== undefined ? '  -> ' + extra : '')); }
};

(async () => {
  const browser = await chromium.launch();

  // ── Checklist page, on a phone ────────────────────────────────────────────
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // Two resource failures are expected in this harness and are not page bugs:
  // the logo png is genuinely absent (that is what exercises the fallback), and
  // the font CDN is blocked on purpose so the test needs no network.
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(m.text())) return;
    errors.push('console: ' + m.text());
  });

  // Block the font CDN so the test does not depend on the network.
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort());

  let posted = null;
  await page.route('https://juiceworks-api.netlify.app/**', async (route) => {
    posted = JSON.parse(route.request().postData());
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, path: 'data/submissions/x.json' })
    });
  });

  console.log('\n1. checklist page loads');
  await page.goto('file://' + path.join(DOCS, 'index.html'));
  await page.waitForTimeout(300);
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('title', (await page.title()).includes('Pre-Job Checklist'));
  const logo = await page.locator('#logo').evaluate((el) => ({
    shown: !!el.offsetParent || getComputedStyle(el).display !== 'none',
    w: el.naturalWidth, h: el.naturalHeight,
    render: Math.round(el.getBoundingClientRect().width)
  }));
  check('real logo decoded', logo.w === 900 && logo.h === 396,
    logo.w + 'x' + logo.h);
  check('logo rendered at a sane width', logo.render >= 200 && logo.render <= 260, logo.render);
  check('wordmark fallback stays hidden while the png loads',
    !(await page.locator('#wordmark').isVisible()));
  // The mark's "ROOFING" and the house silhouette are solid black, so a dark
  // masthead would hide half of it. Guard the light background.
  const mastBg = await page.locator('.masthead')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  check('masthead is light so the black parts of the mark are visible',
    mastBg === 'rgb(255, 255, 255)', mastBg);
  check('eyebrow label present',
    (await page.locator('.eyebrow').textContent()).trim() === 'Pre-job crew boss checklist');
  check('prototype banner visible', await page.locator('.proto').isVisible());
  const legal = (await page.locator('footer .legal').textContent()).replace(/\s+/g, ' ');
  check('ownership notice in the footer',
    /JuiceWorks/.test(legal) && /property of Texas Choice Roofing/.test(legal), legal);

  console.log('\n2. structure');
  const cats = await page.locator('.card-head h2').allTextContents();
  check('4 category headers in spec order',
    JSON.stringify(cats) === JSON.stringify(['Job details', 'Safety', 'Visibility', 'Cleanliness', 'Crew readiness']),
    JSON.stringify(cats));
  const headerColor = await page.locator('.card-head h2').nth(1)
    .evaluate((el) => getComputedStyle(el).color);
  check('section headers are brand red', headerColor === 'rgb(186, 19, 19)', headerColor);
  check('13 confirmable checkboxes',
    await page.locator('.row input[type=checkbox]').count() === 13);
  check('2 pending-legal placeholders', await page.locator('.pending').count() === 2);
  check('placeholders are not checkboxes',
    await page.locator('.pending input').count() === 0);
  check('placeholders labelled pending',
    (await page.locator('.pending .tag').first().textContent()).toLowerCase().includes('pending legal review'));
  const dashed = await page.locator('.pending').first()
    .evaluate((el) => getComputedStyle(el).borderStyle);
  check('placeholder has dashed border', dashed === 'dashed', dashed);
  // Regression: placeholders belong at items 14-15, after the two real crew
  // readiness lines, not hoisted above them.
  const crewOrder = await page.locator('#sections .card').last()
    .evaluate((card) => Array.from(card.querySelectorAll('.items > li'))
      .map((li) => li.classList.contains('ph') ? 'PH' : 'item'));
  check('placeholders render last in crew readiness',
    JSON.stringify(crewOrder) === JSON.stringify(['item', 'item', 'PH', 'PH']),
    JSON.stringify(crewOrder));

  check('fitness-for-duty item sits at safety #4',
    (await page.locator('.row .txt').nth(3).textContent()).startsWith('All crew members are fit for duty'));

  console.log('\n3. tap targets and layout');
  const box = await page.locator('.row').first().boundingBox();
  check('row tap target >= 48px tall', box.height >= 48, box.height);
  check('row spans the column', box.width > 300, box.width);
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  check('no horizontal overflow at 390px', scrollW <= 390, scrollW);
  // Regression: the fixed action bar is 122px tall and was covering the footer
  // when the bottom padding was a hard-coded 96px.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(150);
  const clearance = await page.evaluate(() => {
    const ab = document.querySelector('.actionbar').getBoundingClientRect();
    const f = document.querySelector('footer').getBoundingClientRect();
    return Math.round(ab.top - f.bottom);
  });
  check('footer scrolls clear of the fixed action bar', clearance >= 0, clearance);
  await page.evaluate(() => window.scrollTo(0, 0));

  console.log('\n4. validation blocks an empty submit');
  await page.locator('#submit').click();
  await page.waitForTimeout(250);
  check('no POST fired', posted === null);
  check('name error shown', await page.locator('#e-name').isVisible());
  check('address error shown', await page.locator('#e-addr').isVisible());
  check('form-level error names the count',
    /13 items still need confirming/.test(await page.locator('#e-form').textContent()),
    await page.locator('#e-form').textContent());
  check('no alert dialog used (page still responsive)',
    await page.locator('#form').isVisible());
  check('unconfirmed rows highlighted', await page.locator('.items li.bad').count() === 13);

  console.log('\n5. partial fill still blocks');
  await page.fill('#crewBossName', 'John Smith');
  await page.fill('#jobAddress', '1204 Oak Hollow Dr, Houston, TX 77008');
  await page.locator('.row').first().click();
  await page.waitForTimeout(120);
  check('progress reads 1 of 13',
    (await page.locator('#p-now').textContent()) === '1' &&
    (await page.locator('#p-all').textContent()) === '13');
  await page.locator('#submit').click();
  await page.waitForTimeout(200);
  check('still no POST', posted === null);
  check('error names remaining 12',
    /12 items still need confirming/.test(await page.locator('#e-form').textContent()),
    await page.locator('#e-form').textContent());

  console.log('\n6. full pass submits');
  for (let i = 0; i < 13; i++) {
    const cb = page.locator('.row input[type=checkbox]').nth(i);
    if (!(await cb.isChecked())) await page.locator('.row').nth(i).click();
  }
  await page.waitForTimeout(150);
  check('progress reads 13 of 13', (await page.locator('#p-now').textContent()) === '13');
  // Regression: the count from the earlier failed submit must not still be on
  // screen claiming items are missing once they are all ticked.
  check('stale "items still need confirming" error cleared',
    !(await page.locator('#e-form').isVisible()),
    await page.locator('#e-form').textContent());
  check('no rows left highlighted', await page.locator('.items li.bad').count() === 0,
    await page.locator('.items li.bad').count());
  // Regression: the completion class used to be `done`, which collided with the
  // success card's `.done{display:none}` and hid the bar at exactly 100%.
  // Checking the colour alone missed it -- computed style still resolves on a
  // display:none element -- so assert the bar is actually laid out.
  await page.waitForTimeout(400);   // the fill has a 0.25s width transition
  const bar = await page.locator('#bar').evaluate((el) => ({
    color: getComputedStyle(el.firstElementChild).backgroundColor,
    display: getComputedStyle(el).display,
    w: Math.round(el.getBoundingClientRect().width),
    fillW: Math.round(el.firstElementChild.getBoundingClientRect().width)
  }));
  check('progress bar turns green when complete', bar.color === 'rgb(21, 128, 61)', bar.color);
  check('progress bar is still visible at 100%', bar.display !== 'none' && bar.w > 0,
    bar.display + ' w=' + bar.w);
  check('progress fill spans the bar at 100%', bar.fillW === bar.w,
    bar.fillW + ' of ' + bar.w);
  await page.screenshot({ path: path.join(OUT, 'checklist-filled.png'), fullPage: true });

  await page.locator('#submit').click();
  await page.waitForTimeout(500);
  check('POST fired', posted !== null);
  if (posted) {
    check('payload has crewBossName', posted.crewBossName === 'John Smith', posted.crewBossName);
    check('payload has jobAddress', posted.jobAddress === '1204 Oak Hollow Dr, Houston, TX 77008');
    check('payload has 15 items', posted.items.length === 15, posted.items.length);
    check('payload allConfirmed true', posted.allConfirmed === true);
    check('submittedAt is ISO 8601', /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(posted.submittedAt), posted.submittedAt);
    const flat = CANON.categories.flatMap((c) => c.items.map((i) => ({ c: c.name, i })));
    check('payload item text matches canonical exactly',
      posted.items.every((it, n) => it.text === flat[n].i.text && it.id === flat[n].i.id &&
                                    it.category === flat[n].c));
    check('placeholders sent unconfirmed',
      posted.items.filter((i) => i.pendingLegalReview).every((i) => i.confirmed === false));
    check('placeholders flagged in payload',
      posted.items.filter((i) => i.pendingLegalReview).length === 2);
    // The real function must accept exactly what the real page sends.
    process.env.GITHUB_TOKEN = 't'; process.env.GITHUB_REPO = 'o/r';
    const fn = require(path.join(ROOT, 'netlify/functions/submit-checklist.js'));
    check('the function accepts the page payload verbatim',
      fn._internal.validate(posted) === null, fn._internal.validate(posted));
  }
  check('success screen shown', await page.locator('#done').isVisible());
  check('success echoes the name',
    (await page.locator('#d-name').textContent()) === 'John Smith');
  check('form hidden after success', !(await page.locator('#form').isVisible()));
  check('action bar hidden after success', !(await page.locator('#actionbar').isVisible()));
  check('no page errors through the whole flow', errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: path.join(OUT, 'checklist-success.png'), fullPage: true });

  console.log('\n7. XSS: a hostile name is text, not markup');
  const p2 = await ctx.newPage();
  await p2.route('https://fonts.g**/**', (r) => r.abort());
  let popped = false;
  p2.on('dialog', async (d) => { popped = true; await d.dismiss(); });
  await p2.route('https://juiceworks-api.netlify.app/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await p2.goto('file://' + path.join(DOCS, 'index.html'));
  await p2.fill('#crewBossName', '<img src=x onerror=alert(1)>');
  await p2.fill('#jobAddress', '<script>alert(2)</script> 500 Main St');
  for (let i = 0; i < 13; i++) await p2.locator('.row').nth(i).click();
  await p2.locator('#submit').click();
  await p2.waitForTimeout(500);
  check('no dialog fired', popped === false);
  check('name rendered as literal text',
    (await p2.locator('#d-name').textContent()) === '<img src=x onerror=alert(1)>');
  check('no injected img element', await p2.locator('#d-name img').count() === 0);
  await p2.close();

  // ── PIN mode ─────────────────────────────────────────────────────────────
  // The page ships with PIN_REQUIRED off, so exercise the on state against a
  // temporary copy alongside index.html (so its relative asset paths still
  // resolve). It is removed again in the finally below.
  console.log('\n7a. crew boss PIN mode');
  const pinPage = path.join(DOCS, '.pin-mode-test.html');
  fs.writeFileSync(pinPage, fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8')
    .replace('var PIN_REQUIRED = false;', 'var PIN_REQUIRED = true;'));
  try {
    const pp = await ctx.newPage();
    await pp.setViewportSize({ width: 390, height: 844 });
    await pp.route('https://fonts.g**/**', (r) => r.abort());
    let sent = null, replyWith = { status: 401, body: { error: 'That PIN was not recognised. Check it and try again, or call the office.' } };
    await pp.route('https://juiceworks-api.netlify.app/**', async (route) => {
      sent = JSON.parse(route.request().postData());
      await route.fulfill({ status: replyWith.status, contentType: 'application/json',
        body: JSON.stringify(replyWith.body) });
    });
    await pp.goto('file://' + pinPage);
    await pp.waitForTimeout(200);

    check('PIN field visible when required', await pp.locator('#f-pin').isVisible());
    check('PIN input asks for a numeric keypad',
      await pp.locator('#crewPin').getAttribute('inputmode') === 'numeric');
    check('PIN field is off autocomplete',
      await pp.locator('#crewPin').getAttribute('autocomplete') === 'off');

    await pp.fill('#crewBossName', 'John Smith');
    await pp.fill('#jobAddress', '1204 Oak Hollow Dr, Houston, TX 77008');
    for (let i = 0; i < 13; i++) await pp.locator('.row').nth(i).click();
    await pp.locator('#submit').click();
    await pp.waitForTimeout(300);
    check('missing PIN blocks the submit client-side', sent === null);
    check('inline PIN error shown', await pp.locator('#e-pin').isVisible());

    await pp.fill('#crewPin', '12');
    await pp.locator('#submit').click();
    await pp.waitForTimeout(300);
    check('too-short PIN still blocked', sent === null);

    await pp.fill('#crewPin', '481027');
    await pp.locator('#submit').click();
    await pp.waitForTimeout(400);
    check('valid-looking PIN is sent', sent !== null && sent.pin === '481027',
      sent && sent.pin);
    check('a 401 shows the server reason on the PIN field, not "check your signal"',
      /not recognised/.test(await pp.locator('#e-pin').textContent()),
      await pp.locator('#e-pin').textContent());
    check('the generic network banner stays hidden on a 401',
      !(await pp.locator('#e-form').isVisible()));
    check('submit re-enabled after a rejected PIN',
      !(await pp.locator('#submit').isDisabled()));

    replyWith = { status: 200, body: { ok: true } };
    await pp.locator('#submit').click();
    await pp.waitForTimeout(400);
    check('retrying after a good PIN succeeds', await pp.locator('#done').isVisible());
    await pp.close();
  } finally {
    fs.unlinkSync(pinPage);
  }

  // The shipped page must stay open for the demo.
  const shipped = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8');
  check('shipped page has PIN mode off (demo stays unblocked)',
    /var PIN_REQUIRED = false;/.test(shipped));
  check('shipped page posts to the juiceworks-api site',
    /var ENDPOINT = 'https:\/\/juiceworks-api\.netlify\.app\/submit-checklist';/.test(shipped));

  // ── iPad ─────────────────────────────────────────────────────────────────
  // This gets handed to a crew boss on an iPad Pro, so the layout has to hold
  // up at those sizes rather than sitting in a 640px strip.
  console.log('\n7b. iPad layouts');
  const IPADS = [
    ['iPad Pro 11 portrait',   834, 1194, 1],
    ['iPad Pro 11 landscape',  1194, 834, 2],
    ['iPad Pro 12.9 portrait', 1024, 1366, 1],
    ['iPad Pro 12.9 landscape', 1366, 1024, 2]
  ];
  for (const [label, vw, vh, wantCols] of IPADS) {
    const t = await ctx.newPage();
    await t.route('https://fonts.g**/**', (r) => r.abort());
    await t.setViewportSize({ width: vw, height: vh });
    await t.goto('file://' + path.join(DOCS, 'index.html'));
    await t.fill('#crewBossName', 'John Smith');
    await t.fill('#jobAddress', '1204 Oak Hollow Dr, Houston, TX 77008');
    for (let i = 0; i < 13; i++) await t.locator('.row').nth(i).click();
    await t.waitForTimeout(250);
    const m = await t.evaluate(() => {
      const cs = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop];
      const cols = cs('#sections', 'columnCount');
      return {
        cols: cols === 'auto' ? 1 : parseInt(cols, 10),
        rowH: Math.round(document.querySelector('.row').getBoundingClientRect().height),
        box: Math.round(document.querySelector('.box').getBoundingClientRect().width),
        font: parseFloat(cs('.txt', 'fontSize')),
        wrapW: Math.round(document.querySelector('.wrap').getBoundingClientRect().width),
        scrollW: document.documentElement.scrollWidth,
        btnW: Math.round(document.getElementById('submit').getBoundingClientRect().width),
        logoW: Math.round(document.getElementById('logo').getBoundingClientRect().width)
      };
    });
    await t.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await t.waitForTimeout(150);
    const clear = await t.evaluate(() => {
      const ab = document.querySelector('.actionbar').getBoundingClientRect();
      const f = document.querySelector('footer').getBoundingClientRect();
      return Math.round(ab.top - f.bottom);
    });
    check(label + ': ' + wantCols + '-column checklist', m.cols === wantCols, m.cols);
    check(label + ': no horizontal overflow', m.scrollW <= vw, m.scrollW);
    check(label + ': tap rows >= 60px', m.rowH >= 60, m.rowH);
    check(label + ': checkbox grown to 32px', m.box === 32, m.box);
    check(label + ': item text >= 16px', m.font >= 16, m.font);
    check(label + ': content uses the width', m.wrapW >= Math.min(vw, 820), m.wrapW);
    check(label + ': submit button capped, not a slab', m.btnW >= 320 && m.btnW <= 500, m.btnW);
    check(label + ': footer clears the action bar', clear >= 0, clear);
    await t.screenshot({ path: path.join(OUT, 'ipad-' + vw + 'x' + vh + '.png') });
    await t.close();
  }

  // ── Dashboard, on a desktop ──────────────────────────────────────────────
  console.log('\n8. dashboard');
  const dctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const d = await dctx.newPage();
  const derr = [];
  d.on('pageerror', (e) => derr.push(String(e)));
  await d.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await d.route('https://fonts.gstatic.com/**', (r) => r.abort());

  const mkRec = (name, addr, iso, allOk) => ({
    crewBossName: name, jobAddress: addr, submittedAt: iso,
    items: CANON.categories.flatMap((c) => c.items.map((i) => {
      const r = { id: i.id, category: c.name, text: i.text,
                  confirmed: i.pendingLegalReview ? false : allOk };
      if (i.pendingLegalReview) r.pendingLegalReview = true;
      return r;
    })),
    allConfirmed: allOk, prototype: true, legalReviewPending: true
  });
  const today = new Date().toISOString();
  const fixtures = {
    '2026-09-03T14-22-00Z_john-smith.json': mkRec('John Smith', '1204 Oak Hollow Dr, Houston, TX', today, true),
    '2026-09-02T08-05-00Z_ana-reyes.json': mkRec('Ana Reyes', '77 Pecan St, Katy, TX', '2026-09-02T08:05:00Z', true),
    '2026-09-01T16-40-00Z_evil.json': mkRec('<img src=x onerror=alert(1)>', '<b>9 Elm</b>', '2026-09-01T16:40:00Z', false)
  };

  await d.route('https://api.github.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(Object.keys(fixtures).map((n) => ({
        name: n, type: 'file',
        download_url: 'https://raw.example.test/' + n,
        html_url: 'https://github.test/' + n
      }))) }));
  await d.route('https://raw.example.test/**', (r) => {
    const n = r.request().url().split('/').pop();
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(fixtures[n]) });
  });

  let popped2 = false;
  d.on('dialog', async (x) => { popped2 = true; await x.dismiss(); });
  await d.goto('file://' + path.join(DOCS, 'dashboard.html'));
  await d.waitForTimeout(700);

  check('no page errors', derr.length === 0, derr.join(' | '));
  const dLogo = await d.locator('#logo').evaluate((el) => el.naturalWidth);
  check('dashboard logo decoded', dLogo === 900, dLogo);
  const dMast = await d.locator('.masthead')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  check('dashboard masthead is light', dMast === 'rgb(255, 255, 255)', dMast);
  const dLegal = (await d.locator('footer .legal').textContent()).replace(/\s+/g, ' ');
  check('dashboard carries the ownership notice too',
    /JuiceWorks/.test(dLegal) && /property of Texas Choice Roofing/.test(dLegal), dLegal);
  check('3 rows rendered', await d.locator('.srow').count() === 3,
    await d.locator('.srow').count());
  const order = await d.locator('.srow .who').allTextContents();
  check('newest first', order[0] === 'John Smith' && order[1] === 'Ana Reyes',
    JSON.stringify(order));
  check('hostile name is literal text', order[2] === '<img src=x onerror=alert(1)>');
  check('no dialog on dashboard', popped2 === false);
  check('no injected element in rows', await d.locator('.srow img').count() === 0);
  const pills = await d.locator('.srow .pill').allTextContents();
  check('confirmed pills count live items only',
    pills[0] === '13 of 13' && pills[2] === '0 of 13', JSON.stringify(pills));
  const pillClass = await d.locator('.srow .pill').nth(2).getAttribute('class');
  check('incomplete record flagged red', pillClass.includes('no'), pillClass);
  check('JSON link present and safe',
    await d.locator('.srow a.raw').first().getAttribute('rel') === 'noopener noreferrer');
  const stats = await d.locator('.stat .n').allTextContents();
  check('stats: total / today / fully confirmed',
    stats[0] === '3' && stats[1] === '1' && stats[2] === '2', JSON.stringify(stats));
  check('address column populated',
    (await d.locator('.srow .addr').first().textContent()).includes('Oak Hollow'));
  check('header row visible on desktop', await d.locator('.hrow').isVisible());
  await d.screenshot({ path: path.join(OUT, 'dashboard.png'), fullPage: true });

  console.log('\n9. dashboard filter + mobile');
  await d.fill('#q', 'katy');
  await d.waitForTimeout(200);
  check('filter narrows to 1', await d.locator('.srow').count() === 1);
  check('filter matched on address',
    (await d.locator('.srow .who').textContent()) === 'Ana Reyes');
  await d.fill('#q', 'zzzz');
  await d.waitForTimeout(200);
  check('no-match note shown',
    (await d.locator('#note').textContent()).includes('No records match'));
  await d.fill('#q', '');
  await d.waitForTimeout(200);
  check('clearing filter restores all', await d.locator('.srow').count() === 3);

  await d.setViewportSize({ width: 390, height: 844 });
  await d.waitForTimeout(250);
  check('header row hidden on mobile', !(await d.locator('.hrow').isVisible()));
  const dsw = await d.evaluate(() => document.documentElement.scrollWidth);
  check('dashboard no horizontal overflow at 390px', dsw <= 390, dsw);
  await d.screenshot({ path: path.join(OUT, 'dashboard-mobile.png'), fullPage: true });

  console.log('\n10. dashboard empty + error states');
  const e1 = await dctx.newPage();
  await e1.route('https://fonts.g**/**', (r) => r.abort());
  await e1.route('https://api.github.com/**', (r) => r.fulfill({ status: 404, body: '{}' }));
  await e1.goto('file://' + path.join(DOCS, 'dashboard.html'));
  await e1.waitForTimeout(400);
  check('404 -> explains empty dir / private repo',
    /No submissions directory yet/.test(await e1.locator('#note').textContent()),
    await e1.locator('#note').textContent());

  const e2 = await dctx.newPage();
  await e2.route('https://fonts.g**/**', (r) => r.abort());
  await e2.route('https://api.github.com/**', (r) => r.fulfill({ status: 403, body: '{}' }));
  await e2.goto('file://' + path.join(DOCS, 'dashboard.html'));
  await e2.waitForTimeout(400);
  check('403 -> explains rate limit',
    /rate-limited/.test(await e2.locator('#note').textContent()),
    await e2.locator('#note').textContent());

  const e3 = await dctx.newPage();
  await e3.route('https://fonts.g**/**', (r) => r.abort());
  await e3.route('https://api.github.com/**', (r) => r.abort());
  await e3.goto('file://' + path.join(DOCS, 'dashboard.html'));
  await e3.waitForTimeout(400);
  check('network failure -> plain message, not a blank page',
    /Could not reach GitHub/.test(await e3.locator('#note').textContent()),
    await e3.locator('#note').textContent());

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  console.log('screenshots in ' + OUT);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
