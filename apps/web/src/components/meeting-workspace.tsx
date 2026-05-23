"use client";

import {
  ActionItem,
  CreateMeetingRequest,
  CreateMeetingResponse,
  ExternalMeetingContext,
  MeetingNotes,
  MeetingProvider,
  MeetingSession,
  MeetingSource,
  ServerMeetingEvent,
  SupportedLanguageCode,
  TranscriptSegment,
  createEmptyNotes,
  getLanguage,
  supportedLanguages,
} from "@mila/shared";
import {
  Clipboard,
  Captions,
  Command,
  FileAudio,
  FileDown,
  Languages,
  Mic,
  Pause,
  Play,
  Radar,
  Radio,
  Search,
  ShieldAlert,
  Sparkles,
  Square,
  ToggleLeft,
  ToggleRight,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandLogo } from "./brand-logo";
import { AccountCard } from "./auth/account-card";
import { CommandPalette } from "./command-palette";
import { ShareSessionButton } from "./share-session-button";
import { TemplatePicker } from "./template-picker";
import { WorkspaceNav } from "./workspace-nav";
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
}

interface AppCapabilities {
  asrProvider: string;
  supportsRealAudio: boolean;
  supportsDemoAudio: boolean;
  supportedInputs: string[];
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
  const [micPermission, setMicPermission] =
    useState<MicPermissionState>("unknown");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const openCommandPalette = useCallback(() => setCommandOpen(true), []);
  const closeCommandPalette = useCallback(() => setCommandOpen(false), []);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
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
          const event = JSON.parse(message.data) as ServerMeetingEvent;

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
          }

          if (event.type === "notes") {
            setNotes(event.notes);
          }

          if (event.type === "error") {
            setError(event.message);
            setStatus("error");
          }
        };

        socket.onclose = () => {
          wsRef.current = null;
          setStatus((current) => (current === "recording" ? "idle" : current));
        };
      }),
    [outputLanguage, apiWsUrl],
  );

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

      audioSinkRef.current?.disconnect();
      audioSinkRef.current = null;

      const audioContext = audioContextRef.current;
      audioContextRef.current = null;

      if (audioContext && audioContext.state !== "closed") {
        void audioContext.close();
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;

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
    [resetPcmBuffer],
  );

  const buildAuthHeaders = useCallback(
    (extras: Record<string, string> = {}) => {
      const headers: Record<string, string> = { ...extras };
      if (apiHttpUrl) headers["authorization"] = `Bearer ${token}`;
      return headers;
    },
    [apiHttpUrl, token],
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
        throw new Error("Could not create meeting session");
      }

      return (await response.json()) as CreateMeetingResponse;
    },
    [apiHttpUrl, buildAuthHeaders, outputLanguage, pendingTitle, templateId],
  );

  const openLiveSession = useCallback(
    async (options: StartLiveSessionOptions = {}) => {
      setError(null);
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
      });
      setSession(created.session);
      setNotes(created.notes);

      const socket = await connectSocket(created.session);
      wsRef.current = socket;

      return { created, socket };
    },
    [connectSocket, createSession, stopLocalCapture],
  );

  const openExistingSession = useCallback(
    async (sessionId: string) => {
      setError(null);
      setStatus("connecting");

      stopLocalCapture();
      wsRef.current?.close();

      const response = await fetch(`${apiHttpUrl}/api/sessions/${sessionId}`, {
        cache: "no-store",
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error("Could not open the detected meeting session");
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
    [apiHttpUrl, buildAuthHeaders, connectSocket, stopLocalCapture],
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

      const audioContext = new AudioContextConstructor();
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const sink = audioContext.createGain();
      sink.gain.value = 0;

      audioContextRef.current = audioContext;
      audioSampleRateRef.current = audioContext.sampleRate;
      audioSourceRef.current = source;
      audioProcessorRef.current = processor;
      audioSinkRef.current = sink;

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const chunk = new Float32Array(input.length);
        chunk.set(input);
        pcmBufferRef.current.push(chunk);
        pcmBufferLengthRef.current += chunk.length;
      };

      source.connect(processor);
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
    [flushMicrophoneChunk, resetPcmBuffer],
  );

  const startRecording = async () => {
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
  };

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
      setAutoStartStatus("detected");
      return;
    }

    const signalKey = getSignalKey(autoStartSignal);

    if (autoStartedSignalRef.current === signalKey) {
      return;
    }

    autoStartedSignalRef.current = signalKey;

    void (async () => {
      try {
        setAutoStartStatus("starting");
        const externalMeeting = toExternalMeetingContext(autoStartSignal);
        const { created, socket } = await openLiveSession({
          title: autoStartSignal.title ?? "Auto-detected meeting",
          source: autoStartSignal.source,
          autoStarted: true,
          externalMeeting,
        });

        if (autoStartSignal.mockAudio) {
          setStatus("recording");
          sendMockChunk(created.session, socket);
        } else if (!autoStartSignal.captureAudio) {
          setStatus("recording");
        } else if (!capabilities.supportsRealAudio) {
          throw new Error(
            "Auto-start detected a meeting, but real audio transcription is not configured yet.",
          );
        } else {
          await attachMicrophone(created.session, socket);
        }

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
    })();
  }, [
    attachMicrophone,
    autoStartEnabled,
    autoStartSignal,
    capabilities.supportsRealAudio,
    openLiveSession,
    sendMockChunk,
    status,
  ]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`${apiHttpUrl}/api/capabilities`, {
          cache: "no-store",
          headers: buildAuthHeaders(),
        });

        if (!response.ok) {
          return;
        }

        const nextCapabilities = (await response.json()) as AppCapabilities;

        if (!cancelled) {
          setCapabilities(nextCapabilities);
        }
      } catch {
        // Keep conservative defaults when the API is unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiHttpUrl, buildAuthHeaders]);

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

  const stopRecording = () => {
    stopLocalCapture(false);

    if (session && wsRef.current?.readyState === WebSocket.OPEN) {
      flushMicrophoneChunk(session, wsRef.current, { force: true });
      wsRef.current.send(
        JSON.stringify({ type: "stop", sessionId: session.id }),
      );
      wsRef.current.close();
    }

    resetPcmBuffer();
    setStatus("idle");
  };

  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(toMarkdown(notes));
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
    openPrintWindow(title, toMarkdown(notes));
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
    <main className="min-h-screen bg-[#0e1116] text-slate-100">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[280px_1fr]">
        <aside className="border-b border-white/10 bg-[#101821] px-5 py-5 lg:border-b-0 lg:border-r">
          <BrandLogo />
          <AccountCard user={user} />
          <WorkspaceNav className="mt-5" />
          <div className="mt-6 space-y-5">
            <TemplatePicker
              value={templateId}
              disabled={Boolean(session)}
              onChange={(nextId, template) => {
                setTemplateId(nextId);
                if (!session) setPendingTitle(template.defaultTitle);
              }}
            />

            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Output
              </label>
              <select
                value={outputLanguage}
                onChange={(event) =>
                  setOutputLanguage(event.target.value as SupportedLanguageCode)
                }
                className="mt-2 w-full rounded-md border border-white/10 bg-[#0d131b] px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
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

            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Session</span>
                <span className="inline-flex items-center gap-2 text-emerald-300">
                  <Radio size={14} />
                  {status}
                </span>
              </div>
              <div className="mt-3 min-h-11 rounded bg-black/20 px-3 py-2 font-mono text-xs text-slate-400">
                {session?.id ?? "No active session"}
              </div>
            </div>

            <div className="rounded-md border border-amber-300/20 bg-amber-300/[0.06] p-3 text-xs leading-5 text-amber-100">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-amber-50">
                  ASR provider
                </span>
                <span className="rounded bg-black/20 px-2 py-0.5 font-mono">
                  {capabilities.asrProvider}
                </span>
              </div>
              <p className="mt-2 text-amber-100/80">
                {capabilities.supportsRealAudio
                  ? "Real audio transcription is enabled."
                  : "Demo mode only. Real mic, upload, Zoom, Meet, and calls need a real ASR worker."}
              </p>
            </div>

            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-2 text-slate-400">
                  <Radar size={15} />
                  Auto-start
                </span>
                <button
                  type="button"
                  aria-pressed={autoStartEnabled}
                  onClick={toggleAutoStart}
                  className="text-emerald-300 transition hover:text-emerald-100"
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
                <span className="font-medium text-slate-400">
                  {formatAutoStartStatus(autoStartStatus)}
                </span>
                <span className="rounded bg-white/5 px-2 py-0.5 text-slate-300">
                  {autoStartSignal
                    ? formatProvider(autoStartSignal.provider)
                    : "No signal"}
                </span>
              </div>
              {autoStartSignal && (
                <div className="mt-2 truncate rounded bg-black/20 px-3 py-2 text-xs text-slate-500">
                  {autoStartSignal.title ??
                    autoStartSignal.meetingUrl ??
                    "Detected meeting"}
                </div>
              )}
              <button
                type="button"
                onClick={triggerDemoMeetingSignal}
                className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07]"
              >
                <Radar size={15} />
                Detect join
              </button>
            </div>

            <CaptureDiagnosticsCard
              autoStartSignal={autoStartSignal}
              micPermission={micPermission}
            />

            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Transcript
              </label>
              <div className="mt-2 grid grid-cols-2 rounded-md border border-white/10 bg-[#0d131b] p-1">
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

            <div className="space-y-2">
              <button
                type="button"
                onClick={startRecording}
                className={primaryButtonClass}
                data-testid="start-mic"
              >
                <Mic size={17} />
                Start mic
              </button>
              <button
                type="button"
                onClick={stopRecording}
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
                Simulate
              </button>
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
        </aside>

        <section className="flex min-w-0 flex-col">
          <header className="flex flex-col gap-4 border-b border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
                <Languages size={16} />
                {detectedLanguages.length ? (
                  detectedLanguages.map((language) => (
                    <span
                      key={language.code}
                      className="rounded bg-white/5 px-2 py-1 text-xs text-slate-300"
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
              <div className="flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 focus-within:border-emerald-400/60">
                <Search size={16} className="text-slate-500" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search transcript"
                  className="w-40 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                />
              </div>
              <button
                type="button"
                onClick={openCommandPalette}
                className="hidden h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 text-xs font-medium text-slate-400 transition hover:bg-white/[0.07] hover:text-white md:inline-flex"
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

          {error && (
            <div className="border-b border-red-400/20 bg-red-500/10 px-5 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <div className="grid flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
            <TranscriptPanel
              segments={filteredSegments}
              mode={mode}
              isLive={status === "recording" || status === "connecting"}
            />
            <NotesPanel notes={notes} />
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

function CaptureDiagnosticsCard({
  autoStartSignal,
  micPermission,
}: {
  autoStartSignal: AutoStartSignal | null;
  micPermission: MicPermissionState;
}) {
  const provider = autoStartSignal?.provider;
  const isMeet = provider === "google-meet";

  return (
    <div className="rounded-md border border-sky-300/20 bg-sky-300/[0.05] p-3 text-xs leading-5 text-sky-100">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-semibold text-sky-50">
          <Captions size={15} />
          Capture path
        </span>
        <span className="rounded bg-black/20 px-2 py-0.5">
          Mic {formatMicPermission(micPermission)}
        </span>
      </div>
      <p className="mt-2 text-sky-100/80">
        {isMeet
          ? "Google Meet detection starts Mila. Your own speech needs mic permission in this app; Meet captions need the browser extension caption bridge and captions turned on in Meet."
          : "The web app captures this page's microphone only. Other tabs, Zoom desktop, WhatsApp calls, and whole-device audio need the extension or desktop bridge."}
      </p>
      {micPermission === "denied" && (
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

function TranscriptPanel({
  segments,
  mode,
  isLive,
}: {
  segments: TranscriptSegment[];
  mode: TranscriptMode;
  isLive: boolean;
}) {
  return (
    <section className="min-h-[520px] overflow-y-auto border-b border-white/10 p-5 xl:border-b-0 xl:border-r">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Live transcript
        </h2>
        <span className="inline-flex items-center gap-2 text-xs text-slate-500">
          {isLive ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
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
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-400/10 text-emerald-300">
              <Sparkles size={18} />
            </div>
            <p className="text-sm font-medium text-slate-200">
              Listening for the first useful moment.
            </p>
            <p className="max-w-xs text-xs leading-5 text-slate-500">
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
              className="rounded-md border border-white/10 bg-[#121922] p-4 shadow-sm"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-mono">{formatTime(segment.startMs)}</span>
                <span>{segment.speakerId}</span>
                <span className="rounded bg-emerald-400/10 px-2 py-0.5 text-emerald-200">
                  {language.nativeLabel}
                </span>
                <span>{Math.round(segment.confidence * 100)}%</span>
              </div>
              <p
                dir={mode === "original" ? segment.direction : "ltr"}
                className="text-base leading-7 text-slate-100"
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

function NotesPanel({ notes }: { notes: MeetingNotes }) {
  const hasContent =
    Boolean(notes.summary?.trim()) ||
    notes.keyPoints.length > 0 ||
    notes.actionItems.length > 0 ||
    notes.decisions.length > 0;

  return (
    <section className="overflow-y-auto bg-[#0b0f14] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Notes
        </h2>
        <span
          className="font-mono text-[11px] text-slate-600"
          suppressHydrationWarning
          title="Last updated"
        >
          {new Date(notes.updatedAt).toLocaleTimeString()}
        </span>
      </div>

      {!hasContent && (
        <div className="mb-4 rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-center">
          <p className="text-sm font-medium text-slate-200">
            Notes appear as the conversation unfolds.
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Mila summarises the meeting, pulls out key points, decisions, and
            action items in your selected output language.
          </p>
        </div>
      )}

      <div className="space-y-4">
        <NoteBlock title="Summary">
          {notes.summary?.trim() ? (
            <p className="text-sm leading-6 text-slate-300">{notes.summary}</p>
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
                  className="flex gap-2 text-sm leading-6 text-slate-300"
                >
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
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

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="text-xs leading-5 text-slate-500">{text}</p>
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
    <section className="rounded-md border border-white/10 bg-white/[0.03] p-4">
      <h3 className="mb-3 text-sm font-semibold text-white">{title}</h3>
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
        <li key={item} className="flex gap-2 text-sm leading-6 text-slate-300">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
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
  return item.owner ? `${item.owner}: ${item.text}` : item.text;
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

function getStoredAutoStartSignal(): AutoStartSignal | null {
  try {
    return parseStoredAutoStartSignal(
      window.localStorage.getItem("mila:meeting-signal"),
    );
  } catch {
    return null;
  }
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
    return {
      permissionDenied: true,
      message:
        "Microphone permission is denied for Mila. Google Meet permission does not transfer to this app; allow microphone for http://localhost:3002 and for the browser in system privacy settings, then try Start mic again.",
    };
  }

  return {
    permissionDenied: false,
    message: error instanceof Error ? error.message : "Recording failed",
  };
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
  if (!printWindow) return;
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
  "flex h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-300 px-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200";
const secondaryButtonClass =
  "flex h-10 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07]";
const secondaryLabelClass = `${secondaryButtonClass} cursor-pointer`;
const segmentClass =
  "rounded px-3 py-1.5 text-sm font-medium text-slate-500 transition";
const activeSegmentClass =
  "rounded bg-white/10 px-3 py-1.5 text-sm font-medium text-white shadow-sm";
const pillButtonClass =
  "inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm font-medium text-slate-200 transition hover:bg-white/[0.07] hover:text-white";
