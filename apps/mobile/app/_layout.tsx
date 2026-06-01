import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { initApi } from "@/lib/api";
import { AuthProvider } from "@/lib/auth-context";

export default function RootLayout() {
  const [apiReady, setApiReady] = useState(false);

  useEffect(() => {
    void initApi().finally(() => setApiReady(true));
  }, []);

  if (!apiReady) {
    return <View style={{ flex: 1, backgroundColor: "#0f1012" }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#0f1012" }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: "#0f1012" },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" options={{ presentation: "modal" }} />
            <Stack.Screen name="record" options={{ presentation: "modal" }} />
            <Stack.Screen name="session/[id]" />
            <Stack.Screen
              name="settings/api-url"
              options={{ presentation: "modal" }}
            />
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
