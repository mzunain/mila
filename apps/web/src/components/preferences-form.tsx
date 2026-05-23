"use client";

import { supportedLanguages } from "@mila/shared";
import { Check, Globe2, Link2, Monitor, Moon, Save, Sun } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Preferences,
  Theme,
  clearPreferences,
  savePreferences,
  usePreferences,
} from "@/lib/preferences";

const languageOptions = supportedLanguages.filter(
  (language) => language.code !== "unknown" && language.code !== "mixed",
);

export function PreferencesForm({ userEmail }: { userEmail: string }) {
  const { preferences: persisted, hydrated } = usePreferences();
  const [overrides, setOverrides] = useState<Partial<Preferences>>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const state: Preferences = useMemo(
    () => ({ ...persisted, ...overrides }),
    [persisted, overrides],
  );

  const isElectron = useMemo(() => {
    if (typeof window === "undefined") return false;
    return /electron/i.test(window.navigator.userAgent);
  }, []);

  const update = <K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ) => setOverrides((prev) => ({ ...prev, [key]: value }));

  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    savePreferences(state);
    setOverrides({});
    setSavedAt(Date.now());
  };

  const handleReset = () => {
    clearPreferences();
    setOverrides({});
    setSavedAt(Date.now());
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <Section
        title="Appearance"
        description="Pick the look that matches the rest of your tools."
      >
        <ThemePicker
          value={state.theme}
          onChange={(theme) => update("theme", theme)}
        />
      </Section>

      <Section
        title="Defaults"
        description="What Mila should reach for when you start something new."
      >
        <Field
          id="output-language"
          label="Default output language"
          hint="Mila will summarise meetings in this language unless you change it from the workspace."
        >
          <select
            id="output-language"
            value={state.outputLanguage}
            onChange={(event) => update("outputLanguage", event.target.value)}
            className="w-full max-w-sm rounded-md border border-white/10 bg-[#0d131b] px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
          >
            {languageOptions.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label} · {language.nativeLabel}
              </option>
            ))}
          </select>
        </Field>
        <Toggle
          id="shareable-links"
          label="Shareable links by default"
          description="Generated meeting summaries get a read-only link automatically."
          checked={state.shareableLinksDefault}
          onChange={(value) => update("shareableLinksDefault", value)}
        />
        {isElectron && (
          <Toggle
            id="auto-launch"
            label="Launch Mila when I sign in"
            description="The desktop app starts automatically with your operating system."
            checked={state.autoLaunch}
            onChange={(value) => update("autoLaunch", value)}
          />
        )}
      </Section>

      <Section
        title="Connection"
        description="Point Mila at your own deployment. Leave empty to use the default for this build."
      >
        <Field
          id="api-url"
          label="API base URL"
          hint="Example: https://mila-api.example.com"
          icon={Globe2}
        >
          <input
            id="api-url"
            type="url"
            inputMode="url"
            value={state.apiUrl}
            onChange={(event) => update("apiUrl", event.target.value)}
            placeholder="https://mila-api.example.com"
            className="w-full rounded-md border border-white/10 bg-[#0d131b] px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
          />
        </Field>
        <Field
          id="ws-url"
          label="Live updates WebSocket URL"
          hint="Example: wss://mila-api.example.com/meetings/live"
          icon={Link2}
        >
          <input
            id="ws-url"
            type="url"
            inputMode="url"
            value={state.wsUrl}
            onChange={(event) => update("wsUrl", event.target.value)}
            placeholder="wss://mila-api.example.com/meetings/live"
            className="w-full rounded-md border border-white/10 bg-[#0d131b] px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
          />
        </Field>
      </Section>

      <Section
        title="Account"
        description="Signed in to Mila with this email."
      >
        <div className="rounded-md border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
          {userEmail}
        </div>
      </Section>

      <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-5">
        <button
          type="button"
          onClick={handleReset}
          className="text-sm text-slate-400 transition hover:text-white"
        >
          Reset to defaults
        </button>
        <div className="flex items-center gap-3">
          {savedAt && hydrated && (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
              <Check size={13} />
              Saved
            </span>
          )}
          <button
            type="submit"
            disabled={!hydrated}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:opacity-60"
          >
            <Save size={15} />
            Save preferences
          </button>
        </div>
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-[#121922] p-6">
      <header className="mb-5">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </header>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  icon: Icon,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  icon?: typeof Globe2;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="flex items-center gap-2 text-sm font-medium text-slate-200"
      >
        {Icon && <Icon size={14} className="text-slate-500" />}
        {label}
      </label>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-slate-200">
          {label}
        </label>
        {description && (
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={
          checked
            ? "relative h-6 w-11 rounded-full bg-emerald-400/60 transition"
            : "relative h-6 w-11 rounded-full bg-white/10 transition"
        }
      >
        <span
          className={
            checked
              ? "absolute left-5 top-0.5 h-5 w-5 rounded-full bg-emerald-50 shadow transition"
              : "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-slate-200 shadow transition"
          }
        />
      </button>
    </div>
  );
}

function ThemePicker({
  value,
  onChange,
}: {
  value: Theme;
  onChange: (theme: Theme) => void;
}) {
  const options: { id: Theme; label: string; icon: typeof Moon }[] = [
    { id: "dark", label: "Dark", icon: Moon },
    { id: "light", label: "Light", icon: Sun },
    { id: "system", label: "System", icon: Monitor },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {options.map((option) => {
        const Icon = option.icon;
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={
              active
                ? "flex flex-col items-center gap-2 rounded-lg border-2 border-emerald-400/60 bg-white/[0.04] px-4 py-4 text-sm font-medium text-white"
                : "flex flex-col items-center gap-2 rounded-lg border-2 border-white/5 bg-white/[0.02] px-4 py-4 text-sm font-medium text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
            }
          >
            <Icon size={18} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
