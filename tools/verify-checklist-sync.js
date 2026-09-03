#!/usr/bin/env node
'use strict';
// The checklist lives in two places: checklist-items.json (canonical, what the
// Netlify function validates against) and the CHECKLIST array inside
// docs/index.html (what a crew boss actually reads). The function matches
// submitted item text against the canonical list, so any drift between the two
// turns every submission into a 400. This catches that drift.
//
//   node tools/verify-checklist-sync.js

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const canonical = JSON.parse(fs.readFileSync(path.join(root, 'checklist-items.json'), 'utf8'));
const page = fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8');

const m = page.match(/var CHECKLIST = (\[[\s\S]*?\n  \]);/);
if (!m) {
  console.error('FAIL: could not find the CHECKLIST array in docs/index.html');
  process.exit(1);
}
// The literal is plain data - object keys, strings, booleans. Item text itself
// contains parentheses ("(near roadway/traffic)"), so blank out the quoted
// strings first and only then refuse anything that looks like code, rather
// than evaluating something surprising.
const skeleton = m[1]
  .replace(/'(?:[^'\\]|\\.)*'/g, "''")
  .replace(/"(?:[^"\\]|\\.)*"/g, '""');
if (/[`(]|=>/.test(skeleton)) {
  console.error('FAIL: the CHECKLIST literal contains code, not just data');
  process.exit(1);
}
const fromPage = new Function('return ' + m[1])();

const flat = (cats) => cats.flatMap((c) =>
  c.items.map((i) => [c.name, i.id, i.text, !!i.pendingLegalReview].join('   ')));

const a = flat(canonical.categories);
const b = flat(fromPage);

const problems = [];
if (a.length !== b.length) {
  problems.push('item count differs: checklist-items.json has ' + a.length +
                ', docs/index.html has ' + b.length);
}
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] !== b[i]) {
    problems.push('item ' + (i + 1) + ' differs:\n      canonical: ' +
                  (a[i] || '(missing)') + '\n      page:      ' + (b[i] || '(missing)'));
  }
}

if (problems.length) {
  console.error('FAIL: docs/index.html and checklist-items.json are out of sync\n');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('OK: ' + a.length + ' items in sync across checklist-items.json and docs/index.html');
console.log('    ' + a.filter((x) => x.endsWith('true')).length + ' pending legal review, ' +
            a.filter((x) => x.endsWith('false')).length + ' confirmable');
