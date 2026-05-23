"use client";

import { LayoutGrid, ListChecks, MessageSquare, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/app", label: "Workspace", icon: LayoutGrid },
  { href: "/app/sessions", label: "Sessions", icon: ListChecks },
  { href: "/app/chat", label: "Chat", icon: MessageSquare },
  { href: "/app/preferences", label: "Preferences", icon: Settings2 },
] as const;

interface WorkspaceNavProps {
  className?: string;
}

export function WorkspaceNav({ className }: WorkspaceNavProps) {
  const pathname = usePathname() ?? "/app";

  return (
    <nav className={className}>
      <ul className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/app"
              ? pathname === "/app"
              : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={
                  active
                    ? "flex items-center gap-3 rounded-md bg-white/[0.07] px-3 py-2 text-sm font-medium text-white"
                    : "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
                }
              >
                <Icon size={16} aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
