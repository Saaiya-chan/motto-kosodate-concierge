// Keep the original comparison and Gemini/citation pipeline unchanged; add Cloud Run IAM.
import fs from 'node:fs/promises';
const root = new URL('../../', import.meta.url);
const deployment = JSON.parse(await fs.readFile(new URL('.private/cloud-run-deployment.json', root), 'utf8'));
const identity = (await fs.readFile(new URL('.private/cloud-run-identity-token', root), 'utf8')).trim();
const realFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async (url, options = {}) => {
  if (new URL(url).origin !== deployment.url) return realFetch(url, options);
  const headers = new Headers(options.headers);
  headers.set('X-Serverless-Authorization', `Bearer ${identity}`);
  const start = performance.now();
  const response = await realFetch(url, {...options, headers});
  calls.push({path: new URL(url).pathname, elapsedMs: Math.round(performance.now() - start),
    status: response.status, contentLength: response.headers.get('content-length'),
    timings: response.headers.get('x-search-timings')});
  return response;
};
process.env.SEARCH_PROBE_URL = deployment.url;
process.env.SEARCH_PROBE_LABEL = 'cloud-run';
process.env.SEARCH_PROBE_CONVERSATION = '1';
try {
  await import('../search-container/compare.mjs');
} finally {
  await fs.writeFile(new URL('.private/cloud-run-request-timings.json', root),
    JSON.stringify({measuredAt: new Date().toISOString(), calls}, null, 2), {mode: 0o600});
}
