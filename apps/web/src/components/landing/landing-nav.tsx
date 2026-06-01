"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const navLinks = [
  { href: "#product", label: "Product" },
  { href: "#features", label: "Features" },
  { href: "#download", label: "Download" },
  { href: "#pricing", label: "Pricing" },
] as const;

interface LandingNavProps {
  signedIn: boolean;
}

export function LandingNav({ signedIn }: LandingNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[#e2ded6] bg-[#f7f4ef]/88 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-3 text-base font-semibold tracking-normal text-[#151411]"
        >
          <Image src="/mila-mark.svg" alt="" width={34} height={34} priority />
          <span>Mila</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-[#625f59] transition hover:text-[#0e7490]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {signedIn ? (
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-md bg-[#0e7490] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#155e75]"
            >
              Open Mila
              <ArrowRight size={14} />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-semibold text-[#34312d] transition hover:text-[#0e7490]"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-md bg-[#0e7490] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#155e75]"
              >
                Start free
                <ArrowRight size={14} />
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-md border border-[#c8d7d9] bg-white text-[#151411] md:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          {open ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-[#e2ded6] bg-[#f7f4ef] md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-6 py-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm font-medium text-[#625f59] transition hover:bg-white hover:text-[#0e7490]"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-3 flex gap-2 border-t border-[#e2ded6] pt-3">
              {signedIn ? (
                <Link
                  href="/app"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-md bg-[#0e7490] px-4 py-2.5 text-center text-sm font-semibold text-white"
                >
                  Open Mila
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-md border border-[#c8d7d9] bg-white px-4 py-2.5 text-center text-sm font-semibold text-[#151411]"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-md bg-[#0e7490] px-4 py-2.5 text-center text-sm font-semibold text-white"
                  >
                    Start free
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
