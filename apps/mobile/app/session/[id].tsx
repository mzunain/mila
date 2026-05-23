import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={22} color="#cbd5e1" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Session
        </Text>
        <Pressable style={styles.iconButton}>
          <Ionicons name="share-outline" size={20} color="#cbd5e1" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.id} numberOfLines={1}>
          {id}
        </Text>
        <Text style={styles.title}>Untitled session</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <Text style={styles.body}>
            Session details will load from the API once your account is connected.
            For now this preview shows the layout: summary, action items, and
            full transcript.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Action items</Text>
          <View style={styles.itemRow}>
            <Ionicons name="square-outline" size={16} color="#94a3b8" />
            <Text style={styles.itemText}>Draft customer-discovery template</Text>
          </View>
          <View style={styles.itemRow}>
            <Ionicons name="square-outline" size={16} color="#94a3b8" />
            <Text style={styles.itemText}>Share top 3 customer asks</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transcript</Text>
          <Text style={styles.body}>
            <Text style={styles.speaker}>You: </Text>
            Quick voice memo after the call — Mila will turn this into structured
            notes.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
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
  container: { padding: 20, gap: 20 },
  id: { color: "#475569", fontSize: 11, fontFamily: "Menlo" },
  title: { color: "#fff", fontSize: 24, fontWeight: "700" },
  section: { gap: 8 },
  sectionTitle: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
  body: { color: "#cbd5e1", fontSize: 14, lineHeight: 20 },
  itemRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  itemText: { color: "#e2e8f0", fontSize: 14, flex: 1 },
  speaker: { color: "#6ee7b7", fontWeight: "600" },
});
