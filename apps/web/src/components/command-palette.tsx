"use client";

import {
  Command,
  LayoutGrid,
  ListChecks,
  LogOut,
  Mic,
  Search,
  Settings2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { logoutAction } from "@/app/actions/auth";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
}

interface CommandAction {
  id: string;
  label: string;
  hint?: string;
  icon: typeof LayoutGrid;
  run: () => void | Promise<void>;
}

export function CommandPalette({
  open,
  onOpenChange,
  onClose,
}: CommandPaletteProps) {
  if (!open) return null;
  return (
    <CommandPaletteContent onOpenChange={onOpenChange} onClose={onClose} />
  );
}

function CommandPaletteContent({
  onOpenChange,
  onClose,
}: {
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const actions = useMemo<CommandAction[]>(
    () => [
      {
        id: "nav.workspace",
        label: "Go to Workspace",
        hint: "Live transcript + notes",
        icon: LayoutGrid,
        run: () => router.push("/app"),
      },
      {
        id: "nav.sessions",
        label: "Open Sessions",
        hint: "All meetings",
        icon: ListChecks,
        run: () => router.push("/app/sessions"),
      },
      {
        id: "nav.preferences",
        label: "Open Preferences",
        hint: "Settings, theme, API URL",
        icon: Settings2,
        run: () => router.push("/app/preferences"),
      },
      {
        id: "action.start-mic",
        label: "Start microphone",
        hint: "On the Workspace tab",
        icon: Mic,
        run: () => {
          router.push("/app");
          requestAnimationFrame(() => {
            const button = document.querySelector<HTMLButtonElement>(
              "[data-testid='start-mic']",
            );
            button?.focus();
            button?.click();
          });
        },
      },
      {
        id: "session.sign-out",
        label: "Sign out",
        icon: LogOut,
        run: async () => {
          await logoutAction();
        },
      },
    ],
    [router],
  );

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return actions;
    return actions.filter((action) =>
      `${action.label} ${action.hint ?? ""}`.toLowerCase().includes(trimmed),
    );
  }, [actions, query]);

  const safeHighlight = filtered.length
    ? Math.min(highlight, filtered.length - 1)
    : 0;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) =>
        filtered.length ? (current + 1) % filtered.length : 0,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) =>
        filtered.length
          ? (current - 1 + filtered.length) % filtered.length
          : 0,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const action = filtered[safeHighlight];
      if (action) {
        onOpenChange(false);
        void action.run();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[14vh]"
      role="dialog"
      aria-modal="true"
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        aria-label="Close command palette"
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="mila-surface-raised relative w-full max-w-xl overflow-hidden rounded-xl border shadow-2xl shadow-black/40">
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <Search size={16} className="text-[var(--muted-soft)]" />
          <input
            ref={(node) => {
              inputRef.current = node;
              node?.focus();
            }}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlight(0);
            }}
            placeholder="Type a command or search…"
            className="flex-1 bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-soft)]"
          />
          <span className="mila-chip inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium">
            <Command size={11} /> K
          </span>
        </div>

        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <li className="mila-muted px-4 py-6 text-center text-sm">
              No matching commands.
            </li>
          )}
          {filtered.map((action, index) => {
            const Icon = action.icon;
            const isActive = index === safeHighlight;
            return (
              <li key={action.id}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => {
                    onOpenChange(false);
                    void action.run();
                  }}
                  className={
                    isActive
                      ? "flex w-full items-center gap-3 bg-[var(--accent-faint)] px-4 py-2.5 text-left"
                      : "flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-white/[0.05]"
                  }
                >
                  <span className="mila-chip grid h-7 w-7 place-items-center rounded-md">
                    <Icon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--foreground)]">
                      {action.label}
                    </span>
                    {action.hint && (
                      <span className="mila-muted block truncate text-xs">
                        {action.hint}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mila-muted flex items-center justify-between border-t border-[var(--border)] px-4 py-2 text-[11px]">
          <span>↑↓ to navigate · ↵ to run · Esc to close</span>
          <span>Mila</span>
        </div>
      </div>
    </div>
  );
}
