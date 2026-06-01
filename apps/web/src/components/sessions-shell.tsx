"use client";

import { Command } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AccountCard } from "./auth/account-card";
import { BrandLogo } from "./brand-logo";
import { CommandPalette } from "./command-palette";
import { WorkspaceNav } from "./workspace-nav";

interface SessionsShellProps {
  user: { id: string; email: string; name: string | null };
  children: React.ReactNode;
}

export function SessionsShell({ user, children }: SessionsShellProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  const closeCommandPalette = useCallback(() => setCommandOpen(false), []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((current) => !current);
      } else if (event.key === "Escape") {
        setCommandOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <main className="mila-app-bg min-h-screen lg:h-screen lg:overflow-hidden">
      <div className="grid min-h-screen grid-cols-1 lg:h-screen lg:min-h-0 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="mila-sidebar border-b px-5 pb-5 pt-[calc(1.25rem+var(--mila-window-top-offset))] lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <BrandLogo />
          <AccountCard user={user} />
          <WorkspaceNav className="mt-5" />
          <div className="mt-8 hidden lg:block">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="mila-secondary flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs transition"
            >
              <span>Quick actions</span>
              <span className="mila-chip inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]">
                <Command size={10} /> K
              </span>
            </button>
          </div>
        </aside>
        <section className="mila-content-bg min-w-0 lg:h-full lg:min-h-0 lg:overflow-y-auto">
          {children}
        </section>
      </div>
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onClose={closeCommandPalette}
      />
    </main>
  );
}
