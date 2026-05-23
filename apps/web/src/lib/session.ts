import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

const SESSION_COOKIE = "mila_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

export interface Session {
  token: string;
  user: SessionUser;
  expiresAt: string;
}

export async function setSessionCookie(session: Session) {
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE,
    value: JSON.stringify(session),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export const getSession = cache(async (): Promise<Session | null> => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.token || !parsed.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
});

export async function getSessionTokenOrThrow(): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  return session.token;
}

export function sessionCookieName() {
  return SESSION_COOKIE;
}
