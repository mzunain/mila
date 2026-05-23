import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";

export default function WorkspaceScreen() {
  const { user } = useAuth();

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
            <Ionicons name="mic" size={28} color="#020617" />
          </View>
          <Text style={styles.heroTitle}>Start a meeting</Text>
          <Text style={styles.heroSubtitle}>
            Tap to record. Mila listens, transcribes, and summarises in any
            language.
          </Text>
        </Pressable>

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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today</Text>
          <View style={styles.emptyState}>
            <Ionicons name="sparkles-outline" size={20} color="#6ee7b7" />
            <Text style={styles.emptyText}>
              No meetings yet today. Start one above when your call begins.
            </Text>
          </View>
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
      <Ionicons name={icon} size={20} color="#6ee7b7" />
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0a0d12" },
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
    backgroundColor: "#0f141b",
    borderRadius: 16,
    padding: 22,
    borderWidth: 1,
    borderColor: "rgba(110, 231, 183, 0.25)",
    gap: 10,
  },
  heroIcon: {
    alignSelf: "flex-start",
    backgroundColor: "#6ee7b7",
    height: 52,
    width: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "700" },
  heroSubtitle: { color: "#94a3b8", fontSize: 14, lineHeight: 20 },
  quickActions: { flexDirection: "row", gap: 10 },
  quickAction: {
    flex: 1,
    backgroundColor: "#0f141b",
    borderColor: "#1e293b",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    gap: 8,
  },
  quickActionLabel: { color: "#cbd5e1", fontSize: 12, fontWeight: "500" },
  section: { gap: 10 },
  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: "600" },
  emptyState: {
    backgroundColor: "rgba(110, 231, 183, 0.06)",
    borderColor: "rgba(110, 231, 183, 0.2)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  emptyText: { color: "#cbd5e1", fontSize: 13, flex: 1, lineHeight: 18 },
  tipCard: {
    backgroundColor: "#0f141b",
    borderColor: "#1e293b",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  tipTitle: { color: "#fff", fontSize: 14, fontWeight: "600" },
  tipBody: { color: "#94a3b8", fontSize: 13, lineHeight: 18 },
});
