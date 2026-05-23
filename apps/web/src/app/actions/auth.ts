"use server";

import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api-server";
import { clearSessionCookie, setSessionCookie } from "@/lib/session";

export interface AuthFormState {
  error?: string;
  fieldErrors?: {
    email?: string;
    password?: string;
    name?: string;
  };
}

function readString(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function validateEmailPassword(email: string, password: string) {
  const fieldErrors: AuthFormState["fieldErrors"] = {};
  if (!email || !/.+@.+\..+/.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }
  if (!password || password.length < 8) {
    fieldErrors.password = "Password must be at least 8 characters.";
  }
  return fieldErrors;
}

export async function loginAction(
  _prev: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readString(formData, "email").toLowerCase();
  const password = readString(formData, "password");

  const fieldErrors = validateEmailPassword(email, password);
  if (Object.keys(fieldErrors).length) {
    return { fieldErrors };
  }

  const response = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const message = await safeMessage(response);
    return { error: message ?? "Invalid email or password." };
  }

  const data = (await response.json()) as {
    token: string;
    user: { id: string; email: string; name: string | null };
    expiresAt: string;
  };
  await setSessionCookie(data);
  redirect("/app");
}

export async function registerAction(
  _prev: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readString(formData, "email").toLowerCase();
  const password = readString(formData, "password");
  const name = readString(formData, "name");

  const fieldErrors = validateEmailPassword(email, password);
  if (!name || name.length < 2) {
    fieldErrors.name = "Display name must be at least 2 characters.";
  }
  if (Object.keys(fieldErrors).length) {
    return { fieldErrors };
  }

  const response = await apiFetch("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });

  if (!response.ok) {
    const message = await safeMessage(response);
    return { error: message ?? "Could not create your account." };
  }

  const data = (await response.json()) as {
    token: string;
    user: { id: string; email: string; name: string | null };
    expiresAt: string;
  };
  await setSessionCookie(data);
  redirect("/app");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/");
}

async function safeMessage(response: Response): Promise<string | null> {
  try {
    const data = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(data.message)) return data.message.join(" ");
    return typeof data.message === "string" ? data.message : null;
  } catch {
    return null;
  }
}
