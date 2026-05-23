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
    <div className="mt-5 flex items-center gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
        <User size={16} aria-hidden />
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-medium text-white">
          {user.name ?? user.email.split("@")[0]}
        </div>
        <div className="truncate text-xs text-slate-400">{user.email}</div>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          className="rounded p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </form>
    </div>
  );
}
