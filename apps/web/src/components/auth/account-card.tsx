"use client";

import { LogOut, User } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";

interface AccountCardProps {
  user: {
    name: string | null;
    email: string;
  };
}

export function AccountCard({ user }: AccountCardProps) {
  return (
    <div className="mila-surface-soft mt-5 flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-faint)] text-[var(--accent)]">
        <User size={16} aria-hidden />
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-medium text-[var(--foreground)]">
          {user.name ?? user.email.split("@")[0]}
        </div>
        <div className="mila-muted truncate text-xs">{user.email}</div>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          className="mila-muted rounded p-1.5 transition hover:bg-white/10 hover:text-[var(--foreground)]"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </form>
    </div>
  );
}
