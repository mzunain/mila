"use client";

import { useActionState } from "react";
import { loginAction, type AuthFormState } from "@/app/actions/auth";

const initialState: AuthFormState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
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
        autoComplete="current-password"
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
        className="w-full rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Signing in…" : "Sign in"}
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
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        required
        className="w-full rounded-md border border-white/10 bg-[#0e1116] px-3 py-2 text-sm text-white outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
      />
      {error ? <span className="text-xs text-rose-300">{error}</span> : null}
    </label>
  );
}
