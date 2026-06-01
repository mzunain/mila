#!/usr/bin/env node
// Drive the running Mila renderer over the Chrome DevTools Protocol and execute
// the SAME relative `/api/capabilities` fetch the app makes. Proves, from inside
// the actual renderer, that HTTP flows through the embedded BFF and reports real
// ASR — i.e. the auto-start "not configured" toast can no longer fire.
//
// Usage: launch Mila with `open -a Mila --args --remote-debugging-port=9222`,
// wait a few seconds, then: node scripts/verify-renderer-capabilities.mjs
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// `ws` isn't a direct dependency of the repo root; resolve it from wherever pnpm
// hoisted it (Node 20 has no global WebSocket) so this probe runs from any cwd.
function loadWs() {
  try {
    return require('ws');
  } catch {
    const hoisted = require('node:child_process')
      .execSync(
        "find . -path '*/node_modules/ws/index.js' 2>/dev/null | head -1",
        { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' },
      )
      .trim();
    if (!hoisted) throw new Error('Could not locate the `ws` package');
    return require(new URL('..', import.meta.url).pathname + '/' + hoisted);
  }
}
const WebSocket = loadWs();
const PORT = process.env.CDP_PORT || '9222';

function getJson(path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

function evaluate(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const send = (method, params) =>
      new Promise((res) => {
        const mid = ++id;
        pending.set(mid, res);
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    ws.on('open', async () => {
      await send('Runtime.enable', {});
      const r = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      ws.close();
      resolve(r);
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg.result);
        pending.delete(msg.id);
      }
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('CDP evaluate timeout')), 15000);
  });
}

const expr = `(async () => {
  const out = { href: location.href, origin: location.origin };
  try {
    const raw = localStorage.getItem('mila:preferences');
    out.storedApiUrl = raw ? (JSON.parse(raw).apiUrl ?? null) : null;
  } catch (e) { out.storedApiUrl = 'parse-error'; }
  try {
    const res = await fetch('/api/capabilities', { cache: 'no-store' });
    out.status = res.status;
    const j = await res.json();
    out.asrProvider = j.asrProvider;
    out.supportsRealAudio = j.supportsRealAudio;
    out.realAudioHint = j.realAudioHint;
  } catch (e) { out.fetchError = String(e); }
  return JSON.stringify(out);
})()`;

const targets = await getJson('/json/list');
const page = targets.find(
  (t) => t.type === 'page' && /^https?:\/\/127\.0\.0\.1/.test(t.url || ''),
);
if (!page) {
  console.error(
    'No 127.0.0.1 renderer page found. Targets:',
    targets.map((t) => `${t.type} ${t.url}`).join('\n  '),
  );
  process.exit(2);
}
console.log('Renderer target:', page.url);
const result = await evaluate(page.webSocketDebuggerUrl, expr);
const value = result?.result?.value;
console.log('Renderer capabilities probe →', value);
try {
  const parsed = JSON.parse(value);
  if (parsed.supportsRealAudio === true && parsed.status === 200) {
    console.log('\nPASS: renderer resolves real ASR via the BFF (no demo-mode toast).');
    process.exit(0);
  }
  console.log('\nFAIL: renderer did NOT resolve real ASR.');
  process.exit(1);
} catch {
  process.exit(1);
}
