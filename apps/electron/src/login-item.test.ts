import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  buildLoginItemSettings,
  readLoginItemSettings,
  shouldShowMainWindowOnReady,
  syncLaunchAtLoginPreference,
} from './login-item';

test('buildLoginItemSettings starts macOS login items hidden', () => {
  assert.deepEqual(buildLoginItemSettings(true, 'darwin'), {
    openAtLogin: true,
    openAsHidden: true,
  });

  assert.deepEqual(buildLoginItemSettings(false, 'darwin'), {
    openAtLogin: false,
    openAsHidden: false,
  });
});

test('buildLoginItemSettings avoids macOS-only flags on other platforms', () => {
  assert.deepEqual(buildLoginItemSettings(true, 'win32'), {
    openAtLogin: true,
  });
});

test('syncLaunchAtLoginPreference applies the requested OS setting', () => {
  let received: unknown = null;
  const ok = syncLaunchAtLoginPreference(
    {
      getLoginItemSettings: () => ({}),
      setLoginItemSettings: (settings) => {
        received = settings;
      },
    },
    true,
  );

  assert.equal(ok, true);
  assert.deepEqual(received, buildLoginItemSettings(true));
});

test('readLoginItemSettings degrades safely when the OS API is unavailable', () => {
  const settings = readLoginItemSettings({
    getLoginItemSettings: () => {
      throw new Error('unsupported');
    },
    setLoginItemSettings: () => undefined,
  });

  assert.deepEqual(settings, {});
});

test('shouldShowMainWindowOnReady hides login-started sessions', () => {
  assert.equal(
    shouldShowMainWindowOnReady(
      { startMinimized: false },
      { wasOpenedAtLogin: true },
    ),
    false,
  );
  assert.equal(
    shouldShowMainWindowOnReady(
      { startMinimized: false },
      { wasOpenedAsHidden: true },
    ),
    false,
  );
  assert.equal(shouldShowMainWindowOnReady({ startMinimized: true }, {}), false);
  assert.equal(shouldShowMainWindowOnReady({ startMinimized: false }, {}), true);
});
