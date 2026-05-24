import type {
  ClientMeetingEvent,
  CreateMeetingResponse,
  ServerMeetingEvent,
  TranscriptSegment,
} from "@mila/shared";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiFetch, getMeetingsWsUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type Phase = "preparing" | "recording" | "uploading" | "done" | "error";

export default function RecordScreen() {
  const { token } = useAuth();
  const [phase, setPhase] = useState<Phase>("preparing");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const pulse = useRef(new Animated.Value(1)).current;

  const recordingRef = useRef<Audio.Recording | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(0);
  const cleanedUpRef = useRef(false);

  const fail = useCallback((message: string) => {
    setError(message);
    setPhase("error");
  }, []);

  const teardownAudio = useCallback(async () => {
    const recording = recordingRef.current;
    recordingRef.current = null;
    if (recording) {
      try {
        const status = await recording.getStatusAsync();
        if (status.isRecording || status.canRecord) {
          await recording.stopAndUnloadAsync();
        }
      } catch {
        // ignore
      }
    }
  }, []);

  const teardownWs = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      if (!token) {
        fail("You're signed out. Sign back in to record.");
        return;
      }

      const permission = await Audio.requestPermissionsAsync();
      if (cancelled) return;
      if (!permission.granted) {
        fail("Mic permission is required to record a meeting.");
        return;
      }

      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      } catch {
        // non-fatal
      }

      let sessionResponse: CreateMeetingResponse;
      try {
        const response = await apiFetch("/api/sessions", {
          method: "POST",
          token,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: "manual" }),
        });
        if (!response.ok) throw new Error(`${response.status}`);
        sessionResponse = (await response.json()) as CreateMeetingResponse;
      } catch (err) {
        fail(
          err instanceof Error
            ? `Couldn't start a session (${err.message}).`
            : "Couldn't start a session.",
        );
        return;
      }
      if (cancelled) return;

      const sid = sessionResponse.session.id;
      sessionIdRef.current = sid;
      setSessionId(sid);

      const ws = new WebSocket(getMeetingsWsUrl(token));
      wsRef.current = ws;
      ws.onopen = () => {
        const startEvent: ClientMeetingEvent = {
          type: "start",
          sessionId: sid,
          outputLanguage: sessionResponse.session.outputLanguage,
        };
        ws.send(JSON.stringify(startEvent));
      };
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as ServerMeetingEvent;
          if (payload.type === "transcript") {
            setSegments((prev) => [...prev, payload.segment]);
          } else if (payload.type === "error") {
            fail(payload.message);
          }
        } catch {
          // ignore malformed frames
        }
      };
      ws.onerror = () => {
        // The close handler will surface the user-facing error if recording
        // hasn't ended cleanly.
      };
      ws.onclose = () => {
        if (phase === "recording") {
          fail("Lost connection to the server.");
        }
      };

      try {
        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY,
        );
        await recording.startAsync();
        recordingRef.current = recording;
        startTimeRef.current = Date.now();
        setPhase("recording");
      } catch (err) {
        fail(
          err instanceof Error
            ? `Mic error: ${err.message}`
            : "Couldn't access the microphone.",
        );
      }
    };

    void start();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "recording") {
      pulse.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.18,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [phase, pulse]);

  useEffect(() => {
    return () => {
      if (cleanedUpRef.current) return;
      cleanedUpRef.current = true;
      void teardownAudio();
      teardownWs();
    };
  }, [teardownAudio, teardownWs]);

  const handleStop = async () => {
    if (phase !== "recording") return;
    setPhase("uploading");
    const sid = sessionIdRef.current;
    const ws = wsRef.current;
    const recording = recordingRef.current;
    recordingRef.current = null;

    try {
      let uri: string | null = null;
      if (recording) {
        await recording.stopAndUnloadAsync();
        uri = recording.getURI();
      }
      if (!uri || !sid || !ws) {
        throw new Error("Recording state was lost.");
      }

      const audioBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await waitForWsOpen(ws);

      const chunk: ClientMeetingEvent = {
        type: "audio-chunk",
        sessionId: sid,
        mimeType: inferMimeType(uri),
        chunkId: `chunk-${Date.now()}`,
        capturedAt: new Date().toISOString(),
        audioBase64,
      };
      ws.send(JSON.stringify(chunk));

      const stop: ClientMeetingEvent = { type: "stop", sessionId: sid };
      ws.send(JSON.stringify(stop));

      cleanedUpRef.current = true;
      ws.close();
      wsRef.current = null;
      setPhase("done");
      router.replace(`/session/${sid}`);
    } catch (err) {
      fail(
        err instanceof Error
          ? `Couldn't upload the recording (${err.message}).`
          : "Couldn't upload the recording.",
      );
    }
  };

  const handleCancel = async () => {
    cleanedUpRef.current = true;
    await teardownAudio();
    teardownWs();
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          onPress={handleCancel}
          style={styles.closeButton}
          accessibilityLabel="Close"
        >
          <Ionicons name="chevron-down" size={24} color="#cbd5e1" />
        </Pressable>
        <Text style={styles.headerTitle}>
          {phase === "preparing"
            ? "Starting…"
            : phase === "recording"
              ? "Recording"
              : phase === "uploading"
                ? "Uploading"
                : phase === "error"
                  ? "Problem"
                  : "Done"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <Animated.View
          style={[styles.pulse, { transform: [{ scale: pulse }] }]}
        >
          <View
            style={[
              styles.micCircle,
              phase === "error" && { backgroundColor: "#fca5a5" },
            ]}
          >
            {phase === "preparing" || phase === "uploading" ? (
              <ActivityIndicator color="#020617" />
            ) : (
              <Ionicons
                name={phase === "error" ? "alert" : "mic"}
                size={42}
                color="#020617"
              />
            )}
          </View>
        </Animated.View>

        <Text style={styles.timer}>{formatElapsed(elapsed)}</Text>
        <Text style={styles.hint}>
          {phase === "error"
            ? (error ?? "Something went wrong.")
            : phase === "uploading"
              ? "Sending the audio to Mila…"
              : "Mila is listening. Speak in any language — she'll tag who said what."}
        </Text>

        <ScrollView
          style={styles.transcriptScroll}
          contentContainerStyle={styles.transcriptContent}
        >
          {segments.length === 0 ? (
            <View style={styles.transcript}>
              <View style={styles.transcriptDot} />
              <Text style={styles.transcriptText}>
                Live transcript will appear here once Mila processes your first
                audio.
              </Text>
            </View>
          ) : (
            segments.map((segment) => (
              <View key={segment.id} style={styles.transcript}>
                <View style={styles.transcriptDot} />
                <Text style={styles.transcriptText}>
                  {segment.translatedText ||
                    segment.normalizedText ||
                    segment.originalText}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>

      <View style={styles.footer}>
        {phase === "error" ? (
          <Pressable
            onPress={handleCancel}
            style={({ pressed }) => [
              styles.stopButton,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.stopText}>Close</Text>
          </Pressable>
        ) : phase === "recording" ? (
          <Pressable
            onPress={() => void handleStop()}
            style={({ pressed }) => [
              styles.stopButton,
              pressed && { opacity: 0.85 },
            ]}
          >
            <View style={styles.stopSquare} />
            <Text style={styles.stopText}>
              {sessionId ? "Finish" : "Stop"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function waitForWsOpen(ws: WebSocket, timeoutMs = 5000): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) return Promise.resolve();
  if (ws.readyState !== WebSocket.CONNECTING) {
    return Promise.reject(new Error("Socket is closed."));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.onopen = null;
      reject(new Error("Socket open timeout."));
    }, timeoutMs);
    const previousOpen = ws.onopen;
    const previousError = ws.onerror;
    ws.onopen = (event) => {
      clearTimeout(timer);
      ws.onopen = previousOpen;
      ws.onerror = previousError;
      previousOpen?.call(ws, event);
      resolve();
    };
    ws.onerror = (event) => {
      clearTimeout(timer);
      ws.onopen = previousOpen;
      ws.onerror = previousError;
      previousError?.call(ws, event);
      reject(new Error("Socket connect failed."));
    };
  });
}

function inferMimeType(uri: string): string {
  if (uri.endsWith(".m4a") || uri.endsWith(".mp4")) return "audio/mp4";
  if (uri.endsWith(".caf")) return "audio/x-caf";
  if (uri.endsWith(".wav")) return "audio/wav";
  if (uri.endsWith(".webm")) return "audio/webm";
  return "audio/mp4";
}

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0a0d12" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeButton: {
    height: 40,
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "600" },
  body: { flex: 1, alignItems: "center", paddingHorizontal: 24, gap: 24, paddingTop: 40 },
  pulse: {
    height: 200,
    width: 200,
    borderRadius: 100,
    backgroundColor: "rgba(110, 231, 183, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  micCircle: {
    height: 130,
    width: 130,
    borderRadius: 65,
    backgroundColor: "#6ee7b7",
    alignItems: "center",
    justifyContent: "center",
  },
  timer: { color: "#fff", fontSize: 44, fontWeight: "300", letterSpacing: 2 },
  hint: { color: "#94a3b8", fontSize: 13, textAlign: "center", maxWidth: 280 },
  transcriptScroll: { width: "100%", marginTop: 8, flex: 1 },
  transcriptContent: { gap: 8, paddingBottom: 12 },
  transcript: {
    width: "100%",
    backgroundColor: "#0f141b",
    borderColor: "#1e293b",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  transcriptDot: {
    height: 8,
    width: 8,
    borderRadius: 4,
    backgroundColor: "#6ee7b7",
    marginTop: 5,
  },
  transcriptText: { color: "#cbd5e1", fontSize: 13, flex: 1, lineHeight: 19 },
  footer: { padding: 24 },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#fca5a5",
    paddingVertical: 16,
    borderRadius: 14,
  },
  stopSquare: { height: 12, width: 12, backgroundColor: "#7f1d1d", borderRadius: 2 },
  stopText: { color: "#7f1d1d", fontWeight: "700", fontSize: 16 },
});
