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
import { useAuth } from "@/lib/auth-context";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setBusy(true);
    const result = await signIn({
      mode,
      email: email.trim().toLowerCase(),
      password,
      name: name.trim() || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace("/(tabs)/workspace");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>M</Text>
          </View>
          <Text style={styles.brandName}>Mila</Text>
        </View>

        <Text style={styles.title}>
          {mode === "login" ? "Welcome back" : "Create your account"}
        </Text>
        <Text style={styles.subtitle}>
          Multilingual AI meeting notes in your pocket.
        </Text>

        {mode === "register" && (
          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor="#475569"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#475569"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="At least 8 characters"
            placeholderTextColor="#475569"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          onPress={handleSubmit}
          disabled={busy}
          style={({ pressed }) => [
            styles.primaryButton,
            (busy || pressed) && { opacity: 0.75 },
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#061113" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {mode === "login" ? "Sign in" : "Create account"}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => setMode((m) => (m === "login" ? "register" : "login"))}
        >
          <Text style={styles.switchMode}>
            {mode === "login"
              ? "New to Mila? Create an account"
              : "Already have an account? Sign in"}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0f1012" },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 24, gap: 16 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  logo: {
    height: 36,
    width: 36,
    borderRadius: 10,
    backgroundColor: "#67e8f9",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { color: "#061113", fontWeight: "700", fontSize: 18 },
  brandName: { color: "#fff", fontSize: 22, fontWeight: "600" },
  title: { color: "#fff", fontSize: 28, fontWeight: "700" },
  subtitle: { color: "#a6a29b", fontSize: 15, marginBottom: 12 },
  field: { gap: 6 },
  label: { color: "#f4f1ec", fontSize: 13, fontWeight: "500" },
  input: {
    backgroundColor: "#18191e",
    borderColor: "#2b2d33",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#fff",
    fontSize: 15,
  },
  error: { color: "#fca5a5", fontSize: 13 },
  primaryButton: {
    marginTop: 6,
    backgroundColor: "#67e8f9",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: { color: "#061113", fontSize: 15, fontWeight: "700" },
  switchMode: {
    color: "#a6a29b",
    textAlign: "center",
    marginTop: 18,
    fontSize: 13,
  },
});
