// Pure builders + view-model for the floating "what to say" coaching overlay.
//
// The overlay is a frameless, always-on-top window that shows private talking
// points during a live call — even when the main Mila window is hidden behind
// Zoom/Meet/Teams. Like the backend splash and the meeting-detection toast it
// is a self-contained document loaded from a data: URL (no preload, no bundled
// assets). Live updates are pushed in via `webContents.executeJavaScript` so
// the window never reloads (no flicker): the document defines a global
// `window.__milaApplyState`, and the main process calls it with a new state.
//
// Everything here is pure so it can be unit-tested without Electron. The
// renderer-side render code lives as a string inside the document and uses
// `textContent` (never innerHTML) for dynamic copy, so suggestion text can
// never inject markup.

export type OverlayConfidence = "high" | "medium" | "low";

/** What the overlay is currently showing. A small discriminated union so the
 *  renderer and the mapper stay in lock-step. */
export type OverlayState =
  | { kind: "idle" }
  | { kind: "thinking" }
  | {
      kind: "suggestion";
      headline: string;
      points: string[];
      followUps: string[];
      confidence: OverlayConfidence;
    }
  | { kind: "unavailable"; reason: "no-model" | "no-suggestion" };

/** Loose shape of the suggestion forwarded from the web renderer over IPC.
 *  Treated as untrusted (it crosses a process boundary) and normalized. */
export interface OverlaySuggestionInput {
  headline?: unknown;
  talkingPoints?: unknown;
  followUps?: unknown;
  confidence?: unknown;
}

export interface AssistStateInput {
  /** Whether the mic is live — used by the window layer to decide auto-show. */
  live?: boolean;
  pending?: boolean;
  suggestion?: OverlaySuggestionInput | null;
  unavailable?: "no-model" | "no-suggestion" | null;
}

// Keep the overlay glanceable — it sits on top of a call, not a reading pane.
const MAX_POINTS = 4;
const MAX_FOLLOW_UPS = 3;

/** Map the raw assist state forwarded by the renderer into a render-ready
 *  overlay state. A usable suggestion wins; otherwise fall back to the most
 *  informative status (unavailable › thinking › idle). */
export function toOverlayState(input: AssistStateInput): OverlayState {
  const suggestion = input.suggestion;
  if (suggestion) {
    const points = normalizeList(suggestion.talkingPoints).slice(0, MAX_POINTS);
    if (points.length > 0) {
      return {
        kind: "suggestion",
        headline: normalizeText(suggestion.headline) || "Suggested reply",
        points,
        followUps: normalizeList(suggestion.followUps).slice(0, MAX_FOLLOW_UPS),
        confidence: normalizeConfidence(suggestion.confidence),
      };
    }
  }
  if (input.unavailable === "no-model" || input.unavailable === "no-suggestion") {
    return { kind: "unavailable", reason: input.unavailable };
  }
  if (input.pending) return { kind: "thinking" };
  return { kind: "idle" };
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeText(item))
    .filter((item) => item.length > 0);
}

function normalizeConfidence(value: unknown): OverlayConfidence {
  return value === "high" || value === "low" ? value : "medium";
}

/** A JS snippet (for `executeJavaScript`) that applies `state` to a loaded
 *  overlay document. Safe to inject: the payload is JSON, so it becomes a plain
 *  object literal in the page's JS context. */
export function overlayApplyScript(state: OverlayState): string {
  return `window.__milaApplyState && window.__milaApplyState(${JSON.stringify(state)});`;
}

/** The static overlay document. State is pushed in later via
 *  `overlayApplyScript`; it boots in the idle state. */
export function buildOverlayDocument(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;" />
<style>
  :root {
    color-scheme: dark;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
    background: transparent;
  }
  * { box-sizing: border-box; }
  html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
  body {
    padding: 8px;
    -webkit-user-select: none;
    user-select: none;
  }
  .card {
    height: 100%;
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 16px;
    background: rgba(22, 24, 27, 0.93);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.42);
    backdrop-filter: blur(22px);
    -webkit-backdrop-filter: blur(22px);
    color: #f7f4ef;
    overflow: hidden;
  }
  header {
    -webkit-app-region: drag;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 11px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .mark {
    width: 20px; height: 20px;
    border-radius: 6px;
    display: grid; place-items: center;
    background: linear-gradient(135deg, #67e8f9, #65f4b8);
    color: #041012;
    font-weight: 900; font-size: 11px;
    flex: none;
  }
  .heading { font-size: 12px; font-weight: 640; letter-spacing: 0.01em; flex: 1; min-width: 0; }
  .dot {
    width: 7px; height: 7px; border-radius: 999px;
    background: #65f4b8;
    box-shadow: 0 0 0 0 rgba(101, 244, 184, 0.6);
    animation: pulse 1.8s ease-out infinite;
    flex: none;
  }
  body[data-live="false"] .dot { background: #6b7280; animation: none; box-shadow: none; }
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(101, 244, 184, 0.55); }
    70% { box-shadow: 0 0 0 7px rgba(101, 244, 184, 0); }
    100% { box-shadow: 0 0 0 0 rgba(101, 244, 184, 0); }
  }
  .close {
    -webkit-app-region: no-drag;
    width: 20px; height: 20px;
    border-radius: 6px;
    display: grid; place-items: center;
    color: rgba(247, 244, 239, 0.7);
    text-decoration: none;
    font-size: 15px; line-height: 1;
    flex: none;
  }
  .close:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
  .body { padding: 11px 13px 13px; overflow-y: auto; flex: 1; }
  .headline {
    font-size: 13px; font-weight: 650; line-height: 1.3;
    display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
    margin: 0 0 9px;
  }
  ul.points { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 7px; }
  ul.points > li {
    position: relative; padding-left: 16px;
    font-size: 12.5px; line-height: 1.42; color: #f2efe9;
  }
  ul.points > li::before {
    content: ""; position: absolute; left: 2px; top: 7px;
    width: 6px; height: 6px; border-radius: 999px; background: #67e8f9;
  }
  .followups { margin-top: 11px; padding-top: 9px; border-top: 1px solid rgba(255, 255, 255, 0.09); }
  .eyebrow {
    text-transform: uppercase; letter-spacing: 0.07em;
    font-size: 9.5px; font-weight: 680; color: rgba(247, 244, 239, 0.5);
    margin-bottom: 5px;
  }
  ul.followups-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
  ul.followups-list > li { font-size: 11.5px; line-height: 1.36; color: rgba(247, 244, 239, 0.66); }
  .chip {
    flex: none; align-self: flex-start;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 999px; padding: 1px 8px;
    font-size: 10px; font-weight: 620; text-transform: capitalize;
    color: rgba(247, 244, 239, 0.72);
  }
  .chip-high { border-color: rgba(101, 244, 184, 0.4); color: #8af3c4; }
  .chip-low { border-color: rgba(255, 155, 124, 0.42); color: #ffb59b; }
  .hint { font-size: 12px; line-height: 1.45; color: rgba(247, 244, 239, 0.62); }
</style>
</head>
<body data-live="false">
  <div class="card">
    <header>
      <span class="mark">M</span>
      <span class="heading">What to say</span>
      <span class="dot" aria-hidden="true"></span>
      <a class="close" href="mila-overlay://hide" title="Hide overlay">×</a>
    </header>
    <div class="body" id="mila-body"></div>
  </div>
  <script>
    (function () {
      function el(tag, cls, text) {
        var node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text != null) node.textContent = text;
        return node;
      }
      window.__milaApplyState = function (state) {
        var root = document.getElementById('mila-body');
        if (!root) return;
        state = state || { kind: 'idle' };
        document.body.setAttribute('data-live', state.kind === 'idle' || state.kind === 'unavailable' ? 'false' : 'true');
        while (root.firstChild) root.removeChild(root.firstChild);
        if (state.kind === 'suggestion') {
          var headline = el('div', 'headline');
          headline.appendChild(el('span', null, state.headline || 'Suggested reply'));
          if (state.confidence) headline.appendChild(el('span', 'chip chip-' + state.confidence, state.confidence));
          root.appendChild(headline);
          var points = el('ul', 'points');
          (state.points || []).forEach(function (point) { points.appendChild(el('li', null, point)); });
          root.appendChild(points);
          if ((state.followUps || []).length) {
            var wrap = el('div', 'followups');
            wrap.appendChild(el('div', 'eyebrow', 'If you need to dig in'));
            var list = el('ul', 'followups-list');
            state.followUps.forEach(function (item) { list.appendChild(el('li', null, item)); });
            wrap.appendChild(list);
            root.appendChild(wrap);
          }
        } else if (state.kind === 'thinking') {
          root.appendChild(el('div', 'hint', 'Mila is thinking about your reply…'));
        } else if (state.kind === 'unavailable') {
          root.appendChild(el('div', 'hint', state.reason === 'no-model'
            ? 'No language model is configured on the server yet.'
            : 'Nothing useful to add right now.'));
        } else {
          root.appendChild(el('div', 'hint', 'Listening… talking points appear when it\\u2019s your turn.'));
        }
      };
      window.__milaApplyState({ kind: 'idle' });
    })();
  </script>
</body>
</html>`;
}

/** Wrap the overlay document as a data: URL suitable for `loadURL`. */
export function overlayDataUrl(): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(buildOverlayDocument())}`;
}
