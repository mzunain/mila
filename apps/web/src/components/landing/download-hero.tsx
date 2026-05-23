"use client";

import { Apple, ArrowRight, Smartphone } from "lucide-react";
import { useState } from "react";
import { GetAppModal, type Platform } from "./get-app-modal";

export function DownloadHero() {
  const [openFor, setOpenFor] = useState<Platform | null>(null);

  return (
    <section className="relative overflow-hidden py-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_50%_0%,rgba(52,211,153,0.18),transparent_70%)]" />
      <div className="relative mx-auto max-w-4xl px-6 text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Ready to never take meeting notes again?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-400">
          Free to use. Install on your laptop, then carry it with you on your phone.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => setOpenFor("mac")}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-300 px-6 py-3.5 text-base font-semibold text-slate-950 transition hover:bg-emerald-200 sm:w-auto"
          >
            <Apple size={18} />
            Download for Mac
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            onClick={() => setOpenFor("ios")}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-6 py-3.5 text-base font-semibold text-white transition hover:bg-white/[0.08] sm:w-auto"
          >
            <Smartphone size={18} />
            Get for iPhone
          </button>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500">
          <button type="button" onClick={() => setOpenFor("windows")} className="transition hover:text-white">
            Windows installer
          </button>
          <span>·</span>
          <button type="button" onClick={() => setOpenFor("android")} className="transition hover:text-white">
            Android (Play Store)
          </button>
          <span>·</span>
          <a href="/app" className="transition hover:text-white">
            Or use it in your browser
          </a>
        </div>
      </div>
      <GetAppModal platform={openFor} onClose={() => setOpenFor(null)} />
    </section>
  );
}
