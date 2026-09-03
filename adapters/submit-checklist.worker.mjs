// Cloudflare Worker entry for the checklist endpoint.
//
//   npx wrangler deploy --config adapters/wrangler.toml
//   npx wrangler secret put GITHUB_TOKEN --config adapters/wrangler.toml
//
// The handler is unchanged and still deploys to Netlify from
// netlify/functions/. This file only decides where it runs.

import { toWorker } from './worker.mjs';
import fn from '../netlify/functions/submit-checklist.js';

export default toWorker(fn.handler);
