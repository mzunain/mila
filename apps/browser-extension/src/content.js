const supportedMeeting =
  /meet\.google\.com|zoom\.us|teams\.microsoft\.com|web\.whatsapp\.com/.test(
    window.location.hostname,
  );

const sentCaptions = new Map();
let scanTimer = 0;
let meetingEnded = false;

if (supportedMeeting) {
  chrome.runtime.sendMessage({
    type: "mila.meeting-detected",
    url: window.location.href,
    title: document.title,
  });

  if (window.location.hostname.includes("meet.google.com")) {
    startGoogleMeetCaptionBridge();
  }

  window.addEventListener("pagehide", () => {
    chrome.runtime.sendMessage({
      type: "mila.meeting-ended",
      url: window.location.href,
      title: document.title,
    });
  });
}

function startGoogleMeetCaptionBridge() {
  const observer = new MutationObserver(scheduleCaptionScan);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  window.setInterval(pruneCaptionCache, 30_000);
  scheduleCaptionScan();
}

function scheduleCaptionScan() {
  if (scanTimer) {
    return;
  }

  scanTimer = window.setTimeout(() => {
    scanTimer = 0;
    scanGoogleMeetCaptions();
  }, 500);
}

function scanGoogleMeetCaptions() {
  detectGoogleMeetEnded();

  const candidates = [
    ...document.querySelectorAll(
      '[aria-live], [role="status"], [jsname], [data-message-text]',
    ),
  ];

  for (const element of candidates) {
    const caption = extractCaption(element);

    if (!caption) {
      continue;
    }

    const cacheKey = `${caption.speaker ?? ""}:${caption.text}`;

    if (sentCaptions.has(cacheKey)) {
      continue;
    }

    sentCaptions.set(cacheKey, Date.now());
    chrome.runtime.sendMessage({
      type: "mila.caption-detected",
      url: window.location.href,
      title: document.title,
      speaker: caption.speaker,
      text: caption.text,
      capturedAt: new Date().toISOString(),
    });
  }
}

function detectGoogleMeetEnded() {
  if (meetingEnded) {
    return;
  }

  const visibleText = normalizeText(
    document.body.innerText || "",
  ).toLowerCase();

  if (
    /\b(you left the meeting|return to home screen|rejoin|you've left the meeting)\b/.test(
      visibleText,
    )
  ) {
    meetingEnded = true;
    chrome.runtime.sendMessage({
      type: "mila.meeting-ended",
      url: window.location.href,
      title: document.title,
    });
  }
}

function extractCaption(element) {
  if (!(element instanceof HTMLElement) || !isVisible(element)) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  const text = normalizeText(element.innerText || element.textContent || "");

  if (!looksLikeCaptionText(text, rect)) {
    return null;
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > 1 && lines[0].length <= 48 && !/[.!?؟।]$/.test(lines[0])) {
    return {
      speaker: lines[0],
      text: normalizeText(lines.slice(1).join(" ")),
    };
  }

  return { text };
}

function looksLikeCaptionText(text, rect) {
  if (text.length < 4 || text.length > 280) {
    return false;
  }

  if (rect.top < window.innerHeight * 0.35 || rect.width < 120) {
    return false;
  }

  if (
    /^(join|leave|present|mute|unmute|captions|turn on captions|turn off captions|more options|chat|activities)$/i.test(
      text,
    )
  ) {
    return false;
  }

  return /[\p{L}\p{N}]/u.test(text);
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    Number(style.opacity) !== 0
  );
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function pruneCaptionCache() {
  const cutoff = Date.now() - 120_000;

  for (const [key, timestamp] of sentCaptions) {
    if (timestamp < cutoff) {
      sentCaptions.delete(key);
    }
  }
}
