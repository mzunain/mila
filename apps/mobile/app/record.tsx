import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function RecordScreen() {
  const [recording, setRecording] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  useEffect(() => {
    if (!recording) {
      pulse.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.18,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [recording, pulse]);

  const handleStop = () => {
    setRecording(false);
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.closeButton}
          accessibilityLabel="Close"
        >
          <Ionicons name="chevron-down" size={24} color="#cbd5e1" />
        </Pressable>
        <Text style={styles.headerTitle}>Recording</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <Animated.View
          style={[styles.pulse, { transform: [{ scale: pulse }] }]}
        >
          <View style={styles.micCircle}>
            <Ionicons name="mic" size={42} color="#020617" />
          </View>
        </Animated.View>

        <Text style={styles.timer}>{formatElapsed(elapsed)}</Text>
        <Text style={styles.hint}>
          Mila is listening. Speak in any language — she&apos;ll tag who said what.
        </Text>

        <View style={styles.transcript}>
          <View style={styles.transcriptDot} />
          <Text style={styles.transcriptText}>
            Live transcript will appear here as you talk.
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={handleStop}
          style={({ pressed }) => [
            styles.stopButton,
            pressed && { opacity: 0.85 },
          ]}
        >
          <View style={styles.stopSquare} />
          <Text style={styles.stopText}>Finish</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0a0d12" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeButton: {
    height: 40,
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "600" },
  body: { flex: 1, alignItems: "center", paddingHorizontal: 24, gap: 24, paddingTop: 40 },
  pulse: {
    height: 200,
    width: 200,
    borderRadius: 100,
    backgroundColor: "rgba(110, 231, 183, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  micCircle: {
    height: 130,
    width: 130,
    borderRadius: 65,
    backgroundColor: "#6ee7b7",
    alignItems: "center",
    justifyContent: "center",
  },
  timer: { color: "#fff", fontSize: 44, fontWeight: "300", letterSpacing: 2 },
  hint: { color: "#94a3b8", fontSize: 13, textAlign: "center", maxWidth: 280 },
  transcript: {
    marginTop: 24,
    width: "100%",
    backgroundColor: "#0f141b",
    borderColor: "#1e293b",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  transcriptDot: {
    height: 8,
    width: 8,
    borderRadius: 4,
    backgroundColor: "#6ee7b7",
    marginTop: 5,
  },
  transcriptText: { color: "#94a3b8", fontSize: 13, flex: 1, lineHeight: 19 },
  footer: { padding: 24 },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#fca5a5",
    paddingVertical: 16,
    borderRadius: 14,
  },
  stopSquare: { height: 12, width: 12, backgroundColor: "#7f1d1d", borderRadius: 2 },
  stopText: { color: "#7f1d1d", fontWeight: "700", fontSize: 16 },
});
