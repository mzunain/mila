"use client";

import {
  ActionItem,
  AssistSuggestion,
  AssistTurn,
  CreateMeetingRequest,
  CreateMeetingResponse,
  ExternalMeetingContext,
  MeetingActionInbox,
  MeetingBrief,
  MeetingNotes,
  MeetingProvider,
  MeetingSession,
  MeetingSource,
  ServerMeetingEvent,
  SupportedLanguageCode,
  TranscriptSegment,
  LiveCoachCard as LiveCoachCardModel,
  LiveMeetingCoach,
  buildLiveMeetingCoach,
  buildMeetingActionReview,
  createEmptyNotes,
  getLanguage,
  supportedLanguages,
} from "@mila/shared";
import {
  AlertCircle,
  ArrowUpRight,
  BrainCircuit,
  CalendarClock,
  Clipboard,
  Captions,
  CheckCircle2,
  Command,
  FileAudio,
  FileDown,
  Info,
  Languages,
  ListTodo,
  MessageCircleQuestion,
  Mic,
  Pause,
  Play,
  Radar,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Square,
  ToggleLeft,
  ToggleRight,
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandLogo } from "./brand-logo";
import { AccountCard } from "./auth/account-card";
import { CommandPalette } from "./command-palette";
import { LiveAssistPanel } from "./live-assist-panel";
import { MeetingBriefCard } from "./meeting-brief-card";
import { ShareSessionButton } from "./share-session-button";
import { TemplatePicker } from "./template-picker";
import { WorkspaceNav } from "./workspace-nav";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  resolveApiUrl,
  resolveWsUrl,
  usePreferences,
} from "@/lib/preferences";

type TranscriptMode = "original" | "translated";
type SessionStatus =
  | "idle"
  | "connecting"
  | "recording"
  | "processing"
  | "paused"
  | "error";
type AutoStartStatus = "off" | "watching" | "detected" | "starting" | "blocked";
type MicPermissionState =
  | "unknown"
  | "prompt"
  | "granted"
  | "denied"
  | "unsupported";
type NoticeTone = "info" | "warning" | "error";
type TranscriptionHealth = "ready" | "catching-up";

interface WorkspaceNotice {
  id: number;
  tone: NoticeTone;
  title: string;
  message: string;
}

type ServerErrorEvent = Extract<ServerMeetingEvent, { type: "error" }>;
type ServerStatusEvent = Extract<ServerMeetingEvent, { type: "status" }>;
type RecoverableServerEvent = ServerErrorEvent | ServerStatusEvent;

interface AutoStartSignal {
  title?: string;
  meetingUrl?: string;
  provider: MeetingProvider;
  source: MeetingSource;
  detectedAt: string;
  captureAudio: boolean;
  mockAudio: boolean;
}

interface StartLiveSessionOptions {
  title?: string;
  source?: MeetingSource;
  autoStarted?: boolean;
  externalMeeting?: ExternalMeetingContext;
  templateId?: string;
}

type DesktopWorkspaceCommand =
  | "mila:desktop-new-meeting"
  | "mila:desktop-start-mic"
  | "mila:desktop-stop-mic";

interface AppCapabilities {
  asrProvider: string;
  supportsRealAudio: boolean;
  supportsDemoAudio: boolean;
  supportedInputs: string[];
  // Operator-facing guidance the API returns when ASR is in demo mode; tells
  // the user how to switch on real transcription. Absent when real audio works.
  realAudioHint?: string | null;
}

interface MeetingSessionDetail {
  session: MeetingSession;
  segments: TranscriptSegment[];
  notes: MeetingNotes;
}

interface WorkspaceUser {
  id: string;
  email: string;
  name: string | null;
}

interface MeetingWorkspaceProps {
  token: string;
  user: WorkspaceUser;
}

const PENDING_WORKSPACE_COMMAND_KEY = "mila:pending-desktop-command";
const STORED_AUTO_START_SIGNAL_TTL_MS = 10 * 60 * 1000;

// Narrow view of the Electron preload bridge used to drive the desktop coaching
// overlay. Declared locally so the web build stays decoupled from the shell.
type AssistDesktopBridge = {
  assist?: {
    update: (state: {
      enabled: boolean;
      live: boolean;
      pending: boolean;
      suggestion: AssistSuggestion | null;
      unavailable: "no-model" | "no-suggestion" | null;
    }) => void;
  };
};

// On a real call the other participants come out of the speakers, not the mic —
// with headphones the mic never hears them at all. The desktop shell answers
// `getDisplayMedia({ audio })` with system-audio loopback (ScreenCaptureKit), so
// when this bridge reports support we mix that system feed in alongside the mic.
type CaptureDesktopBridge = {
  loopback?: {
    isSupported: () => Promise<boolean>;
  };
};

export function MeetingWorkspace({ token, user }: MeetingWorkspaceProps) {
  const { preferences } = usePreferences();
  const apiHttpUrl = useMemo(() => resolveApiUrl(preferences), [preferences]);
  const apiWsBase = useMemo(() => resolveWsUrl(preferences), [preferences]);
  const apiWsUrl = useMemo(() => {
    const separator = apiWsBase.includes("?") ? "&" : "?";
    return `${apiWsBase}${separator}token=${encodeURIComponent(token)}`;
  }, [token, apiWsBase]);
  const [session, setSession] = useState<MeetingSession | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [notes, setNotes] = useState<MeetingNotes>(() =>
    createEmptyNotes("en"),
  );
  const [outputLanguage, setOutputLanguage] = useState<SupportedLanguageCode>(
    () => normalizeLanguage(preferences.outputLanguage),
  );
  const [templateId, setTemplateId] = useState<string>("general");
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  const [mode, setMode] = useState<TranscriptMode>("translated");
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [autoStartEnabled, setAutoStartEnabled] = useState(true);
  const [autoStartStatus, setAutoStartStatus] =
    useState<AutoStartStatus>("watching");
  const [autoStartSignal, setAutoStartSignal] =
    useState<AutoStartSignal | null>(null);
  const [capabilities, setCapabilities] = useState<AppCapabilities>({
    asrProvider: "mock",
    supportsRealAudio: false,
    supportsDemoAudio: true,
    supportedInputs: ["audio/webm", "audio/ogg", "audio/mpeg", "audio/wav"],
  });
  const [actionInbox, setActionInbox] = useState<MeetingActionInbox | null>(
    null,
  );
  const [actionInboxLoading, setActionInboxLoading] = useState(true);
  const [micPermission, setMicPermission] =
    useState<MicPermissionState>("unknown");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<WorkspaceNotice | null>(null);
  const [transcriptionHealth, setTranscriptionHealth] =
    useState<TranscriptionHealth>("ready");
  const [search, setSearch] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [assistEnabled, setAssistEnabled] = useState(false);
  const [assistSuggestion, setAssistSuggestion] =
    useState<AssistSuggestion | null>(null);
  const [assistUnavailable, setAssistUnavailable] = useState<
    "no-model" | "no-suggestion" | null
  >(null);
  const [assistPending, setAssistPending] = useState(false);
  const openCommandPalette = useCallback(() => setCommandOpen(true), []);
  const closeCommandPalette = useCallback(() => setCommandOpen(false), []);
  const sessionRef = useRef<MeetingSession | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const systemStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const systemSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioSinkRef = useRef<GainNode | null>(null);
  const micFlushIntervalRef = useRef<number | null>(null);
  const micFirstFlushTimeoutRef = useRef<number | null>(null);
  const pcmBufferRef = useRef<Float32Array[]>([]);
  const pcmBufferLengthRef = useRef(0);
  // Tail of the previously-sent chunk, prepended to the next chunk so
  // faster-whisper sees ~250ms of context across cut boundaries. Without it,
  // a word that lands on a flush boundary is split between two chunks and
  // mis-transcribed in both.
  const pcmOverlapRef = useRef<Float32Array | null>(null);
  const audioSampleRateRef = useRef(16000);
  const chunkIndexRef = useRef(0);
  const autoStartedSignalRef = useRef<string | null>(null);
  const noticeIdRef = useRef(0);
  const recoverableAsrWindowRef = useRef({ count: 0, startedAt: 0 });
  const transcriptionHealthTimeoutRef = useRef<number | null>(null);

  const showNotice = useCallback(
    (nextNotice: Omit<WorkspaceNotice, "id">) => {
      noticeIdRef.current += 1;
      setNotice({ id: noticeIdRef.current, ...nextNotice });
    },
    [],
  );

  const clearNotice = useCallback(() => setNotice(null), []);

  const clearTranscriptionHealth = useCallback(() => {
    if (transcriptionHealthTimeoutRef.current) {
      window.clearTimeout(transcriptionHealthTimeoutRef.current);
      transcriptionHealthTimeoutRef.current = null;
    }
    setTranscriptionHealth("ready");
  }, []);

  const markRecoverableTranscriptionIssue = useCallback(
    (event: RecoverableServerEvent) => {
      const now = Date.now();
      const issueWindowMs = 30_000;
      const current = recoverableAsrWindowRef.current;

      if (now - current.startedAt > issueWindowMs) {
        current.startedAt = now;
        current.count = 1;
      } else {
        current.count += 1;
      }

      console.warn("Recoverable transcription issue.", {
        code: event.code,
        message: event.message,
      });

      // A single skipped chunk is normal under load and should not alarm the
      // user. Only repeated recoverable issues become a compact live status.
      if (current.count < 2) return;

      setTranscriptionHealth("catching-up");
      if (transcriptionHealthTimeoutRef.current) {
        window.clearTimeout(transcriptionHealthTimeoutRef.current);
      }
      transcriptionHealthTimeoutRef.current = window.setTimeout(() => {
        setTranscriptionHealth("ready");
        transcriptionHealthTimeoutRef.current = null;
      }, 8000);
    },
    [],
  );

  useEffect(
    () => () => {
      if (transcriptionHealthTimeoutRef.current) {
        window.clearTimeout(transcriptionHealthTimeoutRef.current);
      }
    },
    [],
  );

  const loadActionInbox = useCallback(async () => {
    setActionInboxLoading(true);
    try {
      const response = await fetch("/api/actions", { cache: "no-store" });
      if (!response.ok) {
        setActionInbox(null);
        return;
      }
      setActionInbox((await response.json()) as MeetingActionInbox);
    } catch {
      setActionInbox(null);
    } finally {
      setActionInboxLoading(false);
    }
  }, []);

  const filteredSegments = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return segments;
    }

    return segments.filter((segment) =>
      `${segment.originalText} ${segment.translatedText} ${segment.normalizedText}`
        .toLowerCase()
        .includes(query),
    );
  }, [search, segments]);

  const detectedLanguages = useMemo(() => {
    const unique = new Set(segments.map((segment) => segment.detectedLanguage));
    return [...unique].map((code) => getLanguage(code));
  }, [segments]);

  const connectSocket = useCallback(
    async (meetingSession: MeetingSession) =>
      new Promise<WebSocket>((resolve, reject) => {
        const socket = new WebSocket(apiWsUrl);
        const timeout = window.setTimeout(() => {
          reject(new Error("Realtime connection timed out"));
        }, 6000);

        socket.onopen = () => {
          window.clearTimeout(timeout);
          socket.send(
            JSON.stringify({
              type: "start",
              sessionId: meetingSession.id,
              outputLanguage,
            }),
          );
          resolve(socket);
        };

        socket.onerror = () => {
          window.clearTimeout(timeout);
          reject(new Error("Realtime connection failed"));
        };

        socket.onmessage = (message) => {
          let event: ServerMeetingEvent;
          try {
            event = JSON.parse(message.data) as ServerMeetingEvent;
          } catch {
            console.warn("Ignored malformed realtime message from Mila API.");
            return;
          }

          if (event.type === "session") {
            setNotes(event.notes);
          }

          if (event.type === "transcript") {
            setSegments((current) =>
              current.some((segment) => segment.id === event.segment.id)
                ? current
                : [...current, event.segment],
            );
            setNotes(event.notes);
            clearTranscriptionHealth();
          }

          if (event.type === "notes") {
            setNotes(event.notes);
          }

          if (event.type === "status") {
            if (isRecoverableTranscriptionEvent(event)) {
              markRecoverableTranscriptionIssue(event);
            }
            return;
          }

          if (event.type === "error") {
            // ASR_TIMEOUT / ASR_ERROR are per-chunk hiccups — the session is
            // still recording on the server, so don't tear down the UI.
            if (isProtocolNoise(event)) {
              console.warn("Ignored malformed realtime event.", event);
              return;
            }

            const isRecoverable =
              isRecoverableTranscriptionEvent(event);
            if (isRecoverable) {
              markRecoverableTranscriptionIssue(event);
              return;
            }

            setError(formatFatalServerError(event));
            setStatus("error");
          }

          if (event.type === "assist-suggestion") {
            setAssistSuggestion(event.suggestion);
            setAssistUnavailable(null);
            setAssistPending(false);
            return;
          }

          if (event.type === "assist-unavailable") {
            setAssistUnavailable(event.reason);
            setAssistPending(false);
            return;
          }
        };

        socket.onclose = () => {
          wsRef.current = null;
          setStatus((current) => (current === "recording" ? "idle" : current));
        };
      }),
    [
      outputLanguage,
      apiWsUrl,
      clearTranscriptionHealth,
      markRecoverableTranscriptionIssue,
    ],
  );

  const requestAssist = useCallback((turns: AssistTurn[], manual: boolean) => {
    const socket = wsRef.current;
    const sessionId = sessionRef.current?.id;
    if (!socket || socket.readyState !== WebSocket.OPEN || !sessionId) {
      return;
    }
    // A manual ask clears the last suggestion and shows a spinner; auto ticks
    // stay quiet until something actually comes back.
    if (manual) {
      setAssistSuggestion(null);
      setAssistUnavailable(null);
      setAssistPending(true);
    }
    socket.send(
      JSON.stringify({ type: "assist-request", sessionId, turns, manual }),
    );
  }, []);

  const handleAssistEnabledChange = useCallback((next: boolean) => {
    setAssistEnabled(next);
    if (!next) {
      setAssistSuggestion(null);
      setAssistUnavailable(null);
      setAssistPending(false);
    }
  }, []);

  // Mirror the live coaching state into the desktop floating overlay so talking
  // points stay visible while the call app is focused over Mila. Inert in the
  // browser — the bridge only exists inside the Electron shell.
  useEffect(() => {
    const bridge = (window as Window & { mila?: AssistDesktopBridge }).mila;
    if (!bridge?.assist) return;
    bridge.assist.update({
      enabled: assistEnabled,
      live: status === "recording" || status === "connecting",
      pending: assistPending,
      suggestion: assistEnabled ? assistSuggestion : null,
      unavailable: assistEnabled ? assistUnavailable : null,
    });
  }, [assistEnabled, status, assistPending, assistSuggestion, assistUnavailable]);

  const resetPcmBuffer = useCallback(() => {
    pcmBufferRef.current = [];
    pcmBufferLengthRef.current = 0;
    pcmOverlapRef.current = null;
  }, []);

  const stopLocalCapture = useCallback(
    (clearBufferedAudio = true) => {
      if (micFlushIntervalRef.current !== null) {
        window.clearInterval(micFlushIntervalRef.current);
        micFlushIntervalRef.current = null;
      }

      if (micFirstFlushTimeoutRef.current !== null) {
        window.clearTimeout(micFirstFlushTimeoutRef.current);
        micFirstFlushTimeoutRef.current = null;
      }

      if (audioProcessorRef.current) {
        audioProcessorRef.current.onaudioprocess = null;
        audioProcessorRef.current.disconnect();
        audioProcessorRef.current = null;
      }

      audioSourceRef.current?.disconnect();
      audioSourceRef.current = null;

      systemSourceRef.current?.disconnect();
      systemSourceRef.current = null;

      audioSinkRef.current?.disconnect();
      audioSinkRef.current = null;

      const audioContext = audioContextRef.current;
      audioContextRef.current = null;

      if (audioContext && audioContext.state !== "closed") {
        void audioContext.close();
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;

      systemStreamRef.current?.getTracks().forEach((track) => track.stop());
      systemStreamRef.current = null;

      if (clearBufferedAudio) {
        resetPcmBuffer();
      }
    },
    [resetPcmBuffer],
  );

  const flushMicrophoneChunk = useCallback(
    (
      meetingSession: MeetingSession,
      socket: WebSocket,
      options: { force?: boolean } = {},
    ) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return false;
      }

      const totalLength = pcmBufferLengthRef.current;

      if (!totalLength) {
        return false;
      }

      const rawPcm = mergePcmChunks(pcmBufferRef.current, totalLength);
      pcmBufferRef.current = [];
      pcmBufferLengthRef.current = 0;

      if (!options.force && rawPcm.length < audioSampleRateRef.current) {
        pcmBufferRef.current = [rawPcm];
        pcmBufferLengthRef.current = rawPcm.length;
        return false;
      }

      if (!options.force && calculateRms(rawPcm) < 0.003) {
        // Drop overlap on silence so the next speech chunk doesn't begin
        // with stale audio from before the pause.
        pcmOverlapRef.current = null;
        return false;
      }

      const overlap = pcmOverlapRef.current;
      let payloadPcm: Float32Array;
      if (overlap && overlap.length > 0) {
        payloadPcm = new Float32Array(overlap.length + rawPcm.length);
        payloadPcm.set(overlap, 0);
        payloadPcm.set(rawPcm, overlap.length);
      } else {
        payloadPcm = rawPcm;
      }

      const overlapSamples = Math.min(
        rawPcm.length,
        Math.round(audioSampleRateRef.current * 0.25),
      );
      pcmOverlapRef.current = rawPcm.slice(rawPcm.length - overlapSamples);

      const wavBytes = encodeWav(
        downsamplePcm(payloadPcm, audioSampleRateRef.current, 16000),
        16000,
      );

      socket.send(
        JSON.stringify({
          type: "audio-chunk",
          sessionId: meetingSession.id,
          mimeType: "audio/wav",
          chunkId: `${meetingSession.id}-mic-${chunkIndexRef.current++}`,
          capturedAt: new Date().toISOString(),
          audioBase64: uint8ArrayToBase64(wavBytes),
        }),
      );

      return true;
    },
    [],
  );

  const buildAuthHeaders = useCallback(
    (extras: Record<string, string> = {}) => {
      const headers: Record<string, string> = { ...extras };
      if (apiHttpUrl) headers["authorization"] = `Bearer ${token}`;
      return headers;
    },
    [apiHttpUrl, token],
  );

  const fetchCapabilities =
    useCallback(async (): Promise<AppCapabilities | null> => {
      try {
        const response = await fetch(`${apiHttpUrl}/api/capabilities`, {
          cache: "no-store",
          headers: buildAuthHeaders(),
        });

        if (!response.ok) {
          return null;
        }

        const next = (await response.json()) as AppCapabilities;
        setCapabilities(next);
        return next;
      } catch {
        // Keep conservative defaults when the API is unavailable.
        return null;
      }
    }, [apiHttpUrl, buildAuthHeaders]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const completeSessionViaHttp = useCallback(
    (sessionId: string, keepalive = false) => {
      void fetch(`${apiHttpUrl}/api/sessions/${sessionId}/complete`, {
        method: "POST",
        headers: buildAuthHeaders(),
        keepalive,
      }).catch(() => {
        // Best-effort cleanup. The WebSocket stop path is still the primary
        // path while the app is open.
      });
    },
    [apiHttpUrl, buildAuthHeaders],
  );

  const createSession = useCallback(
    async (request: Partial<CreateMeetingRequest> = {}) => {
      const response = await fetch(`${apiHttpUrl}/api/sessions`, {
        method: "POST",
        headers: buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          title: request.title ?? pendingTitle ?? "Live multilingual meeting",
          outputLanguage,
          source: request.source ?? "manual",
          autoStarted: request.autoStarted ?? false,
          externalMeeting: request.externalMeeting,
          templateId: request.templateId ?? templateId,
        }),
      });

      if (!response.ok) {
        throw new Error(
          await readApiError(response, "Could not create meeting session"),
        );
      }

      return (await response.json()) as CreateMeetingResponse;
    },
    [apiHttpUrl, buildAuthHeaders, outputLanguage, pendingTitle, templateId],
  );

  const openLiveSession = useCallback(
    async (options: StartLiveSessionOptions = {}) => {
      setError(null);
      clearNotice();
      clearTranscriptionHealth();
      setStatus("connecting");
      setSegments([]);
      chunkIndexRef.current = 0;

      stopLocalCapture();
      wsRef.current?.close();

      const created = await createSession({
        title:
          options.title ??
          options.externalMeeting?.title ??
          "Live multilingual meeting",
        source: options.source ?? "manual",
        autoStarted: options.autoStarted ?? false,
        externalMeeting: options.externalMeeting,
        templateId: options.templateId,
      });
      setSession(created.session);
      setNotes(created.notes);

      const socket = await connectSocket(created.session);
      wsRef.current = socket;

      return { created, socket };
    },
    [
      clearNotice,
      clearTranscriptionHealth,
      connectSocket,
      createSession,
      stopLocalCapture,
    ],
  );

  const openExistingSession = useCallback(
    async (sessionId: string) => {
      setError(null);
      clearNotice();
      setStatus("connecting");

      stopLocalCapture();
      wsRef.current?.close();

      const response = await fetch(`${apiHttpUrl}/api/sessions/${sessionId}`, {
        cache: "no-store",
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            "Could not open the detected meeting session",
          ),
        );
      }

      const detail = (await response.json()) as MeetingSessionDetail;
      setSession(detail.session);
      setSegments(detail.segments);
      setNotes(detail.notes);

      const socket = await connectSocket(detail.session);
      wsRef.current = socket;
      setStatus("recording");

      return detail;
    },
    [apiHttpUrl, buildAuthHeaders, clearNotice, connectSocket, stopLocalCapture],
  );

  const sendMockChunk = useCallback(
    (meetingSession: MeetingSession, socket = wsRef.current) => {
      if (socket?.readyState !== WebSocket.OPEN) {
        return;
      }

      socket.send(
        JSON.stringify({
          type: "audio-chunk",
          sessionId: meetingSession.id,
          mimeType: "audio/mock",
          chunkId: `${meetingSession.id}-sim-${chunkIndexRef.current++}`,
          capturedAt: new Date().toISOString(),
        }),
      );
    },
    [],
  );

  // Acquire the desktop system-audio loopback feed (the remote participants), or
  // null when unavailable so capture degrades to mic-only. The Electron shell
  // answers getDisplayMedia with a loopback audio track; keep only that track and
  // never hold the screen-video track it may also hand back.
  const acquireSystemAudioStream =
    useCallback(async (): Promise<MediaStream | null> => {
      try {
        const bridge = (window as Window & { mila?: CaptureDesktopBridge }).mila;
        const supported = await bridge?.loopback?.isSupported?.();
        if (!supported) return null;
        if (!navigator.mediaDevices?.getDisplayMedia) return null;
        const display = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        display.getVideoTracks().forEach((track) => track.stop());
        if (display.getAudioTracks().length === 0) {
          display.getTracks().forEach((track) => track.stop());
          return null;
        }
        return display;
      } catch {
        return null;
      }
    }, []);

  const attachMicrophone = useCallback(
    async (meetingSession: MeetingSession, socket: WebSocket) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMicPermission("unsupported");
        throw new Error("Microphone capture is not available in this browser");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermission("granted");
      streamRef.current = stream;
      resetPcmBuffer();

      const AudioContextConstructor = getAudioContextConstructor();

      if (!AudioContextConstructor) {
        throw new Error("Web Audio microphone streaming is not available");
      }

      // Best-effort system-audio loopback so the transcript hears the other
      // participants (who arrive through the speakers), not just this mic. Null
      // off the desktop shell, when unsupported, or when the OS screen-recording
      // grant is missing — capture then stays mic-only instead of failing.
      const systemStream = await acquireSystemAudioStream();
      systemStreamRef.current = systemStream;

      const audioContext = new AudioContextConstructor();
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      const micSource = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const sink = audioContext.createGain();
      sink.gain.value = 0;

      audioContextRef.current = audioContext;
      audioSampleRateRef.current = audioContext.sampleRate;
      audioSourceRef.current = micSource;
      audioProcessorRef.current = processor;
      audioSinkRef.current = sink;

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const chunk = new Float32Array(input.length);
        chunk.set(input);
        pcmBufferRef.current.push(chunk);
        pcmBufferLengthRef.current += chunk.length;
      };

      // Fan both feeds into the one processor — Web Audio sums them, so a single
      // mono PCM stream carries mic + system audio downstream to the ASR worker.
      micSource.connect(processor);
      if (systemStream) {
        const systemSource = audioContext.createMediaStreamSource(systemStream);
        systemSourceRef.current = systemSource;
        systemSource.connect(processor);
      }
      processor.connect(sink);
      sink.connect(audioContext.destination);

      micFirstFlushTimeoutRef.current = window.setTimeout(() => {
        micFirstFlushTimeoutRef.current = null;
        flushMicrophoneChunk(meetingSession, socket);
      }, 2000);
      micFlushIntervalRef.current = window.setInterval(() => {
        flushMicrophoneChunk(meetingSession, socket);
      }, 5000);
      setStatus("recording");
    },
    [acquireSystemAudioStream, flushMicrophoneChunk, resetPcmBuffer],
  );

  const startRecording = useCallback(async () => {
    try {
      if (!capabilities.supportsRealAudio) {
        setError(
          "Real microphone transcription is not configured yet. Use Simulate for the demo, or connect faster-whisper/whisper.cpp before testing real meetings.",
        );
        return;
      }

      const { created, socket } = await openLiveSession({ source: "manual" });
      await attachMicrophone(created.session, socket);
    } catch (startError) {
      const captureError = describeCaptureError(startError);
      setMicPermission((current) =>
        captureError.permissionDenied ? "denied" : current,
      );
      setError(captureError.message);
      setStatus("error");
    }
  }, [attachMicrophone, capabilities.supportsRealAudio, openLiveSession]);

  const uploadAudio = async (file: File | null) => {
    if (!file) {
      return;
    }

    if (!capabilities.supportsRealAudio) {
      setError(
        `${file.name} was selected, but real audio transcription is not configured. The current ASR provider is "${capabilities.asrProvider}", so Mila will not fake an .ogg transcript.`,
      );
      return;
    }

    try {
      const { created, socket } = await openLiveSession({
        title: file.name,
        source: "upload",
      });
      socket.send(
        JSON.stringify({
          type: "audio-chunk",
          sessionId: created.session.id,
          mimeType: file.type || "application/octet-stream",
          chunkId: `${created.session.id}-upload-0`,
          capturedAt: new Date().toISOString(),
          audioBase64: await blobToBase64(file),
        }),
      );
      setStatus("processing");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Audio upload failed",
      );
      setStatus("error");
    }
  };

  const explainUploadUnavailable = () => {
    setError(
      `Audio upload needs a real ASR worker. Current provider is "${capabilities.asrProvider}", so Mila will not fake a transcript for uploaded audio.`,
    );
  };

  const simulateChunk = async () => {
    try {
      setError(null);
      clearNotice();
      let activeSession = session;

      if (!activeSession || wsRef.current?.readyState !== WebSocket.OPEN) {
        const { created, socket } = await openLiveSession({
          title: "Simulated multilingual meeting",
          source: "mock",
        });
        activeSession = created.session;
        setStatus("recording");
        sendMockChunk(activeSession, socket);
        return;
      }

      sendMockChunk(activeSession);
    } catch (simulateError) {
      setError(
        simulateError instanceof Error
          ? simulateError.message
          : "Simulation failed",
      );
      setStatus("error");
    }
  };

  const startBriefCapture = useCallback(
    async (brief: MeetingBrief) => {
      const { meeting } = brief;
      const source: MeetingSource =
        meeting.id === "adhoc" ? "manual" : "auto-calendar";
      const externalMeeting: ExternalMeetingContext = {
        provider: meeting.provider ?? detectMeetingProvider(meeting.meetingUrl),
        title: meeting.title,
        url: meeting.meetingUrl,
        detectedAt: new Date().toISOString(),
        source,
      };

      try {
        setTemplateId(brief.suggestedTemplateId);
        setPendingTitle(meeting.title);
        const { created, socket } = await openLiveSession({
          title: meeting.title,
          source,
          autoStarted: source === "auto-calendar",
          externalMeeting,
          templateId: brief.suggestedTemplateId,
        });

        if (!capabilities.supportsRealAudio) {
          setStatus("idle");
          showNotice({
            tone: "info",
            title: "Brief session ready",
            message:
              "Mila created the session from your brief. Connect the ASR worker to stream real microphone audio.",
          });
          return;
        }

        await attachMicrophone(created.session, socket);
      } catch (briefError) {
        const captureError = describeCaptureError(briefError);
        setMicPermission((current) =>
          captureError.permissionDenied ? "denied" : current,
        );
        setError(captureError.message);
        setStatus("error");
      }
    },
    [
      attachMicrophone,
      capabilities.supportsRealAudio,
      openLiveSession,
      showNotice,
    ],
  );

  const toggleAutoStart = () => {
    const nextEnabled = !autoStartEnabled;
    setAutoStartEnabled(nextEnabled);
    setAutoStartStatus(nextEnabled ? "watching" : "off");
  };

  const triggerDemoMeetingSignal = () => {
    setAutoStartSignal({
      title: "Google Meet: Product sync",
      meetingUrl: "https://meet.google.com/mila-demo",
      provider: "google-meet",
      source: "auto-browser",
      detectedAt: new Date().toISOString(),
      captureAudio: false,
      mockAudio: true,
    });
  };

  const startAutoDetectedSession = useCallback(
    async (signal: AutoStartSignal) => {
      const signalKey = getSignalKey(signal);

      if (autoStartedSignalRef.current === signalKey) {
        return;
      }

      autoStartedSignalRef.current = signalKey;
      clearStoredAutoStartSignal();
      setAutoStartSignal(signal);

      try {
        setAutoStartStatus("starting");
        const externalMeeting = toExternalMeetingContext(signal);
        const { created, socket } = await openLiveSession({
          title: signal.title ?? "Auto-detected meeting",
          source: signal.source,
          autoStarted: true,
          externalMeeting,
        });

        if (signal.mockAudio) {
          setStatus("recording");
          sendMockChunk(created.session, socket);
        } else if (!signal.captureAudio) {
          setStatus("recording");
        } else {
          // Capabilities load asynchronously, but an auto-start signal can fire
          // before that fetch resolves — leaving this closure with the conservative
          // mock default. Confirm against a fresh fetch before declaring real audio
          // unavailable, so a slow capabilities load can't raise a false
          // "not configured" error (which never retries, the signal is latched).
          const realAudioReady =
            capabilities.supportsRealAudio ||
            (await fetchCapabilities())?.supportsRealAudio === true;

          if (!realAudioReady) {
            throw new Error(
              "Auto-start detected a meeting, but real audio transcription is not configured yet.",
            );
          }

          await attachMicrophone(created.session, socket);
        }

        replaceAutoStartUrlWithSession(created.session.id);
        setAutoStartStatus("detected");
      } catch (autoStartError) {
        const captureError = describeCaptureError(autoStartError);
        setAutoStartStatus("blocked");
        setStatus("error");
        setMicPermission((current) =>
          captureError.permissionDenied ? "denied" : current,
        );
        setError(captureError.message);
      }
    },
    [
      attachMicrophone,
      capabilities.supportsRealAudio,
      fetchCapabilities,
      openLiveSession,
      sendMockChunk,
    ],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadActionInbox();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadActionInbox]);

  useEffect(() => {
    if (!autoStartEnabled) {
      return;
    }

    const captureSignal = (signal: AutoStartSignal | null) => {
      if (signal) {
        setAutoStartSignal(signal);
      }
    };

    captureSignal(getUrlAutoStartSignal());
    captureSignal(getStoredAutoStartSignal());

    const onMessage = (event: MessageEvent<unknown>) => {
      captureSignal(normalizeAutoStartSignal(event.data, "auto-browser"));
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === "mila:meeting-signal") {
        captureSignal(parseStoredAutoStartSignal(event.newValue));
      }
    };

    const interval = window.setInterval(() => {
      captureSignal(getStoredAutoStartSignal());
    }, 3000);

    window.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
    };
  }, [autoStartEnabled]);

  useEffect(() => {
    if (!autoStartEnabled || !autoStartSignal || status !== "idle") {
      return;
    }

    if (getUrlSessionId()) {
      queueMicrotask(() => setAutoStartStatus("detected"));
      return;
    }

    queueMicrotask(() => {
      void startAutoDetectedSession(autoStartSignal);
    });
  }, [autoStartEnabled, autoStartSignal, startAutoDetectedSession, status]);

  useEffect(() => {
    void (async () => {
      await fetchCapabilities();
    })();
  }, [fetchCapabilities]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const nextPermission = await queryMicrophonePermission();

      if (!cancelled) {
        setMicPermission(nextPermission);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sessionId = getUrlSessionId();

    if (!sessionId || autoStartedSignalRef.current === `session:${sessionId}`) {
      return;
    }

    autoStartedSignalRef.current = `session:${sessionId}`;

    void (async () => {
      try {
        await openExistingSession(sessionId);
        setAutoStartStatus("detected");
      } catch (loadError) {
        setStatus("error");
        setAutoStartStatus("blocked");
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not connect to the detected meeting session",
        );
      }
    })();
  }, [openExistingSession]);

  const stopRecording = useCallback(
    (options: { keepalive?: boolean; updateState?: boolean } = {}) => {
      const { keepalive = false, updateState = true } = options;
      const activeSession = sessionRef.current;
      const socket = wsRef.current;

      wsRef.current = null;
      stopLocalCapture(false);

      let sentStopOverSocket = false;

      if (activeSession && socket?.readyState === WebSocket.OPEN) {
        flushMicrophoneChunk(activeSession, socket, { force: true });
        socket.send(
          JSON.stringify({ type: "stop", sessionId: activeSession.id }),
        );
        socket.close();
        sentStopOverSocket = true;
      }

      if (activeSession && (!sentStopOverSocket || keepalive)) {
        completeSessionViaHttp(activeSession.id, keepalive);
      }

      resetPcmBuffer();
      if (updateState) setStatus("idle");
    },
    [
      completeSessionViaHttp,
      flushMicrophoneChunk,
      resetPcmBuffer,
      stopLocalCapture,
    ],
  );

  const resetWorkspaceForNewMeeting = useCallback(() => {
    stopRecording({ keepalive: true });
    setSession(null);
    setSegments([]);
    setNotes(createEmptyNotes(outputLanguage));
    setPendingTitle(null);
    setError(null);
    clearNotice();
    clearTranscriptionHealth();
    setStatus("idle");
  }, [
    clearNotice,
    clearTranscriptionHealth,
    outputLanguage,
    stopRecording,
  ]);

  const startDesktopCapture = useCallback(() => {
    const pendingSignal = getStoredAutoStartSignal();
    const canStart = status === "idle" || status === "error";

    if (pendingSignal && canStart) {
      void startAutoDetectedSession(pendingSignal);
      return;
    }

    if (canStart) {
      void startRecording();
    }
  }, [startAutoDetectedSession, startRecording, status]);

  const consumeDesktopCommand = useCallback(
    (command: DesktopWorkspaceCommand) => {
      if (command === "mila:desktop-new-meeting") {
        resetWorkspaceForNewMeeting();
        return;
      }

      if (command === "mila:desktop-start-mic") {
        startDesktopCapture();
        return;
      }

      stopRecording();
    },
    [resetWorkspaceForNewMeeting, startDesktopCapture, stopRecording],
  );

  useEffect(() => {
    const onNewMeeting = () => consumeDesktopCommand("mila:desktop-new-meeting");
    const onStartMic = () => consumeDesktopCommand("mila:desktop-start-mic");
    const onStopMic = () => consumeDesktopCommand("mila:desktop-stop-mic");

    window.addEventListener("mila:desktop-new-meeting", onNewMeeting);
    window.addEventListener("mila:desktop-start-mic", onStartMic);
    window.addEventListener("mila:desktop-stop-mic", onStopMic);

    const pendingCommand = takePendingWorkspaceCommand();
    if (pendingCommand) {
      queueMicrotask(() => consumeDesktopCommand(pendingCommand));
    }

    return () => {
      window.removeEventListener("mila:desktop-new-meeting", onNewMeeting);
      window.removeEventListener("mila:desktop-start-mic", onStartMic);
      window.removeEventListener("mila:desktop-stop-mic", onStopMic);
    };
  }, [consumeDesktopCommand]);

  useEffect(() => {
    const finishActiveCapture = () => {
      stopRecording({ keepalive: true, updateState: false });
    };

    window.addEventListener("pagehide", finishActiveCapture);
    window.addEventListener("beforeunload", finishActiveCapture);

    return () => {
      window.removeEventListener("pagehide", finishActiveCapture);
      window.removeEventListener("beforeunload", finishActiveCapture);
      finishActiveCapture();
    };
  }, [stopRecording]);

  const copyMarkdown = async () => {
    const didCopy = await copyTextToClipboard(toMarkdown(notes));
    if (!didCopy) {
      showNotice({
        tone: "warning",
        title: "Copy unavailable",
        message:
          "Your browser blocked clipboard access. Use the Markdown download instead.",
      });
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const downloadMarkdown = () => {
    const filename = `${slugifyForFilename(session?.title ?? pendingTitle ?? "mila-notes")}.md`;
    const blob = new Blob([toMarkdown(notes)], {
      type: "text/markdown;charset=utf-8",
    });
    triggerBlobDownload(blob, filename);
  };

  const downloadPdf = () => {
    const title = session?.title ?? pendingTitle ?? "Mila Notes";
    const didOpen = openPrintWindow(title, toMarkdown(notes));
    if (!didOpen) {
      showNotice({
        tone: "warning",
        title: "PDF export blocked",
        message:
          "Your browser blocked the print window. Allow pop-ups for Mila and try again.",
      });
    }
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((current) => !current);
      } else if (event.key === "Escape") {
        setCommandOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <main className="mila-app-bg min-h-screen lg:fixed lg:inset-0 lg:h-screen lg:overflow-hidden">
      <div className="grid min-h-screen grid-cols-1 lg:h-screen lg:min-h-0 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="mila-sidebar border-b px-5 pb-5 pt-[calc(1.25rem+var(--mila-window-top-offset))] lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <BrandLogo />
          <AccountCard user={user} />
          <WorkspaceNav className="mt-5" />
          <div className="mt-6 space-y-5">
            <MeetingBriefCard
              disabled={
                Boolean(session) ||
                status === "connecting" ||
                status === "recording" ||
                status === "processing"
              }
              onStartCapture={startBriefCapture}
            />

            <ActionInboxCard
              inbox={actionInbox}
              loading={actionInboxLoading}
              onRefresh={loadActionInbox}
            />

            <TemplatePicker
              value={templateId}
              disabled={Boolean(session)}
              onChange={(nextId, template) => {
                setTemplateId(nextId);
                if (!session) setPendingTitle(template.defaultTitle);
              }}
            />

            <div>
              <label className="mila-eyebrow">
                Output
              </label>
              <select
                value={outputLanguage}
                onChange={(event) =>
                  setOutputLanguage(event.target.value as SupportedLanguageCode)
                }
                className="mila-focus mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--foreground)] outline-none"
              >
                {supportedLanguages
                  .filter(
                    (language) =>
                      language.code !== "unknown" && language.code !== "mixed",
                  )
                  .map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.label}
                    </option>
                  ))}
              </select>
            </div>

            <div className="rounded-lg border border-[var(--accent-border)] bg-[var(--accent-faint)] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                    Capture
                  </div>
                  <p className="mila-muted mt-1 text-xs leading-5">
                    Start a real meeting, run a demo chunk, or upload audio.
                  </p>
                </div>
                <span className={statusBadgeClass(status)}>
                  {formatSessionStatus(status)}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={startRecording}
                  className={primaryButtonClass}
                  data-testid="start-mic"
                >
                  <Mic size={17} />
                  Start live capture
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => stopRecording()}
                    className={secondaryButtonClass}
                  >
                    <Square size={16} />
                    Stop
                  </button>
                  <button
                    type="button"
                    onClick={simulateChunk}
                    className={secondaryButtonClass}
                  >
                    <Play size={16} />
                    Demo
                  </button>
                </div>
                {capabilities.supportsRealAudio ? (
                  <label className={secondaryLabelClass}>
                    <Upload size={16} />
                    Upload audio
                    <input
                      type="file"
                      accept="audio/*,.ogg"
                      className="sr-only"
                      onChange={(event) => {
                        void uploadAudio(event.target.files?.[0] ?? null);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                ) : (
                  <button
                    type="button"
                    onClick={explainUploadUnavailable}
                    className={secondaryButtonClass}
                    data-testid="upload-unavailable"
                  >
                    <Upload size={16} />
                    Upload audio
                  </button>
                )}
              </div>
            </div>

            <div className="mila-surface-soft rounded-lg border p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="mila-muted">Session</span>
                <span className="inline-flex items-center gap-2 text-[var(--accent)]">
                  <Radio size={14} />
                  {formatSessionStatus(status)}
                </span>
              </div>
              <div className="mila-muted mt-3 min-h-11 rounded-lg bg-black/20 px-3 py-2 font-mono text-xs">
                {session?.id ?? "No active session"}
              </div>
            </div>

            <div
              className={
                capabilities.supportsRealAudio
                  ? "rounded-lg border border-[var(--accent-border)] bg-[var(--accent-faint)] p-3 text-xs leading-5 text-[var(--foreground)]"
                  : "rounded-lg border border-[rgba(255,155,124,0.25)] bg-[var(--warm-faint)] p-3 text-xs leading-5 text-[var(--foreground)]"
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={
                    capabilities.supportsRealAudio
                      ? "font-semibold text-[var(--foreground)]"
                      : "font-semibold text-[var(--foreground)]"
                  }
                >
                  ASR provider
                </span>
                <span className="rounded bg-black/20 px-2 py-0.5 font-mono">
                  {capabilities.asrProvider}
                </span>
              </div>
              <p
                className={
                  capabilities.supportsRealAudio
                    ? "mila-muted mt-2"
                    : "mila-muted mt-2"
                }
              >
                {capabilities.supportsRealAudio
                  ? "Real audio transcription is ready."
                  : capabilities.realAudioHint ??
                    "Demo mode only. Real mic, upload, Zoom, Meet, and calls need a real ASR worker."}
              </p>
            </div>

            <div className="mila-surface-soft rounded-lg border p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="mila-muted inline-flex items-center gap-2">
                  <Radar size={15} />
                  Auto-start
                </span>
                <button
                  type="button"
                  aria-pressed={autoStartEnabled}
                  onClick={toggleAutoStart}
                  className="text-[var(--accent)] transition hover:text-[var(--foreground)]"
                  title={
                    autoStartEnabled
                      ? "Disable auto-start"
                      : "Enable auto-start"
                  }
                >
                  {autoStartEnabled ? (
                    <ToggleRight size={28} />
                  ) : (
                    <ToggleLeft size={28} />
                  )}
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 rounded bg-black/20 px-3 py-2 text-xs">
                <span className="mila-muted font-medium">
                  {formatAutoStartStatus(autoStartStatus)}
                </span>
                <span className="mila-chip rounded px-2 py-0.5">
                  {autoStartSignal
                    ? formatProvider(autoStartSignal.provider)
                    : "No signal"}
                </span>
              </div>
              {autoStartSignal && (
                <div className="mila-muted mt-2 truncate rounded-lg bg-black/20 px-3 py-2 text-xs">
                  {autoStartSignal.title ??
                    autoStartSignal.meetingUrl ??
                    "Detected meeting"}
                </div>
              )}
              <button
                type="button"
                onClick={triggerDemoMeetingSignal}
                className="mila-secondary mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition"
              >
                <Radar size={15} />
                Detect join
              </button>
            </div>

            <CaptureDiagnosticsCard
              autoStartSignal={autoStartSignal}
              autoStartStatus={autoStartStatus}
              capabilities={capabilities}
              error={error}
              micPermission={micPermission}
              segmentCount={segments.length}
              status={status}
            />

            <div>
              <label className="mila-eyebrow">
                Transcript
              </label>
              <div className="mt-2 grid grid-cols-2 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-1">
                <button
                  type="button"
                  onClick={() => setMode("translated")}
                  className={
                    mode === "translated" ? activeSegmentClass : segmentClass
                  }
                >
                  Translated
                </button>
                <button
                  type="button"
                  onClick={() => setMode("original")}
                  className={
                    mode === "original" ? activeSegmentClass : segmentClass
                  }
                >
                  Original
                </button>
              </div>
            </div>

          </div>
        </aside>

        <section className="mila-content-bg flex min-w-0 flex-col lg:h-full lg:min-h-0 lg:overflow-hidden">
          <header className="flex flex-col gap-4 border-b border-[var(--border)] bg-[rgba(17,18,20,0.92)] px-5 py-4 backdrop-blur md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mila-muted flex flex-wrap items-center gap-2 text-sm">
                <Languages size={16} />
                {detectedLanguages.length ? (
                  detectedLanguages.map((language) => (
                    <span
                      key={language.code}
                      className="mila-chip rounded px-2 py-1 text-xs"
                    >
                      {language.nativeLabel}
                    </span>
                  ))
                ) : (
                  <span>Waiting</span>
                )}
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-normal text-white">
                {session?.title ?? pendingTitle ?? "Live multilingual meeting"}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="mila-focus flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-white/[0.035] px-3">
                <Search size={16} className="text-[var(--muted-soft)]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search transcript"
                  className="w-40 bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-soft)]"
                />
              </div>
              <button
                type="button"
                onClick={openCommandPalette}
                className="mila-secondary hidden h-10 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition md:inline-flex"
                title="Command palette"
              >
                <Command size={13} />
                <span>K</span>
              </button>
              <ShareSessionButton
                sessionId={session?.id ?? null}
                initialShareToken={session?.shareToken ?? null}
                token={token}
                className={pillButtonClass}
              />
              <button
                type="button"
                onClick={copyMarkdown}
                className={pillButtonClass}
                title="Copy meeting notes as Markdown"
              >
                <Clipboard size={15} />
                <span>{copied ? "Copied!" : "Copy"}</span>
              </button>
              <button
                type="button"
                onClick={downloadMarkdown}
                className={pillButtonClass}
                title="Export Markdown"
              >
                <FileAudio size={15} />
                <span>Markdown</span>
              </button>
              <button
                type="button"
                onClick={downloadPdf}
                className={pillButtonClass}
                title="Export PDF"
              >
                <FileDown size={15} />
                <span>PDF</span>
              </button>
            </div>
          </header>

          {error ? (
            <WorkspaceAlert
              tone="error"
              title="Mila needs your attention"
              message={error}
              onDismiss={() => setError(null)}
            />
          ) : notice ? (
            <WorkspaceAlert
              key={notice.id}
              tone={notice.tone}
              title={notice.title}
              message={notice.message}
              onDismiss={clearNotice}
            />
          ) : null}

          <LiveAssistPanel
            enabled={assistEnabled}
            onEnabledChange={handleAssistEnabledChange}
            segments={segments}
            isLive={status === "recording" || status === "connecting"}
            pending={assistPending}
            suggestion={assistSuggestion}
            unavailableReason={assistUnavailable}
            onRequest={requestAssist}
          />

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
            <TranscriptPanel
              segments={filteredSegments}
              mode={mode}
              isLive={status === "recording" || status === "connecting"}
              transcriptionHealth={transcriptionHealth}
            />
            <NotesPanel
              notes={notes}
              segments={segments}
              isLive={status === "recording" || status === "connecting"}
            />
          </div>
        </section>
      </div>
      <CommandPalette
        open={commandOpen}
        onOpenChange={(next) => setCommandOpen(next)}
        onClose={closeCommandPalette}
      />
    </main>
  );
}

function WorkspaceAlert({
  tone,
  title,
  message,
  onDismiss,
}: {
  tone: NoticeTone;
  title: string;
  message: string;
  onDismiss: () => void;
}) {
  const Icon =
    tone === "error" ? AlertCircle : tone === "warning" ? Info : CheckCircle2;
  const toneClass =
    tone === "error"
      ? "border-red-400/25 bg-red-500/[0.08] text-red-100"
      : tone === "warning"
      ? "border-[rgba(255,155,124,0.25)] bg-[var(--warm-faint)] text-[var(--foreground)]"
      : "border-[var(--accent-border)] bg-[var(--accent-faint)] text-[var(--foreground)]";
  const iconClass =
    tone === "error"
      ? "text-red-200"
      : tone === "warning"
        ? "text-[var(--warm)]"
        : "text-[var(--accent)]";

  return (
    <div className={`border-b px-5 py-3 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <Icon size={17} className={`mt-0.5 shrink-0 ${iconClass}`} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-0.5 text-sm leading-5 opacity-85">{message}</div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md opacity-70 transition hover:bg-white/10 hover:opacity-100"
          aria-label="Dismiss message"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

function ActionInboxCard({
  inbox,
  loading,
  onRefresh,
}: {
  inbox: MeetingActionInbox | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const items = inbox?.items.slice(0, 3) ?? [];
  const openCount = inbox?.totalOpen ?? 0;

  return (
    <div className="mila-surface-soft rounded-lg border p-3 text-xs leading-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 font-semibold text-[var(--foreground)]">
            <ListTodo size={15} className="text-[var(--accent)]" />
            Action inbox
          </div>
          <div className="mila-muted mt-1">
            {loading
              ? "Syncing follow-ups"
              : inbox?.headline ?? "Follow-ups unavailable"}
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent)] disabled:opacity-50"
          disabled={loading}
          title="Refresh action inbox"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <ActionInboxMetric label="Open" value={openCount} />
        <ActionInboxMetric label="Owner" value={inbox?.missingOwner ?? 0} />
        <ActionInboxMetric label="Due" value={inbox?.missingDue ?? 0} />
      </div>

      {items.length > 0 ? (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <a
              key={`${item.sessionId}:${item.id}`}
              href={`/app?sessionId=${encodeURIComponent(item.sessionId)}`}
              className="block rounded-lg border border-[var(--border)] bg-black/15 p-2 transition hover:border-[var(--accent-border)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="line-clamp-2 font-medium text-[var(--foreground)]">
                    {item.text}
                  </div>
                  <div className="mila-muted mt-1 truncate">
                    {item.sessionTitle}
                  </div>
                </div>
                <ArrowUpRight
                  size={13}
                  className="mt-0.5 shrink-0 text-[var(--accent)]"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={actionInboxPillClass(item.missingOwner)}>
                  {item.ownerLabel}
                </span>
                <span
                  className={actionInboxPillClass(
                    item.missingDue || item.overdue,
                  )}
                >
                  {item.dueLabel}
                </span>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="mila-muted mt-3 rounded-lg border border-dashed border-[var(--border)] px-3 py-4 text-center">
          {loading ? "Loading..." : "No open actions"}
        </div>
      )}
    </div>
  );
}

function ActionInboxMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-black/15 px-2 py-1.5">
      <div className="text-sm font-semibold text-[var(--foreground)]">
        {value}
      </div>
      <div className="mila-muted text-[10px] uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}

function actionInboxPillClass(warning: boolean) {
  return warning
    ? "rounded bg-[var(--warm-faint)] px-2 py-0.5 text-[10px] font-medium text-[var(--warm)]"
    : "mila-chip rounded px-2 py-0.5 text-[10px] font-medium";
}

function CaptureDiagnosticsCard({
  autoStartSignal,
  autoStartStatus,
  capabilities,
  error,
  micPermission,
  segmentCount,
  status,
}: {
  autoStartSignal: AutoStartSignal | null;
  autoStartStatus: AutoStartStatus;
  capabilities: AppCapabilities;
  error: string | null;
  micPermission: MicPermissionState;
  segmentCount: number;
  status: SessionStatus;
}) {
  const provider = autoStartSignal?.provider;
  const isMeet = provider === "google-meet";
  const checks = buildCaptureHealth({
    autoStartStatus,
    capabilities,
    error,
    micPermission,
    segmentCount,
    status,
  });

  return (
    <div className="mila-surface-soft rounded-lg border p-3 text-xs leading-5 text-[var(--foreground)]">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-semibold text-[var(--foreground)]">
          <Captions size={15} />
          Capture health
        </span>
        <span className={captureHealthBadgeClass(checks.tone)}>
          {checks.label}
        </span>
      </div>
      <p className="mila-muted mt-2">
        {isMeet
          ? "Google Meet detection can start a session automatically. Keep captions or microphone access enabled for live capture."
          : "Mila can capture this app's microphone directly. Desktop meeting detection starts sessions when a supported call is active."}
      </p>
      <div className="mt-3 space-y-1.5">
        {checks.items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-2 rounded-md bg-black/15 px-2 py-1.5"
          >
            <span className="mila-muted">{item.label}</span>
            <span className={captureCheckClass(item.tone)}>{item.value}</span>
          </div>
        ))}
      </div>
      {capabilities.supportsRealAudio && micPermission === "denied" && (
        <div className="mt-2 flex gap-2 rounded border border-red-300/20 bg-red-400/10 px-2 py-2 text-red-100">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" />
          <span>
            Microphone is blocked for Mila. Allow microphone for localhost and
            the browser in system privacy settings, then press Start mic again.
          </span>
        </div>
      )}
    </div>
  );
}

function buildCaptureHealth({
  autoStartStatus,
  capabilities,
  error,
  micPermission,
  segmentCount,
  status,
}: {
  autoStartStatus: AutoStartStatus;
  capabilities: AppCapabilities;
  error: string | null;
  micPermission: MicPermissionState;
  segmentCount: number;
  status: SessionStatus;
}) {
  const connectionTone =
    status === "error" || error ? "warning" : status === "recording" ? "good" : "neutral";
  const audioTone = capabilities.supportsRealAudio
    ? micPermission === "denied" || micPermission === "unsupported"
      ? "warning"
      : micPermission === "granted"
        ? "good"
        : "neutral"
    : "neutral";
  const audioValue = capabilities.supportsRealAudio
    ? formatMicPermission(micPermission)
    : "not used in demo";
  const transcriptionTone = capabilities.supportsRealAudio
    ? "good"
    : capabilities.supportsDemoAudio
      ? "neutral"
      : "warning";
  const detectionTone =
    autoStartStatus === "blocked"
      ? "warning"
      : autoStartStatus === "detected" || autoStartStatus === "watching"
        ? "good"
        : "neutral";
  const warningCount = [
    connectionTone,
    audioTone,
    transcriptionTone,
    detectionTone,
  ].filter((tone) => tone === "warning").length;

  return {
    tone: warningCount > 0 ? "warning" : status === "recording" ? "good" : "neutral",
    label:
      warningCount > 0
        ? "Needs check"
        : status === "recording"
          ? "Healthy"
          : "Ready",
    items: [
      {
        id: "connection",
        label: "Realtime",
        value:
          status === "recording"
            ? "Connected"
            : status === "connecting"
              ? "Connecting"
              : status === "error" || error
                ? "Attention"
                : "Standby",
        tone: connectionTone,
      },
      {
        id: "audio",
        label: "Microphone",
        value: audioValue,
        tone: audioTone,
      },
      {
        id: "transcription",
        label: "ASR",
        value: capabilities.supportsRealAudio
          ? capabilities.asrProvider
          : "demo only",
        tone: transcriptionTone,
      },
      {
        id: "segments",
        label: "Transcript",
        value: segmentCount ? `${segmentCount} segment${segmentCount === 1 ? "" : "s"}` : "waiting",
        tone: segmentCount > 0 ? "good" : "neutral",
      },
      {
        id: "detection",
        label: "Auto-detect",
        value: formatAutoStartStatus(autoStartStatus),
        tone: detectionTone,
      },
    ],
  };
}

function TranscriptPanel({
  segments,
  mode,
  isLive,
  transcriptionHealth,
}: {
  segments: TranscriptSegment[];
  mode: TranscriptMode;
  isLive: boolean;
  transcriptionHealth: TranscriptionHealth;
}) {
  const isCatchingUp = isLive && transcriptionHealth === "catching-up";

  return (
    <section className="min-h-[520px] overflow-y-auto border-b border-[var(--border)] p-5 xl:min-h-0 xl:border-b-0 xl:border-r">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="mila-eyebrow">
          Live transcript
        </h2>
        <span
          className={
            isCatchingUp
              ? "inline-flex items-center gap-2 rounded-full border border-[rgba(255,155,124,0.24)] bg-[var(--warm-faint)] px-2.5 py-1 text-xs font-medium text-[var(--warm)]"
              : "mila-muted inline-flex items-center gap-2 text-xs"
          }
        >
          {isCatchingUp ? (
            <>
              <RefreshCw size={12} className="animate-spin" />
              Catching up
            </>
          ) : isLive ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              Listening
            </>
          ) : (
            <>
              <Pause size={13} />
              Idle
            </>
          )}
        </span>
      </div>

      <div className="space-y-3">
        {segments.length === 0 && (
          <div className="mila-surface-soft flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
            <div className="grid h-10 w-10 place-items-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-faint)] text-[var(--accent)]">
              <Sparkles size={18} />
            </div>
            <p className="text-sm font-medium text-[var(--foreground)]">
              Listening for the first useful moment.
            </p>
            <p className="mila-muted max-w-xs text-xs leading-5">
              Start the mic, join an auto-detected meeting, or simulate a chunk
              to see Mila line up your transcript here.
            </p>
          </div>
        )}

        {segments.map((segment) => {
          const displayText =
            mode === "original" ? segment.originalText : segment.translatedText;
          const language = getLanguage(segment.detectedLanguage);

          return (
            <article
              key={segment.id}
              className="mila-surface-raised rounded-lg border p-4"
            >
              <div className="mila-muted mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono">{formatTime(segment.startMs)}</span>
                <span>{segment.speakerId}</span>
                <span className="rounded bg-[var(--accent-faint)] px-2 py-0.5 text-[var(--accent)]">
                  {language.nativeLabel}
                </span>
                <span>{Math.round(segment.confidence * 100)}%</span>
              </div>
              <p
                dir={mode === "original" ? segment.direction : "ltr"}
                className="text-base leading-7 text-[var(--foreground)]"
              >
                {displayText}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function NotesPanel({
  notes,
  segments,
  isLive,
}: {
  notes: MeetingNotes;
  segments: TranscriptSegment[];
  isLive: boolean;
}) {
  const actionReview = useMemo(
    () => buildMeetingActionReview(notes),
    [notes],
  );
  const liveCoach = useMemo(
    () => buildLiveMeetingCoach({ notes, segments, isLive }),
    [isLive, notes, segments],
  );
  const hasContent =
    Boolean(notes.summary?.trim()) ||
    notes.keyPoints.length > 0 ||
    notes.actionItems.length > 0 ||
    notes.decisions.length > 0;

  return (
    <section className="min-h-0 overflow-y-auto bg-black/[0.12] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="mila-eyebrow">
          Notes
        </h2>
        <span
          className="font-mono text-[11px] text-[var(--muted-soft)]"
          suppressHydrationWarning
          title="Last updated"
        >
          {new Date(notes.updatedAt).toLocaleTimeString()}
        </span>
      </div>

      {!hasContent && (
        <div className="mila-surface-soft mb-4 rounded-lg border border-dashed px-5 py-8 text-center">
          <p className="text-sm font-medium text-[var(--foreground)]">
            Notes appear as the conversation unfolds.
          </p>
          <p className="mila-muted mt-1 text-xs leading-5">
            Mila summarises the meeting, pulls out key points, decisions, and
            action items in your selected output language.
          </p>
        </div>
      )}

      <div className="space-y-4">
        <LiveCoachPanel coach={liveCoach} />
        <ActionCenterCard review={actionReview} />
        <NoteBlock title="Summary">
          {notes.summary?.trim() ? (
            <p className="mila-muted text-sm leading-6">{notes.summary}</p>
          ) : (
            <EmptyHint text="A short paragraph capturing the meeting will land here." />
          )}
        </NoteBlock>
        <NoteBlock title="Key points">
          <BulletList
            items={notes.keyPoints}
            empty="Highlights from the conversation will be pinned here."
          />
        </NoteBlock>
        <NoteBlock title="Action items">
          {notes.actionItems.length ? (
            <ul className="space-y-2">
              {notes.actionItems.map((item) => (
                <li
                  key={item.id}
                  className="mila-muted flex gap-2 text-sm leading-6"
                >
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--warm)]" />
                  <span>{formatAction(item)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyHint text="Tasks with owners will be detected automatically." />
          )}
        </NoteBlock>
        <NoteBlock title="Decisions">
          <BulletList
            items={notes.decisions}
            empty="Agreements made on the call will be listed here."
          />
        </NoteBlock>
      </div>
    </section>
  );
}

function LiveCoachPanel({ coach }: { coach: LiveMeetingCoach }) {
  return (
    <section
      className="mila-surface-raised rounded-lg border p-4"
      data-testid="live-coach"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
            <BrainCircuit size={16} className="text-[var(--accent)]" />
            Live coach
          </div>
          <p className="mila-muted mt-1 text-xs leading-5">
            {coach.headline}
          </p>
        </div>
        <span className={liveCoachStateClass(coach.state)}>
          {formatLiveCoachState(coach.state)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {coach.metrics.map((metric) => (
          <div
            key={metric.id}
            className="rounded-md border border-[var(--border)] bg-black/15 px-2 py-2"
          >
            <div className={liveCoachMetricClass(metric.tone)}>
              {metric.value}
            </div>
            <div className="mila-muted mt-0.5 truncate text-[10px] uppercase tracking-wider">
              {metric.label}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-md border border-[var(--accent-border)] bg-[var(--accent-faint)] px-3 py-2 text-xs leading-5 text-[var(--foreground)]">
        {coach.nextBestPrompt}
      </div>

      {coach.cards.length > 0 ? (
        <div className="mt-3 space-y-2">
          {coach.cards.map((card) => (
            <LiveCoachCardView key={card.id} card={card} />
          ))}
        </div>
      ) : (
        <div className="mila-muted mt-3 rounded-lg border border-dashed border-[var(--border)] px-3 py-4 text-center text-xs">
          Coach prompts appear when Mila sees decisions, questions, owners, or
          deadlines worth tightening.
        </div>
      )}
    </section>
  );
}

function LiveCoachCardView({ card }: { card: LiveCoachCardModel }) {
  return (
    <article
      className="rounded-md border border-[var(--border)] bg-black/10 px-3 py-3"
      data-testid={`live-coach-card-${card.kind}`}
    >
      <div className="flex gap-3">
        <div className={liveCoachIconClass(card.tone)}>
          <LiveCoachIcon kind={card.kind} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              {card.title}
            </h3>
            <span className={liveCoachTonePillClass(card.tone)}>
              {formatLiveCoachTone(card.tone)}
            </span>
          </div>
          <p className="mila-muted mt-1 text-xs leading-5">{card.detail}</p>
          {card.evidence ? (
            <p className="mt-2 line-clamp-2 rounded bg-black/15 px-2 py-1.5 text-[11px] leading-4 text-[var(--muted-soft)]">
              {card.evidence}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void copyTextToClipboard(card.suggestion);
            }}
            className="mila-secondary mt-2 inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-semibold transition"
            title="Copy coach prompt"
          >
            <Clipboard size={13} />
            {card.actionLabel}
          </button>
        </div>
      </div>
    </article>
  );
}

function LiveCoachIcon({ kind }: { kind: LiveCoachCardModel["kind"] }) {
  switch (kind) {
    case "owner-check":
      return <UsersRound size={15} />;
    case "date-check":
      return <CalendarClock size={15} />;
    case "decision-check":
      return <CheckCircle2 size={15} />;
    case "open-question":
      return <MessageCircleQuestion size={15} />;
    case "language-shift":
      return <Languages size={15} />;
    case "participation":
      return <UsersRound size={15} />;
    case "catch-up":
    default:
      return <Sparkles size={15} />;
  }
}

function ActionCenterCard({
  review,
}: {
  review: ReturnType<typeof buildMeetingActionReview>;
}) {
  return (
    <section className="mila-surface-raised rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            Action center
          </h3>
          <p className="mila-muted mt-1 text-xs leading-5">
            {review.headline}
          </p>
        </div>
        <span className={actionRiskClass(review.riskLevel)}>
          {formatActionRisk(review.riskLevel)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {review.metrics.map((metric) => (
          <div
            key={metric.id}
            className="rounded-md border border-[var(--border)] bg-black/15 px-3 py-2"
          >
            <div className={actionMetricValueClass(metric.tone)}>
              {metric.value}
            </div>
            <div className="mila-muted mt-0.5 text-[11px]">{metric.label}</div>
          </div>
        ))}
      </div>

      <p className="mt-3 rounded-md border border-[var(--accent-border)] bg-[var(--accent-faint)] px-3 py-2 text-xs leading-5 text-[var(--foreground)]">
        {review.nextBestAction}
      </p>

      {review.topActions.length > 0 ? (
        <div className="mt-3 space-y-2">
          {review.topActions.map((item) => (
            <div
              key={item.id}
              className="rounded-md border border-[var(--border)] bg-black/10 px-3 py-2"
            >
              <div className="flex items-start gap-2">
                <span
                  className={
                    item.status === "done"
                      ? "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
                      : item.overdue || item.missingOwner || item.missingDue
                        ? "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--warm)]"
                        : "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-5 text-[var(--foreground)]">
                    {item.text}
                  </p>
                  <p className="mila-muted mt-1 text-[11px]">
                    {item.ownerLabel} · {item.dueLabel}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <details className="mt-3 rounded-md border border-[var(--border)] bg-black/10">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-[var(--foreground)]">
          Follow-up draft
        </summary>
        <pre className="mila-muted whitespace-pre-wrap border-t border-[var(--border)] px-3 py-3 text-xs leading-5">
          {review.followUpDraft}
        </pre>
      </details>
    </section>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="mila-muted text-xs leading-5">{text}</p>
  );
}

function NoteBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mila-surface-soft rounded-lg border p-4">
      <h3 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function BulletList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) {
    return <EmptyHint text={empty} />;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="mila-muted flex gap-2 text-sm leading-6">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function isProtocolNoise(event: ServerErrorEvent) {
  return (
    event.code === "BAD_EVENT" ||
    /invalid meeting stream event/i.test(event.message)
  );
}

function isRecoverableTranscriptionEvent(
  event: ServerErrorEvent | ServerStatusEvent,
) {
  return event.code === "ASR_TIMEOUT" || event.code === "ASR_ERROR";
}

function formatFatalServerError(event: ServerErrorEvent) {
  if (event.code === "UNAUTHENTICATED") {
    return "Your session expired. Sign in again to continue recording.";
  }

  if (event.code === "SESSION_NOT_FOUND") {
    return "This meeting session could not be found. Start a new session from the workspace.";
  }

  return event.message.replace(/^Meeting stream error:\s*/i, "");
}

function formatSessionStatus(status: SessionStatus) {
  switch (status) {
    case "connecting":
      return "Connecting";
    case "recording":
      return "Recording";
    case "processing":
      return "Processing";
    case "paused":
      return "Paused";
    case "error":
      return "Needs attention";
    case "idle":
    default:
      return "Ready";
  }
}

function statusBadgeClass(status: SessionStatus) {
  const base =
    "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]";

  if (status === "recording") {
    return `${base} bg-[var(--accent-faint)] text-[var(--accent)]`;
  }

  if (status === "connecting" || status === "processing") {
    return `${base} bg-[rgba(103,232,249,0.1)] text-[var(--accent)]`;
  }

  if (status === "error") {
    return `${base} bg-red-300/15 text-red-200`;
  }

  return `${base} bg-white/5 text-[var(--muted)]`;
}

function normalizeLanguage(value: string): SupportedLanguageCode {
  const allowed: SupportedLanguageCode[] = [
    "en",
    "ur",
    "hi",
    "fi",
    "mixed",
    "unknown",
  ];
  return (allowed as string[]).includes(value)
    ? (value as SupportedLanguageCode)
    : "en";
}

function formatTime(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatAction(item: ActionItem) {
  const parts = [
    item.owner ? `${item.owner}: ${item.text}` : item.text,
    item.due ? `due ${item.due}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function toExternalMeetingContext(
  signal: AutoStartSignal,
): ExternalMeetingContext {
  return {
    provider: signal.provider,
    title: signal.title,
    url: signal.meetingUrl,
    detectedAt: signal.detectedAt,
    source: signal.source,
  };
}

function getUrlAutoStartSignal(): AutoStartSignal | null {
  const params = new URLSearchParams(window.location.search);
  const autoStart = parseBoolean(
    params.get("autostart") ?? params.get("autoStart"),
  );

  if (!autoStart) {
    return null;
  }

  const meetingUrl = params.get("meetingUrl") ?? params.get("url") ?? undefined;
  const mockAudio = parseBoolean(params.get("mockAudio")) ?? false;
  const provider =
    parseMeetingProvider(params.get("provider")) ??
    detectMeetingProvider(meetingUrl);

  return {
    title: params.get("title") ?? undefined,
    meetingUrl,
    provider,
    source: parseMeetingSource(params.get("source")) ?? "auto-browser",
    detectedAt: new Date().toISOString(),
    captureAudio: parseBoolean(params.get("captureAudio")) ?? !mockAudio,
    mockAudio,
  };
}

function getUrlSessionId(): string | null {
  const params = new URLSearchParams(window.location.search);
  return readString(params.get("sessionId")) ?? null;
}

function replaceAutoStartUrlWithSession(sessionId: string) {
  const params = new URLSearchParams(window.location.search);
  const autoStart = parseBoolean(
    params.get("autostart") ?? params.get("autoStart"),
  );

  if (!autoStart || getUrlSessionId()) return;

  window.history.replaceState(
    null,
    "",
    `/app?sessionId=${encodeURIComponent(sessionId)}`,
  );
}

function getStoredAutoStartSignal(): AutoStartSignal | null {
  try {
    const signal = parseStoredAutoStartSignal(
      window.localStorage.getItem("mila:meeting-signal"),
    );
    if (!signal) return null;
    if (!isFreshAutoStartSignal(signal)) {
      clearStoredAutoStartSignal();
      return null;
    }
    return signal;
  } catch {
    return null;
  }
}

function clearStoredAutoStartSignal() {
  try {
    window.localStorage.removeItem("mila:meeting-signal");
  } catch {
    // Ignore storage failures; the in-memory duplicate guard still applies.
  }
}

function isFreshAutoStartSignal(signal: AutoStartSignal) {
  const detectedAt = Date.parse(signal.detectedAt);
  if (Number.isNaN(detectedAt)) return true;
  return Date.now() - detectedAt <= STORED_AUTO_START_SIGNAL_TTL_MS;
}

function takePendingWorkspaceCommand(): DesktopWorkspaceCommand | null {
  try {
    const command = window.sessionStorage.getItem(PENDING_WORKSPACE_COMMAND_KEY);
    window.sessionStorage.removeItem(PENDING_WORKSPACE_COMMAND_KEY);
    return isDesktopWorkspaceCommand(command) ? command : null;
  } catch {
    return null;
  }
}

function isDesktopWorkspaceCommand(
  command: string | null,
): command is DesktopWorkspaceCommand {
  return (
    command === "mila:desktop-new-meeting" ||
    command === "mila:desktop-start-mic" ||
    command === "mila:desktop-stop-mic"
  );
}

function parseStoredAutoStartSignal(
  rawSignal: string | null,
): AutoStartSignal | null {
  if (!rawSignal) {
    return null;
  }

  try {
    return normalizeAutoStartSignal(
      JSON.parse(rawSignal) as unknown,
      "auto-desktop",
    );
  } catch {
    return null;
  }
}

function normalizeAutoStartSignal(
  value: unknown,
  fallbackSource: MeetingSource,
): AutoStartSignal | null {
  if (!isRecord(value)) {
    return null;
  }

  const eventType = readString(value.type);
  const knownEvent =
    eventType === "mila.meeting-joined" ||
    eventType === "mila:meeting-joined" ||
    eventType === "meeting-joined";
  const payload = isRecord(value.payload) ? value.payload : value;

  if (
    !knownEvent &&
    !("meetingUrl" in payload) &&
    !("url" in payload) &&
    !("provider" in payload)
  ) {
    return null;
  }

  const meetingUrl = readString(payload.meetingUrl) ?? readString(payload.url);
  const provider =
    parseMeetingProvider(readString(payload.provider)) ??
    detectMeetingProvider(meetingUrl);
  const mockAudio = parseBoolean(payload.mockAudio) ?? false;

  return {
    title: readString(payload.title),
    meetingUrl,
    provider,
    source: parseMeetingSource(readString(payload.source)) ?? fallbackSource,
    detectedAt: readString(payload.detectedAt) ?? new Date().toISOString(),
    captureAudio: parseBoolean(payload.captureAudio) ?? !mockAudio,
    mockAudio,
  };
}

function getSignalKey(signal: AutoStartSignal) {
  return `${signal.source}:${signal.provider}:${signal.meetingUrl ?? signal.title ?? signal.detectedAt}`;
}

function detectMeetingProvider(url: string | undefined): MeetingProvider {
  if (!url) {
    return "unknown";
  }

  try {
    const hostname = new URL(url).hostname;

    if (hostname.includes("meet.google.com")) {
      return "google-meet";
    }

    if (hostname.includes("zoom.us")) {
      return "zoom";
    }

    if (hostname.includes("teams.microsoft.com")) {
      return "microsoft-teams";
    }

    if (hostname.includes("slack.com")) {
      return "slack-huddle";
    }

    if (hostname.includes("web.whatsapp.com")) {
      return "whatsapp-web";
    }
  } catch {
    return "unknown";
  }

  return "unknown";
}

function parseMeetingSource(
  value: string | null | undefined,
): MeetingSource | null {
  if (
    value === "manual" ||
    value === "auto-browser" ||
    value === "auto-calendar" ||
    value === "auto-desktop" ||
    value === "upload" ||
    value === "mock"
  ) {
    return value;
  }

  return null;
}

function parseMeetingProvider(
  value: string | null | undefined,
): MeetingProvider | null {
  if (
    value === "google-meet" ||
    value === "zoom" ||
    value === "microsoft-teams" ||
    value === "slack-huddle" ||
    value === "whatsapp-web" ||
    value === "unknown"
  ) {
    return value;
  }

  return null;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }

  return undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatAutoStartStatus(status: AutoStartStatus) {
  const labels: Record<AutoStartStatus, string> = {
    off: "Off",
    watching: "Watching",
    detected: "Detected",
    starting: "Starting",
    blocked: "Blocked",
  };

  return labels[status];
}

function formatProvider(provider: MeetingProvider) {
  const labels: Record<MeetingProvider, string> = {
    "google-meet": "Google Meet",
    zoom: "Zoom",
    "microsoft-teams": "Teams",
    "slack-huddle": "Slack",
    "whatsapp-web": "WhatsApp Web",
    unknown: "Unknown",
  };

  return labels[provider];
}

function formatMicPermission(permission: MicPermissionState) {
  const labels: Record<MicPermissionState, string> = {
    unknown: "unknown",
    prompt: "needs approval",
    granted: "allowed",
    denied: "blocked",
    unsupported: "unsupported",
  };

  return labels[permission];
}

function captureHealthBadgeClass(tone: string) {
  const base = "rounded px-2 py-0.5 font-semibold";
  if (tone === "good") {
    return `${base} border border-[var(--accent-border)] bg-[var(--accent-faint)] text-[var(--accent)]`;
  }
  if (tone === "warning") {
    return `${base} border border-[rgba(255,155,124,0.3)] bg-[var(--warm-faint)] text-[var(--warm)]`;
  }
  return `${base} mila-chip`;
}

function captureCheckClass(tone: string) {
  if (tone === "good") return "font-medium text-[var(--accent)]";
  if (tone === "warning") return "font-medium text-[var(--warm)]";
  return "font-medium text-[var(--foreground)]";
}

function actionRiskClass(risk: ReturnType<typeof buildMeetingActionReview>["riskLevel"]) {
  const base =
    "shrink-0 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]";
  if (risk === "clear") {
    return `${base} border border-[var(--accent-border)] bg-[var(--accent-faint)] text-[var(--accent)]`;
  }
  if (risk === "empty") {
    return `${base} mila-chip`;
  }
  return `${base} border border-[rgba(255,155,124,0.3)] bg-[var(--warm-faint)] text-[var(--warm)]`;
}

function formatActionRisk(
  risk: ReturnType<typeof buildMeetingActionReview>["riskLevel"],
) {
  const labels: Record<
    ReturnType<typeof buildMeetingActionReview>["riskLevel"],
    string
  > = {
    empty: "Watching",
    clear: "Ready",
    "needs-owners": "Owners",
    "needs-dates": "Dates",
    overloaded: "Triage",
  };

  return labels[risk];
}

function actionMetricValueClass(tone: string) {
  if (tone === "good") return "text-lg font-semibold text-[var(--accent)]";
  if (tone === "warning") return "text-lg font-semibold text-[var(--warm)]";
  return "text-lg font-semibold text-[var(--foreground)]";
}

function liveCoachStateClass(state: LiveMeetingCoach["state"]) {
  const base =
    "shrink-0 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]";
  if (state === "coaching") {
    return `${base} border border-[var(--accent-border)] bg-[var(--accent-faint)] text-[var(--accent)]`;
  }
  if (state === "empty") {
    return `${base} mila-chip`;
  }
  return `${base} border border-[rgba(255,155,124,0.3)] bg-[var(--warm-faint)] text-[var(--warm)]`;
}

function formatLiveCoachState(state: LiveMeetingCoach["state"]) {
  const labels: Record<LiveMeetingCoach["state"], string> = {
    empty: "Waiting",
    "warming-up": "Warming",
    coaching: "Live",
    review: "Review",
  };

  return labels[state];
}

function liveCoachMetricClass(tone: LiveCoachCardModel["tone"]) {
  if (tone === "good") return "text-sm font-semibold text-[var(--accent)]";
  if (tone === "warning") return "text-sm font-semibold text-[var(--warm)]";
  return "text-sm font-semibold text-[var(--foreground)]";
}

function liveCoachIconClass(tone: LiveCoachCardModel["tone"]) {
  const base =
    "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md border";
  if (tone === "warning") {
    return `${base} border-[rgba(255,155,124,0.3)] bg-[var(--warm-faint)] text-[var(--warm)]`;
  }
  if (tone === "good") {
    return `${base} border-[var(--accent-border)] bg-[var(--accent-faint)] text-[var(--accent)]`;
  }
  return `${base} border-[var(--border)] bg-white/[0.04] text-[var(--muted)]`;
}

function liveCoachTonePillClass(tone: LiveCoachCardModel["tone"]) {
  const base = "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider";
  if (tone === "warning") {
    return `${base} bg-[var(--warm-faint)] text-[var(--warm)]`;
  }
  if (tone === "good") {
    return `${base} bg-[var(--accent-faint)] text-[var(--accent)]`;
  }
  return `${base} mila-chip`;
}

function formatLiveCoachTone(tone: LiveCoachCardModel["tone"]) {
  const labels: Record<LiveCoachCardModel["tone"], string> = {
    good: "Context",
    info: "Prompt",
    warning: "Close gap",
  };

  return labels[tone];
}

async function queryMicrophonePermission(): Promise<MicPermissionState> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return "unsupported";
  }

  if (!navigator.permissions?.query) {
    return "unknown";
  }

  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });

    if (status.state === "granted" || status.state === "denied") {
      return status.state;
    }

    return "prompt";
  } catch {
    return "unknown";
  }
}

function describeCaptureError(error: unknown) {
  const name = error instanceof DOMException ? error.name : undefined;
  const message = error instanceof Error ? error.message : String(error);
  const permissionDenied =
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    /permission denied|notallowederror|permission dismissed/i.test(message);

  if (permissionDenied) {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "this app";
    return {
      permissionDenied: true,
      message:
        `Microphone permission is denied for Mila. Google Meet permission does not transfer to this app; allow microphone access for ${origin} and for the browser in system privacy settings, then try Start mic again.`,
    };
  }

  if (
    /failed to fetch|fetch failed|networkerror|load failed|econnrefused/i.test(
      message,
    )
  ) {
    return {
      permissionDenied: false,
      message:
        "Mila opened the meeting workspace, but the backend is not reachable. Start the backend and ASR stack, or update the API URL in Preferences before taking live notes.",
    };
  }

  return {
    permissionDenied: false,
    message: error instanceof Error ? error.message : "Recording failed",
  };
}

async function readApiError(response: Response, fallback: string) {
  if (response.status === 401) {
    return "Your session expired. Sign in again to continue.";
  }

  try {
    const data = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(data.message) && data.message.length > 0) {
      return data.message.join(" ");
    }
    if (typeof data.message === "string" && data.message.trim()) {
      return data.message;
    }
  } catch {
    // Keep the fallback below. Some failures return an empty or non-JSON body.
  }

  return `${fallback} (${response.status})`;
}

type AudioContextConstructor = {
  new (contextOptions?: AudioContextOptions): AudioContext;
};

function getAudioContextConstructor(): AudioContextConstructor | null {
  const audioWindow = window as Window &
    typeof globalThis & {
      webkitAudioContext?: AudioContextConstructor;
    };

  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

function mergePcmChunks(chunks: Float32Array[], totalLength: number) {
  const merged = new Float32Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

function calculateRms(samples: Float32Array) {
  if (!samples.length) {
    return 0;
  }

  let sum = 0;

  for (const sample of samples) {
    sum += sample * sample;
  }

  return Math.sqrt(sum / samples.length);
}

function downsamplePcm(
  samples: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number,
) {
  if (inputSampleRate === outputSampleRate) {
    return samples;
  }

  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.floor(samples.length / ratio);
  const output = new Float32Array(outputLength);

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio);
    const end = Math.min(Math.floor((outputIndex + 1) * ratio), samples.length);
    let sum = 0;
    let count = 0;

    for (let inputIndex = start; inputIndex < end; inputIndex += 1) {
      sum += samples[inputIndex] ?? 0;
      count += 1;
    }

    output[outputIndex] = count ? sum / count : 0;
  }

  return output;
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const bytesPerSample = 2;
  const headerLength = 44;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(headerLength + dataLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataLength, true);

  let offset = headerLength;

  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(
      offset,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true,
    );
    offset += bytesPerSample;
  }

  return new Uint8Array(buffer);
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function uint8ArrayToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return window.btoa(binary);
}

function toMarkdown(notes: MeetingNotes) {
  const actions =
    notes.actionItems.map((item) => `- [ ] ${item.text}`).join("\n") ||
    "- None";
  const keyPoints =
    notes.keyPoints.map((item) => `- ${item}`).join("\n") || "- None";
  const decisions =
    notes.decisions.map((item) => `- ${item}`).join("\n") || "- None";

  return `# Mila Notes\n\n## Summary\n${notes.summary}\n\n## Key Points\n${keyPoints}\n\n## Action Items\n${actions}\n\n## Decisions\n${decisions}\n`;
}

function slugifyForFilename(input: string) {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
  return slug || "mila-notes";
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function markdownToHtml(markdown: string) {
  return markdown
    .split("\n")
    .map((line) => {
      if (line.startsWith("# ")) return `<h1>${escapeHtml(line.slice(2))}</h1>`;
      if (line.startsWith("## ")) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      if (line.startsWith("- [ ] "))
        return `<div class="action">☐ ${escapeHtml(line.slice(6))}</div>`;
      if (line.startsWith("- ")) return `<li>${escapeHtml(line.slice(2))}</li>`;
      if (line.trim() === "") return "";
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("\n");
}

function openPrintWindow(title: string, markdown: string) {
  const printWindow = window.open("", "_blank", "width=800,height=900");
  if (!printWindow) return false;
  const body = markdownToHtml(markdown);
  printWindow.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 720px; margin: 40px auto; padding: 0 24px; color: #111; line-height: 1.5; }
  h1 { font-size: 28px; margin-bottom: 24px; border-bottom: 2px solid #eee; padding-bottom: 12px; }
  h2 { font-size: 18px; margin-top: 28px; color: #333; }
  p { margin: 8px 0; }
  li { margin: 4px 0; }
  .action { margin: 6px 0; padding-left: 4px; }
  @media print { body { margin: 20px; max-width: none; } }
</style></head>
<body>${body}<script>window.onload=function(){window.print();}</script></body></html>`);
  printWindow.document.close();
  return true;
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read audio chunk"));
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.split(",")[1] ?? "");
    };
    reader.readAsDataURL(blob);
  });
}

const primaryButtonClass =
  "mila-primary flex h-10 w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition";
const secondaryButtonClass =
  "mila-secondary flex h-10 w-full items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition";
const secondaryLabelClass = `${secondaryButtonClass} cursor-pointer`;
const segmentClass =
  "rounded-md px-3 py-1.5 text-sm font-medium text-[var(--muted-soft)] transition";
const activeSegmentClass =
  "rounded-md bg-[var(--accent-faint)] px-3 py-1.5 text-sm font-semibold text-[var(--accent)] shadow-sm";
const pillButtonClass =
  "mila-secondary inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition";
