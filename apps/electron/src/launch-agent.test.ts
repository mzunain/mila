import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  BACKEND_LAUNCH_AGENT_LABEL,
  backendLaunchAgentPlistPath,
  buildBackendLaunchAgentPlist,
  escapeXml,
} from './launch-agent';

test('backendLaunchAgentPlistPath points at ~/Library/LaunchAgents', () => {
  assert.equal(
    backendLaunchAgentPlistPath('/Users/me'),
    '/Users/me/Library/LaunchAgents/com.mila.backend.plist',
  );
});

test('buildBackendLaunchAgentPlist runs the script under /bin/bash at load', () => {
  const plist = buildBackendLaunchAgentPlist({
    scriptPath: '/repo/scripts/mila-autostart.sh',
    workingDirectory: '/repo',
    logDir: '/logs',
  });

  assert.match(plist, /<string>com\.mila\.backend<\/string>/);
  assert.match(plist, /<string>\/bin\/bash<\/string>/);
  assert.match(plist, /<string>\/repo\/scripts\/mila-autostart\.sh<\/string>/);
  assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(plist, /<string>\/repo<\/string>/);
  assert.match(plist, /<string>\/logs\/autostart\.out\.log<\/string>/);
  assert.match(plist, /<string>\/logs\/autostart\.err\.log<\/string>/);
  // Label constant is the one the installer/uninstaller target.
  assert.ok(plist.includes(BACKEND_LAUNCH_AGENT_LABEL));
});

test('buildBackendLaunchAgentPlist defaults the self-heal interval to 30 min', () => {
  const plist = buildBackendLaunchAgentPlist({
    scriptPath: '/s.sh',
    workingDirectory: '/w',
    logDir: '/l',
  });
  assert.match(plist, /<key>StartInterval<\/key>\s*<integer>1800<\/integer>/);
});

test('buildBackendLaunchAgentPlist honours an explicit integer interval', () => {
  const plist = buildBackendLaunchAgentPlist({
    scriptPath: '/s.sh',
    workingDirectory: '/w',
    logDir: '/l',
    startIntervalSeconds: 60.9,
  });
  // Coerced to a whole integer so launchd never sees a fractional value.
  assert.match(plist, /<integer>60<\/integer>/);
});

test('buildBackendLaunchAgentPlist escapes XML-significant characters in paths', () => {
  const plist = buildBackendLaunchAgentPlist({
    scriptPath: '/Users/a & b/scripts/mila-autostart.sh',
    workingDirectory: '/Users/a & b',
    logDir: '/Users/a & b/logs',
  });
  assert.ok(plist.includes('/Users/a &amp; b/scripts/mila-autostart.sh'));
  // No raw, unescaped ampersand should survive into the document.
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;)/.test(plist));
});

test('escapeXml escapes the five XML metacharacters', () => {
  assert.equal(
    escapeXml(`<a href="x" id='y'>&</a>`),
    '&lt;a href=&quot;x&quot; id=&apos;y&apos;&gt;&amp;&lt;/a&gt;',
  );
});
