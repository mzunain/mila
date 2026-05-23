"use client";

import { Apple, ArrowRight, Globe, Monitor, Smartphone } from "lucide-react";
import { useState } from "react";
import { GetAppModal, type Platform } from "./get-app-modal";

const platforms: Array<{
  id: Platform;
  name: string;
  tagline: string;
  cta: string;
  icon: typeof Apple;
}> = [
  {
    id: "mac",
    name: "macOS",
    tagline: "Native app · Apple silicon + Intel",
    cta: "Download .dmg",
    icon: Apple,
  },
  {
    id: "windows",
    name: "Windows",
    tagline: "Native app · Windows 10 & 11",
    cta: "Download .exe",
    icon: Monitor,
  },
  {
    id: "ios",
    name: "iPhone",
    tagline: "Capture meetings on the go",
    cta: "Get on App Store",
    icon: Smartphone,
  },
  {
    id: "android",
    name: "Android",
    tagline: "Capture meetings on the go",
    cta: "Get on Play Store",
    icon: Smartphone,
  },
];

interface PlatformGridProps {
  className?: string;
}

export function PlatformGrid({ className }: PlatformGridProps) {
  const [openFor, setOpenFor] = useState<Platform | null>(null);

  return (
    <div className={className}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {platforms.map((platform) => {
          const Icon = platform.icon;
          return (
            <button
              key={platform.id}
              type="button"
              onClick={() => setOpenFor(platform.id)}
              className="group flex flex-col items-start gap-3 rounded-xl border border-white/10 bg-[#0f141b] p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-400/40 hover:bg-[#121822]"
            >
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-emerald-300/20 to-cyan-400/20 text-emerald-200">
                <Icon size={18} />
              </span>
              <div>
                <div className="text-base font-semibold text-white">
                  {platform.name}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {platform.tagline}
                </div>
              </div>
              <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-300">
                {platform.cta}
                <ArrowRight size={11} className="transition group-hover:translate-x-0.5" />
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
        <Globe size={11} />
        Or use Mila in your browser — no install needed.
      </div>
      <GetAppModal platform={openFor} onClose={() => setOpenFor(null)} />
    </div>
  );
}
