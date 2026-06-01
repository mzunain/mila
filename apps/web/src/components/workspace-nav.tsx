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
                    ? "flex items-center gap-3 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-faint)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] shadow-[inset_3px_0_0_var(--accent)]"
                    : "mila-muted flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-white/[0.05] hover:text-[var(--foreground)]"
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
