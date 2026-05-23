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
    <main className="min-h-screen bg-[#0e1116] text-slate-100">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[280px_1fr]">
        <aside className="border-b border-white/10 bg-[#101821] px-5 py-5 lg:border-b-0 lg:border-r">
          <BrandLogo />
          <AccountCard user={user} />
          <WorkspaceNav className="mt-5" />
          <div className="mt-8 hidden lg:block">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400 transition hover:bg-white/[0.07] hover:text-white"
            >
              <span>Quick actions</span>
              <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px]">
                <Command size={10} /> K
              </span>
            </button>
          </div>
        </aside>
        <section className="min-w-0">{children}</section>
      </div>
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onClose={closeCommandPalette}
      />
    </main>
  );
}
