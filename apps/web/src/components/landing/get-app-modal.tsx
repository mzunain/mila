"use client";

import { Apple, Check, Download, Monitor, Smartphone, X } from "lucide-react";
import { useEffect } from "react";

export type Platform = "mac" | "windows" | "ios" | "android";

interface GetAppModalProps {
  platform: Platform | null;
  onClose: () => void;
}

const DOWNLOAD_LINKS: Record<
  Platform,
  { primary: string; secondary?: string; primaryLabel?: string }
> = {
  mac: {
    primary: "https://github.com/mzunain/mila/releases/latest",
    primaryLabel: "Open macOS downloads",
  },
  windows: {
    primary: "https://github.com/mzunain/mila/releases/latest",
    primaryLabel: "Open Windows downloads",
  },
  ios: {
    primary: "https://github.com/mzunain/mila/releases/latest",
  },
  android: {
    primary: "https://github.com/mzunain/mila/releases/latest",
  },
};

export function GetAppModal({ platform, onClose }: GetAppModalProps) {
  useEffect(() => {
    if (!platform) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [platform, onClose]);

  if (!platform) return null;
  return <GetAppModalContent platform={platform} onClose={onClose} />;
}

function GetAppModalContent({
  platform,
  onClose,
}: {
  platform: Platform;
  onClose: () => void;
}) {
  const isMobile = platform === "ios" || platform === "android";
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      <button
        type="button"
        aria-label="Dismiss modal backdrop"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-lg border border-[#e2ded6] bg-[#fbfaf7] shadow-2xl shadow-black/30">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-md text-[#625f59] transition hover:bg-[#e6f8fb] hover:text-[#151411]"
          aria-label="Close download modal"
        >
          <X size={16} />
        </button>
        {isMobile ? (
          <MobileContent platform={platform} />
        ) : (
          <DesktopContent platform={platform} />
        )}
      </div>
    </div>
  );
}

function DesktopContent({ platform }: { platform: "mac" | "windows" }) {
  const Icon = platform === "mac" ? Apple : Monitor;
  const label = platform === "mac" ? "macOS" : "Windows";
  const fileNote =
    platform === "mac"
      ? "Choose the Apple silicon or Intel .dmg from the latest release"
      : "Windows builds will appear on the latest release when available";
  const links = DOWNLOAD_LINKS[platform];
  const primaryLabel = links.primaryLabel ?? "Download Mila";

  return (
    <div className="p-7">
      <div className="grid h-14 w-14 place-items-center rounded-md bg-[#e6f8fb] text-[#0e7490]">
        <Icon size={22} />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-[#151411]">
        Get Mila for {label}
      </h2>
      <p className="mt-2 text-sm text-[#625f59]">{fileNote}</p>

      <a
        href={links.primary}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#0e7490] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#155e75]"
      >
        <Download size={15} />
        {primaryLabel}
      </a>

      {links.secondary && (
        <a
          href={links.secondary}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 block text-center text-xs text-[#625f59] transition hover:text-[#0e7490]"
        >
          All releases & checksums →
        </a>
      )}

      <ul className="mt-6 space-y-2 border-t border-[#e2ded6] pt-5 text-xs text-[#625f59]">
        <li className="flex items-center gap-2">
          <Check size={12} className="text-[#0e7490]" />
          Captures system audio — no meeting bots
        </li>
        <li className="flex items-center gap-2">
          <Check size={12} className="text-[#0e7490]" />
          Auto-updates in the background
        </li>
        <li className="flex items-center gap-2">
          <Check size={12} className="text-[#0e7490]" />
          Connects to your local or hosted Mila backend
        </li>
      </ul>
    </div>
  );
}

function MobileContent({ platform }: { platform: "ios" | "android" }) {
  const label = platform === "ios" ? "iPhone" : "Android";
  const link = DOWNLOAD_LINKS[platform].primary;

  return (
    <div className="p-7">
      <div className="grid h-14 w-14 place-items-center rounded-md bg-[#e6f8fb] text-[#0e7490]">
        <Smartphone size={22} />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-[#151411]">
        Get Mila for {label}
      </h2>
      <p className="mt-2 text-sm text-[#625f59]">
        Mobile apps are not published yet. Use the desktop build or local web
        app while mobile packaging is in progress.
      </p>

      <a
        href={link}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#0e7490] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#155e75]"
      >
        <Download size={15} />
        Open desktop releases
      </a>
    </div>
  );
}
