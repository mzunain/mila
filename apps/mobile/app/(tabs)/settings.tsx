import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiBaseUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const [apiUrl, setApiUrl] = useState(() => getApiBaseUrl());

  useFocusEffect(
    useCallback(() => {
      setApiUrl(getApiBaseUrl());
    }, []),
  );

  const handleSignOut = () => {
    Alert.alert("Sign out?", "You'll need to sign in again to access your sessions.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/login");
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>SETTINGS</Text>
          <Text style={styles.title}>Account</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.[0]?.toUpperCase() ?? user?.email[0].toUpperCase() ?? "?"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{user?.name ?? "Mila user"}</Text>
            <Text style={styles.cardSubtitle}>{user?.email}</Text>
          </View>
        </View>

        <Section title="Defaults">
          <Row
            icon="language-outline"
            label="Output language"
            value="English"
            onPress={() => {}}
          />
          <Row
            icon="link-outline"
            label="Shareable links by default"
            value="Off"
            onPress={() => {}}
          />
        </Section>

        <Section title="App">
          <Row
            icon="cloud-outline"
            label="API URL"
            value={formatHost(apiUrl)}
            onPress={() => router.push("/settings/api-url")}
          />
          <Row
            icon="notifications-outline"
            label="Push notifications"
            value="On"
            onPress={() => {}}
          />
        </Section>

        <Section title="About">
          <Row
            icon="document-text-outline"
            label="Privacy policy"
            onPress={() => Linking.openURL("https://mila.app/privacy")}
          />
          <Row
            icon="help-circle-outline"
            label="Help & support"
            onPress={() => Linking.openURL("mailto:hello@mila.app")}
          />
          <Row
            icon="information-circle-outline"
            label="Version"
            value="0.1.0"
          />
        </Section>

        <Pressable onPress={handleSignOut} style={styles.signOut}>
          <Ionicons name="log-out-outline" size={16} color="#fca5a5" />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatHost(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return url;
  }
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
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      style={({ pressed }: { pressed?: boolean }) => [
        styles.row,
        pressed && { backgroundColor: "#121822" },
      ]}
    >
      <Ionicons name={icon} size={18} color="#a6a29b" />
      <Text style={styles.rowLabel}>{label}</Text>
      {value && <Text style={styles.rowValue}>{value}</Text>}
      {onPress && <Ionicons name="chevron-forward" size={16} color="#475569" />}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0f1012" },
  container: { padding: 20, gap: 20, paddingBottom: 40 },
  header: { gap: 4 },
  eyebrow: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.5,
  },
  title: { color: "#fff", fontSize: 28, fontWeight: "700" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    backgroundColor: "#18191e",
    borderColor: "#2b2d33",
    borderWidth: 1,
    borderRadius: 14,
  },
  avatar: {
    height: 44,
    width: 44,
    borderRadius: 22,
    backgroundColor: "rgba(103, 232, 249, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#67e8f9", fontWeight: "700", fontSize: 18 },
  cardTitle: { color: "#fff", fontSize: 15, fontWeight: "600" },
  cardSubtitle: { color: "#a6a29b", fontSize: 13 },
  section: { gap: 10 },
  sectionTitle: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
    paddingLeft: 4,
  },
  sectionBody: {
    backgroundColor: "#18191e",
    borderColor: "#2b2d33",
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomColor: "#2b2d33",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { color: "#e2e8f0", fontSize: 14, flex: 1 },
  rowValue: { color: "#64748b", fontSize: 13 },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderColor: "rgba(252, 165, 165, 0.3)",
    borderWidth: 1,
    borderRadius: 12,
  },
  signOutText: { color: "#fca5a5", fontWeight: "600", fontSize: 14 },
});
