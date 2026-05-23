import type {
  ActionItem,
  MeetingNotes,
  MeetingSession,
  TranscriptSegment,
} from "@mila/shared";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface SessionDetailResponse {
  session: MeetingSession;
  segments: TranscriptSegment[];
  notes: MeetingNotes;
}

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const [detail, setDetail] = useState<SessionDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setError(null);
    try {
      const response = await apiFetch(`/api/sessions/${id}`, { token });
      if (response.status === 404) {
        setError("This session no longer exists.");
        return;
      }
      if (!response.ok) throw new Error(`${response.status}`);
      const data = (await response.json()) as SessionDetailResponse;
      setDetail(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Couldn't load this session (${err.message}).`
          : "Couldn't load this session.",
      );
    }
  }, [token, id]);

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
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={22} color="#cbd5e1" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {detail?.session.title || "Session"}
        </Text>
        <View style={styles.iconButton} />
      </View>

      {detail === null && !error ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#6ee7b7" />
        </View>
      ) : error ? (
        <View style={styles.error}>
          <Ionicons name="alert-circle-outline" size={28} color="#fca5a5" />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={onRefresh} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : detail ? (
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#6ee7b7"
            />
          }
        >
          <Text style={styles.title}>
            {detail.session.title || "Untitled session"}
          </Text>
          <Text style={styles.meta}>
            {new Date(detail.session.createdAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            {"  ·  "}
            {detail.session.outputLanguage.toUpperCase()}
            {"  ·  "}
            {detail.session.status}
          </Text>

          <Section title="Summary">
            <Text style={styles.body}>{detail.notes.summary}</Text>
          </Section>

          {detail.notes.keyPoints.length > 0 ? (
            <Section title="Key points">
              {detail.notes.keyPoints.map((point, index) => (
                <View key={`kp-${index}`} style={styles.bulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.itemText}>{point}</Text>
                </View>
              ))}
            </Section>
          ) : null}

          {detail.notes.actionItems.length > 0 ? (
            <Section title="Action items">
              {detail.notes.actionItems.map((item) => (
                <ActionItemRow key={item.id} item={item} />
              ))}
            </Section>
          ) : null}

          {detail.notes.decisions.length > 0 ? (
            <Section title="Decisions">
              {detail.notes.decisions.map((decision, index) => (
                <View key={`d-${index}`} style={styles.bulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.itemText}>{decision}</Text>
                </View>
              ))}
            </Section>
          ) : null}

          <Section title={`Transcript (${detail.segments.length})`}>
            {detail.segments.length === 0 ? (
              <Text style={styles.body}>
                No transcript yet — once audio is processed, segments will
                appear here.
              </Text>
            ) : (
              detail.segments.map((segment) => (
                <View key={segment.id} style={styles.segment}>
                  <Text style={styles.segmentMeta}>
                    {formatTimestamp(segment.startMs)}
                    {segment.speakerId ? `  ·  ${segment.speakerId}` : ""}
                  </Text>
                  <Text style={styles.segmentText}>
                    {segment.translatedText || segment.normalizedText || segment.originalText}
                  </Text>
                </View>
              ))
            )}
          </Section>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ActionItemRow({ item }: { item: ActionItem }) {
  const done = item.status === "done";
  return (
    <View style={styles.itemRow}>
      <Ionicons
        name={done ? "checkbox-outline" : "square-outline"}
        size={16}
        color={done ? "#6ee7b7" : "#94a3b8"}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.itemText, done && styles.itemDone]}>
          {item.text}
        </Text>
        {item.owner || item.due ? (
          <Text style={styles.itemMeta}>
            {[item.owner, item.due].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function formatTimestamp(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0a0d12" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomColor: "#1e293b",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: { height: 40, width: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "600", flex: 1, textAlign: "center" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 12 },
  errorText: { color: "#fca5a5", fontSize: 14, textAlign: "center" },
  retryButton: {
    marginTop: 8,
    backgroundColor: "#1e293b",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: "#e2e8f0", fontWeight: "600" },
  container: { padding: 20, gap: 20 },
  title: { color: "#fff", fontSize: 24, fontWeight: "700" },
  meta: { color: "#94a3b8", fontSize: 12 },
  section: { gap: 10 },
  sectionTitle: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
  body: { color: "#cbd5e1", fontSize: 14, lineHeight: 20 },
  bulletRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#6ee7b7",
    marginTop: 7,
  },
  itemRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  itemText: { color: "#e2e8f0", fontSize: 14, flex: 1, lineHeight: 20 },
  itemDone: { color: "#94a3b8", textDecorationLine: "line-through" },
  itemMeta: { color: "#64748b", fontSize: 11, marginTop: 2 },
  segment: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#0f141b",
    borderColor: "#1e293b",
    borderWidth: 1,
    borderRadius: 10,
    gap: 4,
  },
  segmentMeta: { color: "#64748b", fontSize: 11, fontVariant: ["tabular-nums"] },
  segmentText: { color: "#e2e8f0", fontSize: 14, lineHeight: 20 },
});
