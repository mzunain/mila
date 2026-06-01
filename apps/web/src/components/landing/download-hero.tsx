"use client";

import { Apple, ArrowRight, MonitorDown, Smartphone } from "lucide-react";
import { useState } from "react";
import { GetAppModal, type Platform } from "./get-app-modal";

export function DownloadHero() {
  const [openFor, setOpenFor] = useState<Platform | null>(null);

  return (
    <section className="bg-[#111417] py-20 text-white lg:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#22d3ee]">
              <MonitorDown size={14} />
              Get Mila
            </div>
            <h2 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
              Give every serious meeting a finished note before the next one starts.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#aeb8bd]">
              Install the desktop app for capture, use the web workspace for
              review, and keep the follow-up moving from your phone.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <button
              type="button"
              onClick={() => setOpenFor("mac")}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#22d3ee] px-5 py-3 text-sm font-semibold text-[#061113] transition hover:bg-[#8ff2fb]"
            >
              <Apple size={17} />
              Download for Mac
              <ArrowRight size={15} />
            </button>
            <button
              type="button"
              onClick={() => setOpenFor("ios")}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-white/15 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.1]"
            >
              <Smartphone size={17} />
              Get mobile app
            </button>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-6 text-sm text-[#aeb8bd]">
          <button
            type="button"
            onClick={() => setOpenFor("windows")}
            className="transition hover:text-white"
          >
            Windows installer
          </button>
          <button
            type="button"
            onClick={() => setOpenFor("android")}
            className="transition hover:text-white"
          >
            Android app
          </button>
          <a href="/app" className="transition hover:text-white">
            Continue in browser
          </a>
        </div>
      </div>
      <GetAppModal platform={openFor} onClose={() => setOpenFor(null)} />
    </section>
  );
}
