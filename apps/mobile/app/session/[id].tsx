import type {
  ActionItem,
  LiveCoachCard,
  LiveMeetingCoach,
  MeetingNotes,
  MeetingSession,
  TranscriptSegment,
} from "@mila/shared";
import { buildLiveMeetingCoach, buildMeetingActionReview } from "@mila/shared";
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
  const actionReview = detail
    ? buildMeetingActionReview(detail.notes)
    : null;
  const liveCoach = detail
    ? buildLiveMeetingCoach({
        notes: detail.notes,
        segments: detail.segments,
        isLive: detail.session.status === "live",
      })
    : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={22} color="#f4f1ec" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {detail?.session.title || "Session"}
        </Text>
        <View style={styles.iconButton} />
      </View>

      {detail === null && !error ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#67e8f9" />
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
              tintColor="#67e8f9"
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

          {liveCoach ? <LiveCoach coach={liveCoach} /> : null}

          {actionReview ? <ActionCenter review={actionReview} /> : null}

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

function LiveCoach({ coach }: { coach: LiveMeetingCoach }) {
  return (
    <View style={styles.liveCoach}>
      <View style={styles.liveCoachHeader}>
        <View style={{ flex: 1 }}>
          <View style={styles.liveCoachTitleRow}>
            <Ionicons name="sparkles-outline" size={16} color="#67e8f9" />
            <Text style={styles.liveCoachTitle}>Live coach</Text>
          </View>
          <Text style={styles.liveCoachSubtitle}>{coach.headline}</Text>
        </View>
        <View
          style={[
            styles.liveCoachBadge,
            coach.state === "coaching" && styles.liveCoachBadgeGood,
            coach.state === "warming-up" && styles.liveCoachBadgeWarn,
          ]}
        >
          <Text style={styles.liveCoachBadgeText}>
            {formatLiveCoachState(coach.state)}
          </Text>
        </View>
      </View>

      <View style={styles.liveCoachMetrics}>
        {coach.metrics.map((metric) => (
          <View key={metric.id} style={styles.liveCoachMetric}>
            <Text
              style={[
                styles.liveCoachMetricValue,
                metric.tone === "good" && styles.metricGood,
                metric.tone === "warning" && styles.metricWarn,
              ]}
            >
              {metric.value}
            </Text>
            <Text style={styles.liveCoachMetricLabel}>{metric.label}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.liveCoachPrompt}>{coach.nextBestPrompt}</Text>

      {coach.cards.length > 0 ? (
        <View style={styles.liveCoachCards}>
          {coach.cards.slice(0, 3).map((card) => (
            <LiveCoachCardRow key={card.id} card={card} />
          ))}
        </View>
      ) : (
        <Text style={styles.liveCoachEmpty}>
          Coach prompts appear when Mila sees decisions, questions, owners, or
          deadlines worth tightening.
        </Text>
      )}
    </View>
  );
}

function LiveCoachCardRow({ card }: { card: LiveCoachCard }) {
  return (
    <View style={styles.liveCoachCardRow}>
      <View
        style={[
          styles.liveCoachCardIcon,
          card.tone === "warning" && styles.liveCoachCardIconWarn,
          card.tone === "good" && styles.liveCoachCardIconGood,
        ]}
      >
        <Ionicons
          name={liveCoachIconName(card.kind)}
          size={15}
          color={card.tone === "warning" ? "#ff9b7c" : "#67e8f9"}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.liveCoachCardTitle}>{card.title}</Text>
        <Text style={styles.liveCoachCardDetail} numberOfLines={2}>
          {card.detail}
        </Text>
        <Text style={styles.liveCoachCardAction}>{card.actionLabel}</Text>
      </View>
    </View>
  );
}

function ActionCenter({
  review,
}: {
  review: ReturnType<typeof buildMeetingActionReview>;
}) {
  return (
    <View style={styles.actionCenter}>
      <View style={styles.actionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.actionTitle}>Action center</Text>
          <Text style={styles.actionSubtitle}>{review.headline}</Text>
        </View>
        <View
          style={[
            styles.actionBadge,
            review.riskLevel === "clear" && styles.actionBadgeGood,
            review.riskLevel !== "clear" &&
              review.riskLevel !== "empty" &&
              styles.actionBadgeWarn,
          ]}
        >
          <Text style={styles.actionBadgeText}>
            {formatActionRisk(review.riskLevel)}
          </Text>
        </View>
      </View>

      <View style={styles.metricGrid}>
        {review.metrics.map((metric) => (
          <View key={metric.id} style={styles.metricCard}>
            <Text
              style={[
                styles.metricValue,
                metric.tone === "good" && styles.metricGood,
                metric.tone === "warning" && styles.metricWarn,
              ]}
            >
              {metric.value}
            </Text>
            <Text style={styles.metricLabel}>{metric.label}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.nextBest}>{review.nextBestAction}</Text>

      {review.topActions.length > 0 ? (
        <View style={styles.topActions}>
          {review.topActions.slice(0, 3).map((item) => (
            <View key={item.id} style={styles.topActionRow}>
              <Ionicons
                name={item.status === "done" ? "checkmark-circle" : "ellipse"}
                size={14}
                color={
                  item.overdue || item.missingOwner || item.missingDue
                    ? "#ff9b7c"
                    : "#67e8f9"
                }
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemText}>{item.text}</Text>
                <Text style={styles.itemMeta}>
                  {item.ownerLabel} · {item.dueLabel}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
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
        color={done ? "#67e8f9" : "#a6a29b"}
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

function formatActionRisk(
  risk: ReturnType<typeof buildMeetingActionReview>["riskLevel"],
) {
  switch (risk) {
    case "clear":
      return "Ready";
    case "empty":
      return "Watching";
    case "needs-owners":
      return "Owners";
    case "needs-dates":
      return "Dates";
    case "overloaded":
      return "Triage";
  }
}

function formatLiveCoachState(state: LiveMeetingCoach["state"]) {
  switch (state) {
    case "coaching":
      return "Live";
    case "review":
      return "Review";
    case "warming-up":
      return "Warming";
    case "empty":
    default:
      return "Waiting";
  }
}

function liveCoachIconName(
  kind: LiveCoachCard["kind"],
): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case "owner-check":
    case "participation":
      return "people-outline";
    case "date-check":
      return "calendar-outline";
    case "decision-check":
      return "checkmark-circle-outline";
    case "open-question":
      return "chatbubble-ellipses-outline";
    case "language-shift":
      return "language-outline";
    case "catch-up":
    default:
      return "sparkles-outline";
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0f1012" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomColor: "#2b2d33",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: { height: 40, width: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "600", flex: 1, textAlign: "center" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 12 },
  errorText: { color: "#fca5a5", fontSize: 14, textAlign: "center" },
  retryButton: {
    marginTop: 8,
    backgroundColor: "#2b2d33",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: "#e2e8f0", fontWeight: "600" },
  container: { padding: 20, gap: 20 },
  title: { color: "#fff", fontSize: 24, fontWeight: "700" },
  meta: { color: "#a6a29b", fontSize: 12 },
  liveCoach: {
    backgroundColor: "#18191e",
    borderColor: "rgba(103, 232, 249, 0.22)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  liveCoachHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  liveCoachTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  liveCoachTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  liveCoachSubtitle: {
    color: "#a6a29b",
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17,
  },
  liveCoachBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#24262d",
  },
  liveCoachBadgeGood: { backgroundColor: "rgba(103, 232, 249, 0.16)" },
  liveCoachBadgeWarn: { backgroundColor: "rgba(255, 155, 124, 0.14)" },
  liveCoachBadgeText: { color: "#f4f1ec", fontSize: 10, fontWeight: "700" },
  liveCoachMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  liveCoachMetric: {
    width: "47%",
    backgroundColor: "#101216",
    borderColor: "#2b2d33",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  liveCoachMetricValue: { color: "#fff", fontSize: 17, fontWeight: "700" },
  liveCoachMetricLabel: { color: "#a6a29b", fontSize: 10, marginTop: 2 },
  liveCoachPrompt: {
    color: "#e2e8f0",
    fontSize: 12,
    lineHeight: 17,
    backgroundColor: "rgba(103, 232, 249, 0.1)",
    borderRadius: 10,
    padding: 10,
  },
  liveCoachCards: { gap: 8 },
  liveCoachCardRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: "#101216",
    borderColor: "#2b2d33",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  liveCoachCardIcon: {
    height: 30,
    width: 30,
    borderRadius: 9,
    backgroundColor: "rgba(103, 232, 249, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  liveCoachCardIconGood: { backgroundColor: "rgba(103, 232, 249, 0.14)" },
  liveCoachCardIconWarn: { backgroundColor: "rgba(255, 155, 124, 0.14)" },
  liveCoachCardTitle: { color: "#fff", fontSize: 13, fontWeight: "700" },
  liveCoachCardDetail: {
    color: "#a6a29b",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  liveCoachCardAction: {
    alignSelf: "flex-start",
    color: "#67e8f9",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 6,
    textTransform: "uppercase",
  },
  liveCoachEmpty: {
    color: "#a6a29b",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#2b2d33",
    borderStyle: "dashed",
    borderRadius: 10,
    padding: 12,
  },
  actionCenter: {
    backgroundColor: "#18191e",
    borderColor: "rgba(103, 232, 249, 0.22)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  actionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  actionTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  actionSubtitle: { color: "#a6a29b", fontSize: 12, marginTop: 3, lineHeight: 17 },
  actionBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#24262d",
  },
  actionBadgeGood: { backgroundColor: "rgba(103, 232, 249, 0.16)" },
  actionBadgeWarn: { backgroundColor: "rgba(255, 155, 124, 0.14)" },
  actionBadgeText: { color: "#f4f1ec", fontSize: 10, fontWeight: "700" },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metricCard: {
    width: "47%",
    backgroundColor: "#101216",
    borderColor: "#2b2d33",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  metricValue: { color: "#fff", fontSize: 18, fontWeight: "700" },
  metricGood: { color: "#67e8f9" },
  metricWarn: { color: "#ff9b7c" },
  metricLabel: { color: "#a6a29b", fontSize: 11, marginTop: 2 },
  nextBest: {
    color: "#e2e8f0",
    fontSize: 12,
    lineHeight: 17,
    backgroundColor: "rgba(103, 232, 249, 0.1)",
    borderRadius: 10,
    padding: 10,
  },
  topActions: { gap: 8 },
  topActionRow: {
    flexDirection: "row",
    gap: 9,
    alignItems: "flex-start",
    backgroundColor: "#101216",
    borderRadius: 10,
    padding: 10,
  },
  section: { gap: 10 },
  sectionTitle: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
  body: { color: "#f4f1ec", fontSize: 14, lineHeight: 20 },
  bulletRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#67e8f9",
    marginTop: 7,
  },
  itemRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  itemText: { color: "#e2e8f0", fontSize: 14, flex: 1, lineHeight: 20 },
  itemDone: { color: "#a6a29b", textDecorationLine: "line-through" },
  itemMeta: { color: "#64748b", fontSize: 11, marginTop: 2 },
  segment: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#18191e",
    borderColor: "#2b2d33",
    borderWidth: 1,
    borderRadius: 10,
    gap: 4,
  },
  segmentMeta: { color: "#64748b", fontSize: 11, fontVariant: ["tabular-nums"] },
  segmentText: { color: "#e2e8f0", fontSize: 14, lineHeight: 20 },
});
