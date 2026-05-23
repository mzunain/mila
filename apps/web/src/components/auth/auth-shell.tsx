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
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-white/5 bg-[#141923]/70 p-8 shadow-2xl backdrop-blur">
        <header className="flex flex-col items-center gap-3 text-center">
          <BrandLogo />
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            {title}
          </h1>
          <p className="text-sm text-slate-400">{subtitle}</p>
        </header>
        {children}
        <p className="text-center text-sm text-slate-400">
          {footer.prompt}{" "}
          <Link
            href={footer.href}
            className="font-medium text-emerald-300 hover:text-emerald-200"
          >
            {footer.label}
          </Link>
        </p>
      </div>
    </main>
  );
}
