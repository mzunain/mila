import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  classifyCallApp,
  parseAudioAssertionPids,
  probePowerAssertions,
  probeProcessList,
} from './meeting-detector';

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

const CHROME_CAMERA_IN_USE = `
/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/137.0.7151.56/Helpers/Google Chrome Helper.app/Contents/MacOS/Google Chrome Helper --type=utility --utility-sub-type=video_capture.mojom.VideoCaptureService --lang=en-US --service-sandbox-type=none
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

test('probeProcessList detects Chrome browser media capture as a call', () => {
  const detection = probeProcessList(CHROME_CAMERA_IN_USE);
  assert.ok(detection);
  assert.equal(detection.provider, 'google-meet');
  assert.equal(detection.title, 'Chrome call');
  assert.equal(detection.detectedAppName, 'Chrome');
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

// --- pmset audio-assertion detection -------------------------------------
//
// Catalyst apps (WhatsApp, FaceTime) don't show up in process-list detection
// because they don't spawn distinct call helpers. We detect them via the
// coreaudiod mic-in power assertion that macOS publishes when ANY app uses
// the microphone.

// Captured from a live `pmset -g assertions` run while in a WhatsApp call
// (pid 64440 is WhatsApp).
const PMSET_WHATSAPP_IN_CALL = `
2026-05-27 17:39:13 +0300
Assertion status system-wide:
   BackgroundTask                 0
   PreventUserIdleSystemSleep     1
Listed by owning process:
   pid 685(sharingd): [0x0002890500019bbe] 00:03:37 PreventUserIdleSystemSleep named: "Handoff"
   pid 408(coreaudiod): [0x00026e27000196c1] 01:58:16 PreventUserIdleSystemSleep named: "com.apple.audio.VPAUAggregateAudioDevice-0xc393a8040.context.preventuseridlesleep"
\tCreated for PID: 64440.
\tResources: audio-in audio-out BuiltInMicrophoneDevice
   pid 64440(WhatsApp): [0x00026e200005962c] 01:58:22 PreventUserIdleDisplaySleep named: "net.whatsapp.idletimer"
`;

// Captured while playing music in Apple Music — coreaudiod holds an
// audio-OUT assertion but no audio-in. Should NOT fire.
const PMSET_MUSIC_PLAYBACK_ONLY = `
Assertion status system-wide:
   PreventUserIdleSystemSleep     1
Listed by owning process:
   pid 408(coreaudiod): [0x00026e27000196c2] 00:01:00 PreventUserIdleSystemSleep named: "com.apple.audio.context.preventuseridlesleep"
\tCreated for PID: 1234.
\tResources: audio-out BuiltInSpeakerDevice
`;

const PMSET_IDLE = `
Assertion status system-wide:
   PreventUserIdleSystemSleep     0
Listed by owning process:
   pid 337(powerd): [0x0...] 05:55:00 PreventUserIdleSystemSleep named: "Powerd"
`;

test('parseAudioAssertionPids extracts PIDs from coreaudiod mic-in assertions', () => {
  const pids = parseAudioAssertionPids(PMSET_WHATSAPP_IN_CALL);
  assert.deepEqual(pids, [64440]);
});

test('probePowerAssertions detects WhatsApp call idle-timer assertions', () => {
  const detection = probePowerAssertions(PMSET_WHATSAPP_IN_CALL);
  assert.ok(detection);
  assert.equal(detection.provider, 'whatsapp');
  assert.equal(detection.title, 'WhatsApp call');
});

test('parseAudioAssertionPids ignores audio-out-only assertions (music playback)', () => {
  const pids = parseAudioAssertionPids(PMSET_MUSIC_PLAYBACK_ONLY);
  assert.deepEqual(pids, []);
});

test('parseAudioAssertionPids returns empty when no coreaudiod assertions exist', () => {
  assert.deepEqual(parseAudioAssertionPids(PMSET_IDLE), []);
});

test('classifyCallApp maps WhatsApp to the whatsapp provider', () => {
  const detection = classifyCallApp('WhatsApp');
  assert.ok(detection);
  assert.equal(detection.provider, 'whatsapp');
  assert.equal(detection.title, 'WhatsApp call');
});

test('classifyCallApp maps Zoom mic assertions to the zoom provider', () => {
  const detection = classifyCallApp('zoom.us');
  assert.ok(detection);
  assert.equal(detection.provider, 'zoom');
  assert.equal(detection.title, 'Zoom meeting');
});

test('classifyCallApp is case-insensitive', () => {
  assert.equal(classifyCallApp('whatsapp')?.provider, 'whatsapp');
  assert.equal(classifyCallApp('FaceTime')?.provider, 'facetime');
});

test('classifyCallApp denylists Mila itself to prevent recursive detection', () => {
  // If we fired on Mila's own mic use, the act of recording would
  // re-trigger detection forever.
  assert.equal(classifyCallApp('Mila'), null);
  assert.equal(classifyCallApp('Mila Helper'), null);
});

test('classifyCallApp denylists non-call mic users like Voice Memos', () => {
  assert.equal(classifyCallApp('VoiceMemos'), null);
  assert.equal(classifyCallApp('QuickTime Player'), null);
});

test('classifyCallApp returns null for unknown apps so we do not auto-start on every mic use', () => {
  // Conservative: only allowlisted apps fire. An unknown mic-using app
  // (e.g. a niche meeting client) is better surfaced as a feature
  // request than as a noisy false-positive.
  assert.equal(classifyCallApp('SomeRandomApp'), null);
});

test('classifyCallApp matches Chrome/Chromium as google-meet (best-effort)', () => {
  const detection = classifyCallApp('Google Chrome');
  assert.ok(detection);
  assert.equal(detection.provider, 'google-meet');
  assert.equal(detection.detectedAppName, 'Chrome');
});
