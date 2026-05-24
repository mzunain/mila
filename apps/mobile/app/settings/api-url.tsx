import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  apiFetch,
  getApiBaseUrl,
  getDefaultApiBaseUrl,
  resetApiBaseUrl,
  setApiBaseUrl,
} from "@/lib/api";

type Status = "idle" | "saving" | "error" | "ok";

export default function ApiUrlScreen() {
  const [value, setValue] = useState(getApiBaseUrl());
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const handleSave = async () => {
    const url = value.trim();
    if (!isValidHttpUrl(url)) {
      setStatus("error");
      setMessage("Use a full URL like http://192.168.1.5:4000 or https://api.example.com");
      return;
    }
    setStatus("saving");
    setMessage(null);

    await setApiBaseUrl(url);

    try {
      const response = await apiFetch("/api/health");
      if (!response.ok) {
        setStatus("error");
        setMessage(`Saved, but /api/health returned ${response.status}.`);
        return;
      }
      setStatus("ok");
      setMessage("Saved and verified.");
      setTimeout(() => router.back(), 600);
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof Error
          ? `Saved, but couldn't reach the server: ${err.message}`
          : "Saved, but couldn't reach the server.",
      );
    }
  };

  const handleReset = async () => {
    await resetApiBaseUrl();
    setValue(getDefaultApiBaseUrl());
    setStatus("idle");
    setMessage("Reverted to the default.");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.iconButton}
          accessibilityLabel="Close"
        >
          <Ionicons name="chevron-down" size={24} color="#cbd5e1" />
        </Pressable>
        <Text style={styles.headerTitle}>API URL</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <View style={styles.body}>
          <Text style={styles.label}>Mila API base URL</Text>
          <TextInput
            value={value}
            onChangeText={(text) => {
              setValue(text);
              setStatus("idle");
              setMessage(null);
            }}
            placeholder="http://localhost:4000"
            placeholderTextColor="#475569"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
            editable={status !== "saving"}
          />
          <Text style={styles.hint}>
            Point the app at your own self-hosted backend. Default:{" "}
            {getDefaultApiBaseUrl()}
          </Text>

          {message ? (
            <Text
              style={[
                styles.message,
                status === "error"
                  ? styles.messageError
                  : status === "ok"
                    ? styles.messageOk
                    : styles.messageMuted,
              ]}
            >
              {message}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              onPress={() => void handleSave()}
              disabled={status === "saving"}
              style={({ pressed }) => [
                styles.primary,
                (pressed || status === "saving") && { opacity: 0.85 },
              ]}
            >
              {status === "saving" ? (
                <ActivityIndicator color="#020617" />
              ) : (
                <Text style={styles.primaryText}>Save & verify</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => void handleReset()}
              disabled={status === "saving"}
              style={({ pressed }) => [
                styles.secondary,
                pressed && { backgroundColor: "#121822" },
              ]}
            >
              <Text style={styles.secondaryText}>Reset to default</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function isValidHttpUrl(value: string) {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return Boolean(url.host);
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0a0d12" },
  flex: { flex: 1 },
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
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "600" },
  body: { flex: 1, padding: 20, gap: 12 },
  label: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
  input: {
    color: "#fff",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#0f141b",
    borderColor: "#1e293b",
    borderWidth: 1,
    borderRadius: 10,
  },
  hint: { color: "#94a3b8", fontSize: 12, lineHeight: 17 },
  message: { fontSize: 13, marginTop: 4 },
  messageError: { color: "#fca5a5" },
  messageOk: { color: "#6ee7b7" },
  messageMuted: { color: "#94a3b8" },
  actions: { gap: 10, marginTop: 12 },
  primary: {
    backgroundColor: "#6ee7b7",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: { color: "#020617", fontWeight: "700", fontSize: 15 },
  secondary: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderColor: "#1e293b",
    borderWidth: 1,
  },
  secondaryText: { color: "#cbd5e1", fontWeight: "600", fontSize: 14 },
});
