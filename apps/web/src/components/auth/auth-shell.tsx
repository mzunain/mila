import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";

interface AuthShellProps {
  title: string;
  subtitle: string;
  footer: { prompt: string; href: string; label: string };
  children: ReactNode;
}

export function AuthShell({ title, subtitle, footer, children }: AuthShellProps) {
  return (
    <main className="mila-app-bg flex min-h-screen items-center justify-center px-6 py-12">
      <div className="mila-surface-raised w-full max-w-md space-y-8 rounded-2xl border p-8 shadow-2xl backdrop-blur">
        <header className="flex flex-col items-center gap-3 text-center">
          <BrandLogo />
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
            {title}
          </h1>
          <p className="mila-muted text-sm">{subtitle}</p>
        </header>
        {children}
        <p className="mila-muted text-center text-sm">
          {footer.prompt}{" "}
          <Link
            href={footer.href}
            className="font-medium text-[var(--accent)] hover:text-[var(--foreground)]"
          >
            {footer.label}
          </Link>
        </p>
      </div>
    </main>
  );
}
