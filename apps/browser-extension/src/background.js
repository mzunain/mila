const MILA_URL = "http://localhost:3002/";
const MILA_API_URL = "http://localhost:4000";
const MILA_WS_URL = "ws://localhost:4000/meetings/live";

const bridgesByTab = new Map();

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!sender.tab?.id || !sender.tab.url) {
    return;
  }

  if (message?.type === "mila.meeting-detected") {
    void startBridge(sender.tab.id, sender.tab.url, sender.tab.title);
    return;
  }

  if (message?.type === "mila.caption-detected") {
    void sendCaption(sender.tab.id, sender.tab.url, sender.tab.title, message);
    return;
  }

  if (message?.type === "mila.meeting-ended") {
    stopBridge(sender.tab.id);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  stopBridge(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) {
    return;
  }

  if (detectProvider(changeInfo.url) === "unknown") {
    stopBridge(tabId);
  }
});

async function startBridge(tabId, meetingUrl, tabTitle = "Detected meeting") {
  const signal = buildSignal(meetingUrl, tabTitle);

  if (!signal) {
    return null;
  }

  const existing = bridgesByTab.get(tabId);

  if (existing?.sessionId) {
    return existing;
  }

  const created = await createMilaSession(signal);
  const bridge = {
    ...signal,
    sessionId: created.session.id,
    socket: null,
    queue: [],
  };
  bridgesByTab.set(tabId, bridge);

  openMilaSession(bridge);
  connectBridgeSocket(bridge);

  return bridge;
}

async function sendCaption(tabId, meetingUrl, tabTitle, message) {
  const bridge =
    (await startBridge(tabId, meetingUrl, tabTitle)) ?? bridgesByTab.get(tabId);

  if (!bridge?.sessionId || !message.text) {
    return;
  }

  const event = {
    type: "transcript-chunk",
    sessionId: bridge.sessionId,
    chunkId: `${bridge.sessionId}-caption-${Date.now()}-${hashText(message.text)}`,
    capturedAt: message.capturedAt ?? new Date().toISOString(),
    text: message.text,
    speakerId: message.speaker,
    isFinal: true,
  };

  if (bridge.socket?.readyState === WebSocket.OPEN) {
    bridge.socket.send(JSON.stringify(event));
    return;
  }

  bridge.queue.push(event);
  connectBridgeSocket(bridge);
}

async function createMilaSession(signal) {
  const response = await fetch(`${MILA_API_URL}/api/sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      title: signal.title,
      outputLanguage: "en",
      source: "auto-browser",
      autoStarted: true,
      externalMeeting: {
        provider: signal.provider,
        title: signal.title,
        url: signal.meetingUrl,
        detectedAt: new Date().toISOString(),
        source: "auto-browser",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Mila API rejected session creation: ${response.status}`);
  }

  return response.json();
}

function connectBridgeSocket(bridge) {
  if (
    bridge.socket?.readyState === WebSocket.OPEN ||
    bridge.socket?.readyState === WebSocket.CONNECTING
  ) {
    return;
  }

  const socket = new WebSocket(MILA_WS_URL);
  bridge.socket = socket;

  socket.addEventListener("open", () => {
    socket.send(
      JSON.stringify({
        type: "start",
        sessionId: bridge.sessionId,
        outputLanguage: "en",
      }),
    );

    while (bridge.queue.length && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(bridge.queue.shift()));
    }
  });

  socket.addEventListener("close", () => {
    if (bridge.socket === socket) {
      bridge.socket = null;
    }
  });
}

function stopBridge(tabId) {
  const bridge = bridgesByTab.get(tabId);

  if (!bridge) {
    return;
  }

  if (bridge.sessionId && bridge.socket?.readyState === WebSocket.OPEN) {
    bridge.socket.send(
      JSON.stringify({
        type: "stop",
        sessionId: bridge.sessionId,
      }),
    );
  }

  bridge.socket?.close();
  bridgesByTab.delete(tabId);
}

function openMilaSession(bridge) {
  const url = new URL(MILA_URL);
  url.searchParams.set("sessionId", bridge.sessionId);
  url.searchParams.set("autostart", "1");
  url.searchParams.set("captionBridge", "1");
  url.searchParams.set("captureAudio", "0");
  url.searchParams.set("mockAudio", "0");
  url.searchParams.set("provider", bridge.provider);
  url.searchParams.set("source", "auto-browser");
  url.searchParams.set("meetingUrl", bridge.meetingUrl);
  url.searchParams.set("title", bridge.title);

  chrome.tabs.create({ url: url.toString() });
}

function buildSignal(meetingUrl, tabTitle = "Detected meeting") {
  const provider = detectProvider(meetingUrl);

  if (provider === "unknown") {
    return null;
  }

  return {
    provider,
    meetingUrl,
    title: tabTitle || provider,
  };
}

function detectProvider(meetingUrl) {
  const hostname = new URL(meetingUrl).hostname;

  if (hostname.includes("meet.google.com")) {
    return "google-meet";
  }

  if (hostname.includes("zoom.us")) {
    return "zoom";
  }

  if (hostname.includes("teams.microsoft.com")) {
    return "microsoft-teams";
  }

  if (hostname.includes("web.whatsapp.com")) {
    return "whatsapp-web";
  }

  return "unknown";
}

function hashText(text) {
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}
