"use client";

import { useActionState } from "react";
import { registerAction, type AuthFormState } from "@/app/actions/auth";

const initialState: AuthFormState = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(
    registerAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Field
        id="name"
        label="Display name"
        type="text"
        autoComplete="name"
        error={state.fieldErrors?.name}
      />
      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        error={state.fieldErrors?.email}
      />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.password}
      />
      {state.error ? (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mila-primary w-full rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

interface FieldProps {
  id: string;
  label: string;
  type: string;
  autoComplete?: string;
  error?: string;
}

function Field({ id, label, type, autoComplete, error }: FieldProps) {
  return (
    <label htmlFor={id} className="block space-y-1.5">
      <span className="mila-eyebrow text-xs">
        {label}
      </span>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        required
        className="mila-focus w-full rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--foreground)] outline-none"
      />
      {error ? <span className="text-xs text-rose-300">{error}</span> : null}
    </label>
  );
}
