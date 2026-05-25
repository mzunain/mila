import type { ChatRequest, ChatResponse } from "@mila/shared";
import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const STARTER_PROMPTS = [
  "Summarise this week's customer calls",
  "What did Ayla say about pricing?",
  "Draft a follow-up from my last meeting",
  "What action items do I owe people?",
];

export default function ChatScreen() {
  const { token } = useAuth();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const userMessage: UiMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: trimmed,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setSending(true);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

    if (!token) {
      setError("Please sign in to chat with Mila.");
      setSending(false);
      return;
    }

    try {
      const payload: ChatRequest = {
        messages: nextMessages.map((m) => ({ role: m.role, content: m.text })),
      };
      const response = await apiFetch("/api/chat", {
        method: "POST",
        token,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`${response.status}`);
      const data = (await response.json()) as ChatResponse;
      setMessages((prev) => [
        ...prev,
        {
          id: data.message.id,
          role: "assistant",
          text: data.message.content,
        },
      ]);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      setError(
        err instanceof Error
          ? `Couldn't reach Mila (${err.message}).`
          : "Couldn't reach Mila.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ASK MILA</Text>
        <Text style={styles.title}>Chat</Text>
        <Text style={styles.subtitle}>
          Cross-meeting AI assistant — knows everything you&apos;ve discussed.
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
        >
          {messages.length === 0 ? (
            <View style={styles.starters}>
              <Text style={styles.startersTitle}>Try asking</Text>
              {STARTER_PROMPTS.map((prompt) => (
                <Pressable
                  key={prompt}
                  onPress={() => handleSend(prompt)}
                  style={({ pressed }) => [
                    styles.starterChip,
                    pressed && { backgroundColor: "#121822" },
                  ]}
                >
                  <Ionicons
                    name="sparkles-outline"
                    size={14}
                    color="#6ee7b7"
                  />
                  <Text style={styles.starterText}>{prompt}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.bubble,
                  message.role === "user"
                    ? styles.bubbleUser
                    : styles.bubbleAssistant,
                ]}
              >
                <Text
                  style={
                    message.role === "user"
                      ? styles.bubbleUserText
                      : styles.bubbleAssistantText
                  }
                >
                  {message.text}
                </Text>
              </View>
            ))
          )}
          {sending ? (
            <View style={[styles.bubble, styles.bubbleAssistant]}>
              <ActivityIndicator color="#6ee7b7" size="small" />
            </View>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask Mila…"
            placeholderTextColor="#475569"
            style={styles.input}
            multiline
            editable={!sending}
            onSubmitEditing={() => void handleSend(input)}
          />
          <Pressable
            onPress={() => void handleSend(input)}
            disabled={!input.trim() || sending}
            style={({ pressed }) => [
              styles.sendButton,
              (!input.trim() || pressed || sending) && { opacity: 0.6 },
            ]}
          >
            <Ionicons name="arrow-up" size={18} color="#020617" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0a0d12" },
  flex: { flex: 1 },
  header: { padding: 20, gap: 4 },
  eyebrow: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.5,
  },
  title: { color: "#fff", fontSize: 28, fontWeight: "700" },
  subtitle: { color: "#94a3b8", fontSize: 13, marginTop: 4 },
  scrollContent: { padding: 20, gap: 12 },
  starters: { gap: 8 },
  startersTitle: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 4,
  },
  starterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#0f141b",
    borderColor: "#1e293b",
    borderWidth: 1,
    borderRadius: 10,
  },
  starterText: { color: "#cbd5e1", fontSize: 14, flex: 1 },
  bubble: { maxWidth: "85%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(110, 231, 183, 0.15)",
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    alignSelf: "flex-start",
    backgroundColor: "#0f141b",
    borderColor: "#1e293b",
    borderWidth: 1,
    borderBottomLeftRadius: 4,
  },
  bubbleUserText: { color: "#d1fae5", fontSize: 14 },
  bubbleAssistantText: { color: "#e2e8f0", fontSize: 14, lineHeight: 20 },
  error: { color: "#fca5a5", fontSize: 12, textAlign: "center", marginTop: 8 },
  composer: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
    backgroundColor: "#0a0d12",
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    color: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 100,
    backgroundColor: "#0f141b",
    borderColor: "#1e293b",
    borderWidth: 1,
    borderRadius: 18,
    fontSize: 15,
  },
  sendButton: {
    height: 38,
    width: 38,
    borderRadius: 19,
    backgroundColor: "#6ee7b7",
    alignItems: "center",
    justifyContent: "center",
  },
});
