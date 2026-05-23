import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api";

interface User {
  id: string;
  email: string;
  name: string | null;
}

interface Session {
  token: string;
  user: User;
  expiresAt: string;
}

type Status = "loading" | "signed-in" | "signed-out";

interface SignInArgs {
  mode: "login" | "register";
  email: string;
  password: string;
  name?: string;
}

type SignInResult = { ok: true } | { ok: false; error: string };

interface AuthContextValue {
  status: Status;
  user: User | null;
  token: string | null;
  signIn: (args: SignInArgs) => Promise<SignInResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = "mila_session";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as Session;
            if (parsed.token && parsed.user?.id) {
              setSession(parsed);
              setStatus("signed-in");
              return;
            }
          } catch {
            // ignore
          }
        }
        setStatus("signed-out");
      })
      .catch(() => {
        if (!cancelled) setStatus("signed-out");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (args: SignInArgs): Promise<SignInResult> => {
    const endpoint = args.mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const body: Record<string, string> = { email: args.email, password: args.password };
    if (args.mode === "register" && args.name) body.name = args.name;
    try {
      const response = await apiFetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const fallback = args.mode === "login"
          ? "Invalid email or password."
          : "Could not create your account.";
        return { ok: false, error: await readError(response, fallback) };
      }
      const data = (await response.json()) as Session;
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(data));
      setSession(data);
      setStatus("signed-in");
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Network error",
      };
    }
  }, []);

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
    setSession(null);
    setStatus("signed-out");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      token: session?.token ?? null,
      signIn,
      signOut,
    }),
    [status, session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

async function readError(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(data.message)) return data.message.join(" ");
    if (typeof data.message === "string") return data.message;
  } catch {
    // ignore
  }
  return fallback;
}
