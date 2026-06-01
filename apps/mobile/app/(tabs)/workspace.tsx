import {
  createAdHocBrief,
  type MeetingActionInbox,
  type MeetingSession,
  type MeetingSessionListItem,
} from "@mila/shared";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function WorkspaceScreen() {
  const { user, token } = useAuth();
  const [todaySessions, setTodaySessions] = useState<
    MeetingSessionListItem[] | null
  >(null);
  const [actionInbox, setActionInbox] = useState<MeetingActionInbox | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const brief = useMemo(() => createAdHocBrief(), []);
  const todayInsight = useMemo(
    () => (todaySessions ? buildTodayInsight(todaySessions) : null),
    [todaySessions],
  );

  const loadToday = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
      const response = await apiFetch("/api/sessions", { token });
      if (!response.ok) throw new Error(`${response.status}`);
      const all = (await response.json()) as MeetingSessionListItem[];
      setTodaySessions(all.filter(isFromToday));
      const inboxResponse = await apiFetch("/api/sessions/actions/inbox", {
        token,
      });
      setActionInbox(
        inboxResponse.ok
          ? ((await inboxResponse.json()) as MeetingActionInbox)
          : null,
      );
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "load failed");
      setTodaySessions([]);
      setActionInbox(null);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void loadToday();
    }, [loadToday]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>WORKSPACE</Text>
          <Text style={styles.greeting}>
            Hey{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
          </Text>
        </View>

        <Pressable
          onPress={() => router.push("/record")}
          style={({ pressed }) => [
            styles.heroCard,
            pressed && { transform: [{ scale: 0.985 }] },
          ]}
        >
          <View style={styles.heroIcon}>
            <Ionicons name="mic" size={28} color="#061113" />
          </View>
          <Text style={styles.heroTitle}>Start a meeting</Text>
          <Text style={styles.heroSubtitle}>
            Tap to record. Mila listens, transcribes, and summarises in any
            language.
          </Text>
        </Pressable>

        <View style={styles.briefCard}>
          <View style={styles.briefHeader}>
            <View style={styles.briefIcon}>
              <Ionicons name="sparkles-outline" size={18} color="#67e8f9" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.briefEyebrow}>MILA BRIEF</Text>
              <Text style={styles.briefTitle} numberOfLines={2}>
                {brief.headline}
              </Text>
            </View>
          </View>
          <View style={styles.briefList}>
            {brief.agendaQuestions.slice(0, 2).map((item) => (
              <View key={item.id} style={styles.briefPoint}>
                <View style={styles.briefDot} />
                <Text style={styles.briefPointText}>{item.text}</Text>
              </View>
            ))}
          </View>
          <Pressable
            onPress={() => router.push("/record")}
            style={({ pressed }) => [
              styles.briefButton,
              pressed && { opacity: 0.86 },
            ]}
          >
            <Ionicons name="mic-outline" size={16} color="#061113" />
            <Text style={styles.briefButtonText}>Start with brief</Text>
          </Pressable>
        </View>

        <ActionInboxCard inbox={actionInbox} />

        <View style={styles.quickActions}>
          <QuickAction
            icon="folder-open-outline"
            label="Recent"
            onPress={() => router.push("/(tabs)/sessions")}
          />
          <QuickAction
            icon="chatbubble-ellipses-outline"
            label="Ask Mila"
            onPress={() => router.push("/(tabs)/chat")}
          />
          <QuickAction
            icon="document-text-outline"
            label="Templates"
            onPress={() => router.push("/(tabs)/sessions?templates=1")}
          />
        </View>

        {todayInsight ? (
          <View style={styles.commandCard}>
            <View style={styles.commandHeader}>
              <Text style={styles.commandTitle}>Today command center</Text>
              <Text style={styles.commandBadge}>
                {todayInsight.total} session
                {todayInsight.total === 1 ? "" : "s"}
              </Text>
            </View>
            <View style={styles.commandMetrics}>
              <MiniMetric label="Live" value={todayInsight.live} />
              <MiniMetric label="Open" value={todayInsight.openActions} />
              <MiniMetric label="Auto" value={todayInsight.autoCaptured} />
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today</Text>
          {todaySessions === null ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color="#67e8f9" />
            </View>
          ) : todaySessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="sparkles-outline" size={20} color="#67e8f9" />
              <Text style={styles.emptyText}>
                {loadError
                  ? `Couldn't load today's meetings (${loadError}).`
                  : "No meetings yet today. Start one above when your call begins."}
              </Text>
            </View>
          ) : (
            <View style={styles.todayList}>
              {todaySessions.map((session) => (
                <Pressable
                  key={session.id}
                  onPress={() => router.push(`/session/${session.id}`)}
                  style={({ pressed }) => [
                    styles.todayRow,
                    pressed && { backgroundColor: "#121822" },
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: statusColor(session.status) },
                    ]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.todayTitle} numberOfLines={1}>
                      {session.title || "Untitled session"}
                    </Text>
                    <Text style={styles.todayMeta} numberOfLines={1}>
                      {formatTime(new Date(session.createdAt))}
                      {"  ·  "}
                      {session.outputLanguage.toUpperCase()}
                    </Text>
                    <Text style={styles.todaySignal} numberOfLines={1}>
                      {formatTodaySignal(session)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#475569" />
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tips</Text>
          <View style={styles.tipCard}>
            <Text style={styles.tipTitle}>Capture phone calls</Text>
            <Text style={styles.tipBody}>
              Add Mila as a participant on speakerphone, or start a meeting
              right after the call to dictate notes while it&apos;s fresh.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        pressed && { backgroundColor: "#121822" },
      ]}
    >
      <Ionicons name={icon} size={20} color="#67e8f9" />
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.miniMetric}>
      <Text style={styles.miniMetricValue}>{value}</Text>
      <Text style={styles.miniMetricLabel}>{label}</Text>
    </View>
  );
}

function ActionInboxCard({ inbox }: { inbox: MeetingActionInbox | null }) {
  const items = inbox?.items.slice(0, 3) ?? [];

  return (
    <View style={styles.actionInboxCard}>
      <View style={styles.actionInboxHeader}>
        <View>
          <Text style={styles.actionInboxEyebrow}>ACTION INBOX</Text>
          <Text style={styles.actionInboxTitle}>
            {inbox?.headline ?? "Follow-ups unavailable"}
          </Text>
        </View>
        <View style={styles.actionInboxBadge}>
          <Text style={styles.actionInboxBadgeText}>
            {inbox?.totalOpen ?? 0}
          </Text>
        </View>
      </View>
      <View style={styles.actionInboxMetrics}>
        <MiniMetric label="Owner" value={inbox?.missingOwner ?? 0} />
        <MiniMetric label="Due" value={inbox?.missingDue ?? 0} />
        <MiniMetric label="Late" value={inbox?.overdueActions ?? 0} />
      </View>
      {items.length > 0 ? (
        <View style={styles.actionInboxList}>
          {items.map((item) => (
            <Pressable
              key={`${item.sessionId}:${item.id}`}
              onPress={() => router.push(`/session/${item.sessionId}`)}
              style={({ pressed }) => [
                styles.actionInboxItem,
                pressed && { backgroundColor: "#121822" },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.actionInboxItemText} numberOfLines={2}>
                  {item.text}
                </Text>
                <Text style={styles.actionInboxItemMeta} numberOfLines={1}>
                  {item.sessionTitle} · {item.ownerLabel} · {item.dueLabel}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#67e8f9" />
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.actionInboxEmpty}>No open actions</Text>
      )}
    </View>
  );
}

function isFromToday(session: MeetingSessionListItem) {
  const created = new Date(session.createdAt);
  const now = new Date();
  return (
    created.getFullYear() === now.getFullYear() &&
    created.getMonth() === now.getMonth() &&
    created.getDate() === now.getDate()
  );
}

function buildTodayInsight(sessions: MeetingSessionListItem[]) {
  return {
    total: sessions.length,
    live: sessions.filter((session) => session.status === "live").length,
    openActions: sessions.reduce(
      (sum, session) => sum + (session.notesPreview?.actionStats.open ?? 0),
      0,
    ),
    autoCaptured: sessions.filter(
      (session) => session.autoStarted || session.externalMeeting,
    ).length,
  };
}

function statusColor(status: MeetingSession["status"]) {
  if (status === "live") return "#67e8f9";
  if (status === "processing") return "#fcd34d";
  if (status === "failed") return "#fca5a5";
  return "#a6a29b";
}

function formatTime(date: Date) {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTodaySignal(session: MeetingSessionListItem) {
  if (session.notesPreview) {
    return session.notesPreview.summary || session.notesPreview.actionStats.headline;
  }
  if (session.status === "live") return "Capturing now";
  if (session.status === "processing") return "Notes finalizing";
  if (session.status === "completed") return "Ready for review";
  if (session.status === "failed") return "Needs retry";
  return "Prep ready";
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0f1012" },
  container: { padding: 20, gap: 20 },
  header: { gap: 4 },
  eyebrow: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.5,
  },
  greeting: { color: "#fff", fontSize: 28, fontWeight: "700" },
  heroCard: {
    backgroundColor: "#18191e",
    borderRadius: 16,
    padding: 22,
    borderWidth: 1,
    borderColor: "rgba(103, 232, 249, 0.25)",
    gap: 10,
  },
  heroIcon: {
    alignSelf: "flex-start",
    backgroundColor: "#67e8f9",
    height: 52,
    width: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "700" },
  heroSubtitle: { color: "#a6a29b", fontSize: 14, lineHeight: 20 },
  briefCard: {
    backgroundColor: "rgba(103, 232, 249, 0.08)",
    borderColor: "rgba(103, 232, 249, 0.24)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  briefHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  briefIcon: {
    height: 36,
    width: 36,
    borderRadius: 10,
    backgroundColor: "rgba(103, 232, 249, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  briefEyebrow: {
    color: "#67e8f9",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  briefTitle: {
    color: "#f8fafc",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    marginTop: 3,
  },
  briefList: { gap: 8 },
  briefPoint: {
    flexDirection: "row",
    gap: 9,
    alignItems: "flex-start",
  },
  briefDot: {
    height: 5,
    width: 5,
    borderRadius: 3,
    backgroundColor: "#67e8f9",
    marginTop: 7,
  },
  briefPointText: {
    color: "#f4f1ec",
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  briefButton: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: "#67e8f9",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  briefButtonText: {
    color: "#061113",
    fontSize: 14,
    fontWeight: "700",
  },
  quickActions: { flexDirection: "row", gap: 10 },
  quickAction: {
    flex: 1,
    backgroundColor: "#18191e",
    borderColor: "#2b2d33",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    gap: 8,
  },
  quickActionLabel: { color: "#f4f1ec", fontSize: 12, fontWeight: "500" },
  commandCard: {
    backgroundColor: "#18191e",
    borderColor: "rgba(103, 232, 249, 0.22)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  commandHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  commandTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  commandBadge: {
    color: "#67e8f9",
    fontSize: 11,
    fontWeight: "700",
    backgroundColor: "rgba(103, 232, 249, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  commandMetrics: { flexDirection: "row", gap: 8 },
  miniMetric: {
    flex: 1,
    backgroundColor: "#101216",
    borderColor: "#2b2d33",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  miniMetricValue: { color: "#fff", fontSize: 18, fontWeight: "700" },
  miniMetricLabel: { color: "#a6a29b", fontSize: 11, marginTop: 2 },
  actionInboxCard: {
    backgroundColor: "#18191e",
    borderColor: "rgba(103, 232, 249, 0.22)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  actionInboxHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  actionInboxEyebrow: {
    color: "#67e8f9",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  actionInboxTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 3,
  },
  actionInboxBadge: {
    minWidth: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(103, 232, 249, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionInboxBadgeText: {
    color: "#67e8f9",
    fontSize: 16,
    fontWeight: "800",
  },
  actionInboxMetrics: { flexDirection: "row", gap: 8 },
  actionInboxList: { gap: 8 },
  actionInboxItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#2b2d33",
    borderRadius: 10,
    backgroundColor: "#101216",
    padding: 10,
  },
  actionInboxItemText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  actionInboxItemMeta: {
    color: "#a6a29b",
    fontSize: 11,
    marginTop: 4,
  },
  actionInboxEmpty: {
    color: "#a6a29b",
    fontSize: 12,
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#2b2d33",
    borderStyle: "dashed",
    borderRadius: 10,
    paddingVertical: 12,
  },
  section: { gap: 10 },
  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: "600" },
  loadingCard: {
    backgroundColor: "rgba(103, 232, 249, 0.06)",
    borderColor: "rgba(103, 232, 249, 0.2)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  emptyState: {
    backgroundColor: "rgba(103, 232, 249, 0.06)",
    borderColor: "rgba(103, 232, 249, 0.2)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  emptyText: { color: "#f4f1ec", fontSize: 13, flex: 1, lineHeight: 18 },
  todayList: { gap: 8 },
  todayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#18191e",
    borderColor: "#2b2d33",
    borderWidth: 1,
    borderRadius: 12,
  },
  statusDot: { height: 8, width: 8, borderRadius: 4 },
  todayTitle: { color: "#fff", fontSize: 14, fontWeight: "600" },
  todayMeta: { color: "#a6a29b", fontSize: 12, marginTop: 2 },
  todaySignal: {
    color: "#d7d3cb",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 5,
  },
  tipCard: {
    backgroundColor: "#18191e",
    borderColor: "#2b2d33",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  tipTitle: { color: "#fff", fontSize: 14, fontWeight: "600" },
  tipBody: { color: "#a6a29b", fontSize: 13, lineHeight: 18 },
});
