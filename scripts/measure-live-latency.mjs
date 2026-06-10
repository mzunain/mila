#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename } from "node:path";
import { performance } from "node:perf_hooks";

const requireFromApi = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { WebSocket } = requireFromApi("ws");

const apiUrl = normalizeRestApiUrl(
  process.env.MILA_API_URL ?? "http://localhost:7400",
);
const wsUrl = stripTrailingSlash(
  process.env.MILA_WS_URL ?? apiUrl.replace(/\/api$/, "").replace(/^http/, "ws"),
);
const email = process.env.MILA_BENCH_EMAIL ?? "latency-bench@mila.local";
const password = process.env.MILA_BENCH_PASSWORD ?? "Latency123!";
const chunkCount = parsePositiveInt(process.env.MILA_BENCH_CHUNKS, 5);
const timeoutMs = parsePositiveInt(process.env.MILA_BENCH_TIMEOUT_MS, 30000);
const audioFile = process.env.MILA_BENCH_AUDIO_FILE;
const vocabulary = parseVocabulary(process.env.MILA_BENCH_VOCABULARY);

const samples = Array.from({ length: chunkCount }, (_, index) => ({
  id: `latency-${Date.now()}-${index}`,
  text: `Latency benchmark chunk ${index + 1}. Please capture this transcript promptly.`,
}));

const auth = await getAuth();
const session = await createSession(auth.token);
const socket = await openSocket(auth.token);

socket.send(
  JSON.stringify({
    type: "start",
    sessionId: session.id,
    outputLanguage: "en",
  }),
);

await waitForEvent(socket, (event) => event.type === "session", timeoutMs);

const mode = audioFile ? "audio" : "transcript";
const latencies = [];
const metricSamples = [];
let audioBase64 = null;
let mimeType = "audio/wav";

if (audioFile) {
  const bytes = await readFile(audioFile);
  audioBase64 = Buffer.from(bytes).toString("base64");
  mimeType = mimeTypeForPath(audioFile);
}

for (const sample of samples) {
  const started = performance.now();
  if (audioBase64) {
    socket.send(
      JSON.stringify({
        type: "audio-chunk",
        sessionId: session.id,
        chunkId: sample.id,
        capturedAt: new Date().toISOString(),
        mimeType,
        audioBase64,
        speakerId: "self",
        vocabulary,
      }),
    );
  } else {
    socket.send(
      JSON.stringify({
        type: "transcript-chunk",
        sessionId: session.id,
        chunkId: sample.id,
        capturedAt: new Date().toISOString(),
        speakerId: "self",
        text: sample.text,
        detectedLanguage: "en",
        isFinal: true,
      }),
    );
  }

  const event = await waitForEvent(
    socket,
    (candidate) =>
      candidate.type === "transcript" &&
      candidate.segment?.sessionId === session.id &&
      (audioBase64 || candidate.segment?.originalText === sample.text),
    timeoutMs,
  );
  const elapsed = performance.now() - started;
  latencies.push(elapsed);
  if (event.metrics) {
    metricSamples.push(event.metrics);
  }
  console.log(
    `${mode} chunk ${latencies.length}/${samples.length}: ${Math.round(
      elapsed,
    )}ms${formatMetrics(event.metrics)} -> ${event.segment.originalText.slice(0, 80)}`,
  );
}

socket.send(JSON.stringify({ type: "stop", sessionId: session.id }));
socket.close();

const summary = summarize(latencies);
console.log("");
console.log(`Mode: ${mode}${audioFile ? ` (${basename(audioFile)})` : ""}`);
console.log(`Session: ${session.id}`);
console.log(
  `Latency ms: min=${summary.min} p50=${summary.p50} p95=${summary.p95} max=${summary.max}`,
);
if (metricSamples.length) {
  printMetricSummary(metricSamples);
}

async function getAuth() {
  const register = await postJson("/auth/register", {
    email,
    password,
    name: "Latency Bench",
  });

  if (register.ok) {
    return register.body;
  }

  const login = await postJson("/auth/login", { email, password });
  if (!login.ok) {
    throw new Error(
      `Unable to register or login benchmark user: ${login.status} ${JSON.stringify(
        login.body,
      )}`,
    );
  }
  return login.body;
}

async function createSession(token) {
  const response = await postJson(
    "/sessions",
    {
      title: `Latency benchmark ${new Date().toISOString()}`,
      outputLanguage: "en",
      source: "manual",
    },
    token,
  );
  if (!response.ok) {
    throw new Error(
      `Unable to create benchmark session: ${response.status} ${JSON.stringify(
        response.body,
      )}`,
    );
  }
  return response.body.session;
}

async function postJson(path, body, token) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  return { ok: response.ok, status: response.status, body: parsed };
}

function openSocket(token) {
  const url = `${wsUrl}/meetings/live?token=${encodeURIComponent(token)}`;
  const socket = new WebSocket(url);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`WebSocket did not open within ${timeoutMs}ms`));
    }, timeoutMs);
    socket.once("open", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function waitForEvent(socket, predicate, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(`Timed out after ${timeout}ms waiting for WebSocket event`),
      );
    }, timeout);

    const onMessage = (data) => {
      let event;
      try {
        event = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (event.type === "error") {
        cleanup();
        reject(new Error(`WebSocket error: ${event.code} ${event.message}`));
        return;
      }
      if (
        event.type === "status" &&
        (event.code === "ASR_TIMEOUT" || event.code === "ASR_ERROR")
      ) {
        cleanup();
        reject(new Error(`WebSocket status: ${event.code} ${event.message}`));
        return;
      }
      if (predicate(event)) {
        cleanup();
        resolve(event);
      }
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    function cleanup() {
      clearTimeout(timer);
      socket.off("message", onMessage);
      socket.off("error", onError);
    }

    socket.on("message", onMessage);
    socket.on("error", onError);
  });
}

function summarize(values) {
  const sorted = [...values]
    .sort((a, b) => a - b)
    .map((value) => Math.round(value));
  return {
    min: sorted[0] ?? 0,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[index];
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function normalizeRestApiUrl(value) {
  const clean = stripTrailingSlash(value);
  return clean.endsWith("/api") ? clean : `${clean}/api`;
}

function parsePositiveInt(raw, fallback) {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseVocabulary(raw) {
  return (raw ?? "")
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);
}

function mimeTypeForPath(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".webm")) return "audio/webm";
  if (lower.endsWith(".aiff") || lower.endsWith(".aif")) return "audio/aiff";
  if (lower.endsWith(".m4a") || lower.endsWith(".mp4")) return "audio/mp4";
  return "audio/wav";
}

function formatMetrics(metrics) {
  if (!metrics) return "";
  const parts = [
    ["queue", metrics.queueMs],
    ["asr", metrics.asrMs],
    ["db", metrics.persistMs],
    ["notes", metrics.notesMs],
    ["total", metrics.totalMs],
  ]
    .filter(([, value]) => Number.isFinite(value))
    .map(([label, value]) => `${label}=${Math.round(value)}ms`);
  return parts.length ? ` (${parts.join(" ")})` : "";
}

function printMetricSummary(metrics) {
  const fields = [
    ["queue", "queueMs"],
    ["asr", "asrMs"],
    ["db", "persistMs"],
    ["notes", "notesMs"],
    ["server-total", "totalMs"],
  ];
  console.log("");
  console.log("Server metrics ms:");
  for (const [label, key] of fields) {
    const values = metrics
      .map((item) => item[key])
      .filter((value) => Number.isFinite(value));
    if (!values.length) continue;
    const stats = summarize(values);
    console.log(
      `  ${label}: min=${stats.min} p50=${stats.p50} p95=${stats.p95} max=${stats.max}`,
    );
  }
}
