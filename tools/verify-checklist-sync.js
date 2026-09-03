#!/usr/bin/env node
'use strict';
// The checklist lives in three places:
//
//   checklist-items.json                    canonical, the wording of record
//   docs/index.html (CHECKLIST)             what a crew boss actually reads
//   netlify/functions/submit-checklist.js   what the server validates against
//
// The function carries its own copy because it is deployed alone into the
// juiceworks-api Netlify site, where the repo root is not on disk. It matches
// submitted item text against that copy, so drift between any two of the three
// turns every submission into a 400. This catches it.
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

// The function exports its inlined copy, so no source parsing needed here.
const fromFn = require(path.join(root, 'netlify', 'functions', 'submit-checklist.js'))
  ._internal.canonical;

const flat = (cats) => cats.flatMap((c) =>
  c.items.map((i) => [c.name, i.id, i.text, !!i.pendingLegalReview].join('   ')));

const copies = [
  ['checklist-items.json', flat(canonical.categories)],
  ['docs/index.html', flat(fromPage)],
  ['netlify/functions/submit-checklist.js', flat(fromFn.categories)]
];

const [refName, ref] = copies[0];
const problems = [];

for (const [name, list] of copies.slice(1)) {
  if (list.length !== ref.length) {
    problems.push(name + ': has ' + list.length + ' items, ' +
                  refName + ' has ' + ref.length);
  }
  for (let i = 0; i < Math.max(ref.length, list.length); i++) {
    if (ref[i] !== list[i]) {
      problems.push(name + ', item ' + (i + 1) + ':\n      ' + refName + ': ' +
                    (ref[i] || '(missing)') + '\n      ' + name + ': ' +
                    (list[i] || '(missing)'));
    }
  }
}

if (canonical.version !== fromFn.version) {
  problems.push('version differs: ' + refName + ' says ' + canonical.version +
                ', the function says ' + fromFn.version);
}

if (problems.length) {
  console.error('FAIL: the three copies of the checklist are out of sync\n');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('OK: ' + ref.length + ' items in sync across all three copies');
console.log('    ' + ref.filter((x) => x.endsWith('true')).length + ' pending legal review, ' +
            ref.filter((x) => x.endsWith('false')).length + ' confirmable');
