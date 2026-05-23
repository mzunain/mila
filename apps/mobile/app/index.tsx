import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth-context";

export default function Index() {
  const { status } = useAuth();
  if (status === "loading") return null;
  if (status === "signed-out") return <Redirect href="/login" />;
  return <Redirect href="/(tabs)/workspace" />;
}
