import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { autostartScriptCandidates } from './backend-paths';

test('autostartScriptCandidates resolves the repo script from apps/electron', () => {
  const candidates = autostartScriptCandidates('/Users/dev/mila/apps/electron');
  assert.ok(
    candidates.includes('/Users/dev/mila/scripts/mila-autostart.sh'),
    `expected repo-root script in ${JSON.stringify(candidates)}`,
  );
});

test('autostartScriptCandidates covers the compiled dist dir', () => {
  const candidates = autostartScriptCandidates(
    '/Users/dev/mila/apps/electron/dist',
  );
  assert.ok(
    candidates.includes('/Users/dev/mila/scripts/mila-autostart.sh'),
    `expected repo-root script in ${JSON.stringify(candidates)}`,
  );
});

test('autostartScriptCandidates returns absolute paths ending in the script name', () => {
  const candidates = autostartScriptCandidates('/x/apps/electron');
  assert.ok(candidates.length > 0);
  for (const candidate of candidates) {
    assert.ok(candidate.startsWith('/'), `not absolute: ${candidate}`);
    assert.ok(candidate.endsWith('/mila-autostart.sh'), `unexpected: ${candidate}`);
  }
});
