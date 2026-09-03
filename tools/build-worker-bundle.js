'use strict';
//   node tools/build-worker-bundle.js          rebuild the pasteable file
//   node tools/build-worker-bundle.js --check  fail if it is stale
//
// Flattens the adapter and the handler into one file you can paste straight
// into Cloudflare's web editor. No terminal, no wrangler, no local checkout -
// which matters, because most of this project has been driven from a phone.
//
// `npx wrangler deploy` is the better route once there is a machine to run it
// on. This is the route that works from the passenger seat.
//
// The output is committed so it can be copied out of GitHub on a phone, and
// tools/test-worker-bundle.mjs runs the real end-to-end suite against the
// bundle rather than the sources - a generated file nobody tested is a trap.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function bundle({ adapter, handler, name, endpointNote }) {
  // The adapter is ESM. Inside one file it is just top-level code, so the
  // export keywords come off; toWorker is called at the bottom instead.
  const adapterSrc = read(adapter)
    .replace(/^export (function|const|let)\b/gm, '$1')
    .replace(/^\/\/ {3}import .*$/gm, '//   (bundled below)');

  // The handler is CommonJS. Give it the two globals it expects and hand back
  // what it assigned to them.
  const handlerSrc = read(handler);

  return `// GENERATED - do not edit. Source: ${adapter} + ${handler}
// Rebuild with: node tools/build-worker-bundle.js
//
// ${name}, flattened into one file for Cloudflare's dashboard editor.
//
// To deploy without a terminal:
//   1. Cloudflare dashboard -> Workers & Pages -> Create -> Start from Hello World
//   2. Deploy it, then Edit code, select all, paste this file over it, Deploy
//   3. Settings -> Variables:
//        GITHUB_TOKEN    Secret     fine-grained PAT, Contents read+write
//        GITHUB_REPO     Secret     owner/repo
//        ALLOWED_ORIGIN  Text       ${endpointNote}
//   4. Copy the worker's URL and put it in ENDPOINT on the page

/* ---------- adapter ---------- */
${adapterSrc.trim()}

/* ---------- handler ---------- */
const module = { exports: {} };
const exports = module.exports;
{
${handlerSrc.trim().replace(/^/gm, '  ')}
}

export default toWorker(module.exports.handler);
`;
}

const out = bundle({
  adapter: 'adapters/worker.mjs',
  handler: 'netlify/functions/submit-checklist.js',
  name: 'TCR crew boss checklist endpoint',
  endpointNote: 'https://justindbilyeu.github.io'
});

const REL = 'adapters/dist/submit-checklist.worker.mjs';
const dest = path.join(ROOT, REL);
const checkOnly = process.argv.indexOf('--check') !== -1;

if (checkOnly) {
  const have = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : '';
  if (have === out) { process.exit(0); }
  // A stale bundle is worse than no bundle: it is the file somebody copies out
  // of GitHub on a phone, believing it is the code that passed the tests.
  console.error(REL + ' is stale. Run: node tools/build-worker-bundle.js');
  process.exit(1);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log('wrote ' + REL + ' (' + out.split('\n').length + ' lines, ' +
  (out.length / 1024).toFixed(1) + ' KB)');
