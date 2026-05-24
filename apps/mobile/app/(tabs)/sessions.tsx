import type { MeetingSession } from "@mila/shared";
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
  const [sessions, setSessions] = useState<MeetingSession[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const response = await apiFetch("/api/sessions", { token });
      if (!response.ok) throw new Error(`${response.status}`);
      const data = (await response.json()) as MeetingSession[];
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
          <ActivityIndicator color="#6ee7b7" />
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
              tintColor="#6ee7b7"
            />
          }
          renderItem={({ item }) => (
            <SessionRow session={item} onPress={() => router.push(`/session/${item.id}`)} />
          )}
        />
      ) : (
        <View style={styles.empty}>
          <Ionicons name="mic-outline" size={36} color="#6ee7b7" />
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
  session: MeetingSession;
  onPress: () => void;
}) {
  const status = session.status;
  const statusColor =
    status === "live"
      ? "#6ee7b7"
      : status === "processing"
        ? "#fcd34d"
        : status === "failed"
          ? "#fca5a5"
          : "#94a3b8";
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
      </View>
      <Ionicons name="chevron-forward" size={18} color="#475569" />
    </Pressable>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0a0d12" },
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
    backgroundColor: "#0f141b",
    borderColor: "#1e293b",
    borderWidth: 1,
    borderRadius: 12,
  },
  statusDot: { height: 8, width: 8, borderRadius: 4 },
  rowBody: { flex: 1, gap: 4 },
  rowTitle: { color: "#fff", fontSize: 15, fontWeight: "600" },
  rowMeta: { color: "#94a3b8", fontSize: 12 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 12 },
  emptyTitle: { color: "#fff", fontSize: 18, fontWeight: "600" },
  emptyBody: {
    color: "#94a3b8",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 280,
  },
  emptyButton: {
    marginTop: 8,
    backgroundColor: "#6ee7b7",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyButtonText: { color: "#020617", fontWeight: "700" },
});
