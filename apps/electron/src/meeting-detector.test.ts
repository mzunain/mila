import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { probeProcessList } from './meeting-detector';

// Synthetic process-list fragments captured from a real macOS `ps -axo command`
// run. We test the regex matchers against representative shapes rather than
// the live system, so the test passes whether or not the developer running
// it happens to be in a meeting at the time.

const ZOOM_IDLE = `
/Applications/Mila.app/Contents/MacOS/Mila
/Users/foo/Applications/zoom.us.app/Contents/MacOS/zoom.us
/usr/sbin/cfprefsd
`;

const ZOOM_IN_CALL = `
/Applications/Mila.app/Contents/MacOS/Mila
/Users/foo/Applications/zoom.us.app/Contents/MacOS/zoom.us
/Users/foo/Applications/zoom.us.app/Contents/Frameworks/CptHost.app/Contents/MacOS/CptHost
/Users/foo/Applications/zoom.us.app/Contents/Frameworks/caphost.app/Contents/MacOS/caphost
/Users/foo/Applications/zoom.us.app/Contents/Frameworks/aomhost.app/Contents/MacOS/aomhost
/usr/sbin/cfprefsd
`;

const TEAMS_IDLE = `
/Applications/Microsoft Teams.app/Contents/MacOS/MSTeams
/Applications/Microsoft Teams.app/Contents/PlugIns/TeamsWidgetExtension.appex/Contents/MacOS/TeamsWidgetExtension
`;

const TEAMS_IN_CALL = `
/Applications/Microsoft Teams.app/Contents/MacOS/MSTeams
/Applications/Microsoft Teams.app/Contents/PlugIns/TeamsWidgetExtension.appex/Contents/MacOS/TeamsWidgetExtension
Core Audio Driver (MSTeamsAudioDevice.driver)
`;

const NOTHING_INTERESTING = `
/usr/sbin/cfprefsd
/System/Library/CoreServices/launchservicesd
/Applications/Slack.app/Contents/MacOS/Slack
`;

test('probeProcessList returns null when no conferencing app is in a call', () => {
  assert.equal(probeProcessList(NOTHING_INTERESTING), null);
});

test('probeProcessList ignores Zoom that is signed in but not in a meeting', () => {
  // zoom.us is running but no CptHost/caphost/aomhost — that means menu-bar
  // only / signed-in state. We should NOT fire.
  assert.equal(probeProcessList(ZOOM_IDLE), null);
});

test('probeProcessList detects a Zoom call via its capture-helper processes', () => {
  const detection = probeProcessList(ZOOM_IN_CALL);
  assert.ok(detection, 'expected a detection');
  assert.equal(detection.provider, 'zoom');
  assert.equal(detection.title, 'Zoom meeting');
  assert.ok(detection.detectedAt, 'detectedAt should be populated');
});

test('probeProcessList detects a Zoom call when only CptHost is present', () => {
  // CptHost alone is enough — different Zoom versions spawn different subsets
  // of the three helpers.
  const procList = `
/Users/foo/Applications/zoom.us.app/Contents/Frameworks/CptHost.app/Contents/MacOS/CptHost
`;
  const detection = probeProcessList(procList);
  assert.ok(detection);
  assert.equal(detection.provider, 'zoom');
});

test('probeProcessList ignores Teams that is running but has no audio driver loaded', () => {
  assert.equal(probeProcessList(TEAMS_IDLE), null);
});

test('probeProcessList detects a Teams call via the audio driver + app combo', () => {
  const detection = probeProcessList(TEAMS_IN_CALL);
  assert.ok(detection);
  assert.equal(detection.provider, 'microsoft-teams');
});

test('probeProcessList does not fire on Teams audio driver without the Teams app', () => {
  // Defense: some installs leave the audio driver lingering after Teams quits.
  // Without the app running we should NOT auto-start a session.
  const procList = `Core Audio Driver (MSTeamsAudioDevice.driver)`;
  assert.equal(probeProcessList(procList), null);
});

test('probeProcessList prefers Zoom over Teams when both look in-call', () => {
  // Real-world scenario: user is in a Zoom call AND has Teams loaded with its
  // driver. We pick the more specific signal (Zoom, since it requires
  // capture-helper presence which is unambiguous).
  const procList = ZOOM_IN_CALL + TEAMS_IN_CALL;
  const detection = probeProcessList(procList);
  assert.ok(detection);
  assert.equal(detection.provider, 'zoom');
});
