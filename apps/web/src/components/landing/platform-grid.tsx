"use client";

import type { LucideIcon } from "lucide-react";
import { Apple, ArrowRight, Globe, Monitor, Smartphone } from "lucide-react";
import { useState } from "react";
import { GetAppModal, type Platform } from "./get-app-modal";

const platforms: Array<{
  id: Platform;
  name: string;
  tagline: string;
  cta: string;
  icon: LucideIcon;
}> = [
  {
    id: "mac",
    name: "macOS",
    tagline: "Native desktop capture for Apple silicon and Intel.",
    cta: "Download .dmg",
    icon: Apple,
  },
  {
    id: "windows",
    name: "Windows",
    tagline: "A focused app for Windows 10 and 11 workstations.",
    cta: "Download .exe",
    icon: Monitor,
  },
  {
    id: "ios",
    name: "iPhone",
    tagline: "Review notes, action items, and shared links on the go.",
    cta: "Get on App Store",
    icon: Smartphone,
  },
  {
    id: "android",
    name: "Android",
    tagline: "Carry the meeting memory with you after the call.",
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
              className="group flex min-h-[210px] flex-col items-start rounded-lg border border-[#e2ded6] bg-[#fbfaf7] p-5 text-left transition hover:-translate-y-0.5 hover:border-[#9dccd4] hover:shadow-xl hover:shadow-[#455a60]/10"
            >
              <span className="grid h-11 w-11 place-items-center rounded-md bg-[#e6f8fb] text-[#0e7490]">
                <Icon size={20} />
              </span>
              <div className="mt-5">
                <div className="text-lg font-semibold text-[#151411]">
                  {platform.name}
                </div>
                <div className="mt-2 text-sm leading-6 text-[#625f59]">
                  {platform.tagline}
                </div>
              </div>
              <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold text-[#0e7490]">
                {platform.cta}
                <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-5 flex items-center justify-center gap-2 text-sm text-[#667078]">
        <Globe size={14} />
        Browser access is available when installation is not an option.
      </div>
      <GetAppModal platform={openFor} onClose={() => setOpenFor(null)} />
    </div>
  );
}
