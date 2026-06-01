import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  buildOverlayDocument,
  overlayApplyScript,
  overlayDataUrl,
  toOverlayState,
} from "./assist-overlay-content";

test("toOverlayState maps a usable suggestion and clamps the lists", () => {
  const state = toOverlayState({
    suggestion: {
      headline: "  Acknowledge the risk  ",
      talkingPoints: ["one", "two", "three", "four", "five", "six"],
      followUps: ["a", "b", "c", "d"],
      confidence: "high",
    },
  });

  assert.equal(state.kind, "suggestion");
  if (state.kind !== "suggestion") return;
  assert.equal(state.headline, "Acknowledge the risk");
  assert.deepEqual(state.points, ["one", "two", "three", "four"]);
  assert.deepEqual(state.followUps, ["a", "b", "c"]);
  assert.equal(state.confidence, "high");
});

test("toOverlayState drops empty strings and defaults the headline", () => {
  const state = toOverlayState({
    suggestion: {
      headline: "   ",
      talkingPoints: ["", "  ", "real point"],
      followUps: [],
      confidence: "weird",
    },
  });

  assert.equal(state.kind, "suggestion");
  if (state.kind !== "suggestion") return;
  assert.equal(state.headline, "Suggested reply");
  assert.deepEqual(state.points, ["real point"]);
  assert.deepEqual(state.followUps, []);
  // Unknown confidence normalizes to medium.
  assert.equal(state.confidence, "medium");
});

test("toOverlayState falls back to status when there are no points", () => {
  assert.deepEqual(
    toOverlayState({ suggestion: { talkingPoints: [] }, pending: true }),
    { kind: "thinking" },
  );
  assert.deepEqual(toOverlayState({ unavailable: "no-model" }), {
    kind: "unavailable",
    reason: "no-model",
  });
  assert.deepEqual(toOverlayState({ unavailable: "no-suggestion" }), {
    kind: "unavailable",
    reason: "no-suggestion",
  });
  assert.deepEqual(toOverlayState({ pending: true }), { kind: "thinking" });
  assert.deepEqual(toOverlayState({}), { kind: "idle" });
});

test("a present suggestion wins over an unavailable reason", () => {
  const state = toOverlayState({
    suggestion: { talkingPoints: ["say this"] },
    unavailable: "no-suggestion",
    pending: true,
  });
  assert.equal(state.kind, "suggestion");
});

test("overlayApplyScript invokes the renderer hook with JSON state", () => {
  const script = overlayApplyScript({ kind: "idle" });
  assert.match(script, /window\.__milaApplyState/);
  assert.ok(script.includes('{"kind":"idle"}'));
});

test("buildOverlayDocument is a self-contained document booting in idle", () => {
  const html = buildOverlayDocument();
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /id="mila-body"/);
  assert.match(html, /window\.__milaApplyState/);
  assert.match(html, /__milaApplyState\(\{ kind: 'idle' \}\)/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /mila-overlay:\/\/hide/);
});

test("overlayDataUrl produces a loadable data URL", () => {
  const url = overlayDataUrl();
  assert.match(url, /^data:text\/html;charset=utf-8,/);
  assert.ok(
    decodeURIComponent(url.split(",")[1] ?? "").includes("__milaApplyState"),
  );
});
