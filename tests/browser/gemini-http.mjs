// Imported exclusively by the browser test's child worker. No application flag or route.
import fs from 'node:fs';
if (process.env.NODE_ENV !== 'test' || process.env.GEMINI_MODEL !== 'offline-test-model' || process.env.GEMINI_API_KEY !== 'offline-test-key') throw new Error('Synthetic worker transport requires explicit test-only configuration');
const db = new URL(process.env.DATABASE_URL ?? '');
if (!['127.0.0.1', 'localhost'].includes(db.hostname) || db.port !== '3310' || db.pathname !== '/la_nostra_citta_browser') throw new Error('Unexpected worker database');
for (const file of ['.env', '.env.local', '.env.test']) if (fs.existsSync(file)) throw new Error('Test transport requires a clean checkout without dotenv files');

globalThis.fetch = async (input, options) => {
  const url = new URL(String(input));
  if (url.href !== 'https://generativelanguage.googleapis.com/v1beta/models/offline-test-model:generateContent' || options?.method !== 'POST') throw new Error('Unexpected HTTP request: no network fallback is permitted');
  const body = JSON.parse(String(options.body));
  const request = JSON.parse(body.contents[0].parts[0].text);
  const recipe = request.description.includes('Ricetta sintetica');
  const ambiguous = request.description.includes('Foto ambigua sintetica');
  let output;
  if (request.task === 'TEXT') output = { relevance: recipe ? { verdict: 'FAIL', reason: 'OFF_TOPIC' } : { verdict: 'PASS', reason: 'CIVIC' }, community: { verdict: 'PASS', reason: 'SAFE' } };
  else if (request.task === 'IMAGE') {
    if (body.contents[0].parts[1]?.inlineData?.mimeType !== 'image/png') throw new Error('Expected sanitized inline PNG');
    output = { coherence: ambiguous ? 'UNCERTAIN' : 'CONSISTENT', publication: { verdict: 'PASS', reason: 'SAFE' } };
  } else if (request.task === 'CLASSIFY') output = { category_ids: request.allowed_categories.map(c => c.id) };
  else throw new Error('Unexpected Gemini task');
  console.log('[SYNTHETIC HTTP]', request.task);
  return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(output) }] } }] }), { status: 200 });
};
