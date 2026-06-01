import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  decideDisplayMediaResponse,
  loopbackCaptureSupported,
  loopbackMajorVersion,
} from "./loopback-capture";

test("loopbackMajorVersion parses the leading major or 0", () => {
  assert.equal(loopbackMajorVersion("33.2.0"), 33);
  assert.equal(loopbackMajorVersion("31.0.0-beta.1"), 31);
  assert.equal(loopbackMajorVersion(undefined), 0);
  assert.equal(loopbackMajorVersion("garbage"), 0);
});

test("loopbackCaptureSupported requires macOS and a recent Electron", () => {
  assert.equal(
    loopbackCaptureSupported({ platform: "darwin", electronVersion: "33.2.0" }),
    true,
  );
  // Below the minimum major.
  assert.equal(
    loopbackCaptureSupported({ platform: "darwin", electronVersion: "30.0.0" }),
    false,
  );
  // Wrong platform.
  assert.equal(
    loopbackCaptureSupported({ platform: "win32", electronVersion: "33.2.0" }),
    false,
  );
  assert.equal(
    loopbackCaptureSupported({ platform: "linux", electronVersion: "33.2.0" }),
    false,
  );
  // Missing version.
  assert.equal(loopbackCaptureSupported({ platform: "darwin" }), false);
});

test("decideDisplayMediaResponse only grants loopback when supported + asked", () => {
  assert.deepEqual(
    decideDisplayMediaResponse({ supported: true, audioRequested: true }),
    { audio: "loopback" },
  );
  assert.deepEqual(
    decideDisplayMediaResponse({ supported: true, audioRequested: false }),
    {},
  );
  assert.deepEqual(
    decideDisplayMediaResponse({ supported: false, audioRequested: true }),
    {},
  );
});
