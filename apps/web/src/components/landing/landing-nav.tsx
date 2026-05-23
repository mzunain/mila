"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#download", label: "Download" },
  { href: "#pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
] as const;

interface LandingNavProps {
  signedIn: boolean;
}

export function LandingNav({ signedIn }: LandingNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0a0d12]/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-6">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight text-white">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-emerald-300 to-cyan-400 text-slate-950">
            M
          </span>
          Mila
        </Link>
        <nav className="hidden items-center gap-7 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-slate-400 transition hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          {signedIn ? (
            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
            >
              Open Mila
              <ArrowRight size={14} />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-slate-300 transition hover:text-white"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
              >
                Get Mila
              </Link>
            </>
          )}
        </div>
        <button
          type="button"
          className="md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <div className="border-t border-white/5 bg-[#0a0d12] md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/[0.04] hover:text-white"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-3 flex gap-2 border-t border-white/5 pt-3">
              {signedIn ? (
                <Link
                  href="/app"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-md bg-emerald-300 px-4 py-2.5 text-center text-sm font-semibold text-slate-950"
                >
                  Open Mila
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5 text-center text-sm font-medium text-white"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-md bg-emerald-300 px-4 py-2.5 text-center text-sm font-semibold text-slate-950"
                  >
                    Get Mila
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
