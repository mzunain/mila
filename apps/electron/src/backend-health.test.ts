import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { healthUrlFromApiUrl, pollHealth } from './backend-health';

test('healthUrlFromApiUrl derives /api/health from an origin', () => {
  assert.equal(
    healthUrlFromApiUrl('http://localhost:7400'),
    'http://localhost:7400/api/health',
  );
});

test('healthUrlFromApiUrl ignores any path, query, or trailing slash', () => {
  assert.equal(
    healthUrlFromApiUrl('http://localhost:7400/'),
    'http://localhost:7400/api/health',
  );
  assert.equal(
    healthUrlFromApiUrl('https://api.mila.app/some/path?x=1'),
    'https://api.mila.app/api/health',
  );
});

test('healthUrlFromApiUrl tolerates a bare host:port by assuming http', () => {
  assert.equal(
    healthUrlFromApiUrl('localhost:7400'),
    'http://localhost:7400/api/health',
  );
});

test('pollHealth resolves true as soon as the probe reports healthy', async () => {
  let calls = 0;
  const healthy = await pollHealth({
    probe: async () => {
      calls += 1;
      return calls >= 3;
    },
    timeoutMs: 10_000,
    intervalMs: 100,
    now: () => 0, // never advances, so only the probe terminates the loop
    sleep: async () => {},
  });
  assert.equal(healthy, true);
  assert.equal(calls, 3);
});

test('pollHealth gives up after the timeout and resolves false', async () => {
  let clock = 0;
  let calls = 0;
  const healthy = await pollHealth({
    probe: async () => {
      calls += 1;
      return false;
    },
    timeoutMs: 500,
    intervalMs: 200,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  });
  assert.equal(healthy, false);
  // attempts at t=0, 200, 400; at t=400 the next try (t=600) would pass the
  // deadline 500, so it stops without probing past the timeout.
  assert.equal(calls, 3);
});

test('pollHealth treats a throwing probe as not-yet-healthy', async () => {
  let clock = 0;
  let calls = 0;
  const healthy = await pollHealth({
    probe: async () => {
      calls += 1;
      if (calls < 2) throw new Error('connection refused');
      return true;
    },
    timeoutMs: 5_000,
    intervalMs: 100,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  });
  assert.equal(healthy, true);
  assert.equal(calls, 2);
});

test('pollHealth honours cooperative cancellation', async () => {
  const signal = { aborted: true };
  let calls = 0;
  const healthy = await pollHealth({
    probe: async () => {
      calls += 1;
      return true;
    },
    timeoutMs: 5_000,
    intervalMs: 100,
    signal,
  });
  assert.equal(healthy, false);
  assert.equal(calls, 0);
});
