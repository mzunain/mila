import type { MeetingSession, MeetingSessionListItem } from "@mila/shared";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

export default function SessionsScreen() {
  const { token } = useAuth();
  const [sessions, setSessions] = useState<MeetingSessionListItem[] | null>(
    null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const response = await apiFetch("/api/sessions", { token });
      if (!response.ok) throw new Error(`${response.status}`);
      const data = (await response.json()) as MeetingSessionListItem[];
      setSessions(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load your sessions.",
      );
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>HISTORY</Text>
        <Text style={styles.title}>Sessions</Text>
      </View>

      {sessions === null && !error ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#67e8f9" />
        </View>
      ) : sessions && sessions.length > 0 ? (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#67e8f9"
            />
          }
          renderItem={({ item }) => (
            <SessionRow session={item} onPress={() => router.push(`/session/${item.id}`)} />
          )}
        />
      ) : (
        <View style={styles.empty}>
          <Ionicons name="mic-outline" size={36} color="#67e8f9" />
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptyBody}>
            {error
              ? `Couldn't reach the server (${error}). Pull down to retry.`
              : "Start a meeting from the workspace tab — Mila will keep a history here."}
          </Text>
          <Pressable
            onPress={() => router.push("/record")}
            style={styles.emptyButton}
          >
            <Text style={styles.emptyButtonText}>Start a meeting</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function SessionRow({
  session,
  onPress,
}: {
  session: MeetingSessionListItem;
  onPress: () => void;
}) {
  const status = session.status;
  const statusColor =
    status === "live"
      ? "#67e8f9"
      : status === "processing"
        ? "#fcd34d"
        : status === "failed"
          ? "#fca5a5"
          : "#a6a29b";
  const preview = session.notesPreview;
  const summary =
    preview?.summary ||
    preview?.keyPoints[0] ||
    getSessionFallbackCopy(session);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
    >
      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {session.title || "Untitled session"}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {formatRelative(new Date(session.createdAt))} · {session.outputLanguage.toUpperCase()}
        </Text>
        <Text style={styles.rowSignal} numberOfLines={1}>
          {formatSessionOutcome(session)}
          {session.autoStarted || session.externalMeeting
            ? ` · ${session.externalMeeting ? formatProvider(session.externalMeeting.provider) : "Auto"}`
            : ""}
        </Text>
        <Text style={styles.rowSummary} numberOfLines={2}>
          {summary}
        </Text>
        {preview ? (
          <View style={styles.rowStats}>
            <SessionStat label="Open" value={preview.actionStats.open} />
            <SessionStat label="Decisions" value={preview.decisionCount} />
            <SessionStat
              label="Risk"
              value={formatRisk(preview.actionStats.riskLevel)}
            />
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#475569" />
    </Pressable>
  );
}

function SessionStat({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.sessionStat}>
      <Text style={styles.sessionStatValue}>{value}</Text>
      <Text style={styles.sessionStatLabel}>{label}</Text>
    </View>
  );
}

function formatRelative(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatSessionOutcome(session: MeetingSessionListItem) {
  if (session.status === "completed" && session.notesPreview) {
    return session.notesPreview.actionStats.headline;
  }

  switch (session.status) {
    case "live":
      return "Capturing now";
    case "processing":
      return "Notes finalizing";
    case "completed":
      return "Ready for follow-up";
    case "failed":
      return "Needs retry";
    case "scheduled":
      return "Prep brief ready";
  }
}

function getSessionFallbackCopy(session: MeetingSessionListItem) {
  switch (session.status) {
    case "live":
      return "Mila is capturing this conversation now.";
    case "processing":
      return "Notes are being finalized from the captured transcript.";
    case "completed":
      return "Open to review transcript, notes, and follow-ups.";
    case "failed":
      return "Capture ended with an issue. Open to inspect recovery options.";
    case "scheduled":
      return "Prep context is ready before the meeting starts.";
  }
}

function formatRisk(
  risk: NonNullable<MeetingSessionListItem["notesPreview"]>["actionStats"]["riskLevel"],
) {
  switch (risk) {
    case "empty":
      return "None";
    case "clear":
      return "Clear";
    case "needs-owners":
      return "Owners";
    case "needs-dates":
      return "Dates";
    case "overloaded":
      return "High";
  }
}

function formatProvider(provider: NonNullable<MeetingSession["externalMeeting"]>["provider"]) {
  const labels: Record<
    NonNullable<MeetingSession["externalMeeting"]>["provider"],
    string
  > = {
    "google-meet": "Meet",
    zoom: "Zoom",
    "microsoft-teams": "Teams",
    "slack-huddle": "Slack",
    "whatsapp-web": "WhatsApp",
    unknown: "Detected",
  };

  return labels[provider];
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0f1012" },
  header: { padding: 20, gap: 4 },
  eyebrow: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.5,
  },
  title: { color: "#fff", fontSize: 28, fontWeight: "700" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 20, gap: 8, paddingBottom: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#18191e",
    borderColor: "#2b2d33",
    borderWidth: 1,
    borderRadius: 12,
  },
  statusDot: { height: 8, width: 8, borderRadius: 4 },
  rowBody: { flex: 1, gap: 4 },
  rowTitle: { color: "#fff", fontSize: 15, fontWeight: "600" },
  rowMeta: { color: "#a6a29b", fontSize: 12 },
  rowSignal: { color: "#67e8f9", fontSize: 12, marginTop: 2 },
  rowSummary: {
    color: "#d7d3cb",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  rowStats: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  sessionStat: {
    minWidth: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2b2d33",
    backgroundColor: "#111217",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  sessionStatValue: { color: "#fff", fontSize: 13, fontWeight: "700" },
  sessionStatLabel: {
    color: "#a6a29b",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginTop: 1,
    textTransform: "uppercase",
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 12 },
  emptyTitle: { color: "#fff", fontSize: 18, fontWeight: "600" },
  emptyBody: {
    color: "#a6a29b",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 280,
  },
  emptyButton: {
    marginTop: 8,
    backgroundColor: "#67e8f9",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyButtonText: { color: "#061113", fontWeight: "700" },
});
