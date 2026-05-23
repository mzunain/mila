"use client";

import { Apple, Check, Download, Mail, Monitor, QrCode, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";

export type Platform = "mac" | "windows" | "ios" | "android";

interface GetAppModalProps {
  platform: Platform | null;
  onClose: () => void;
}

const DOWNLOAD_LINKS: Record<Platform, { primary: string; secondary?: string }> = {
  mac: {
    primary: "https://github.com/mzunain/mila/releases/latest/download/Mila.dmg",
    secondary: "https://github.com/mzunain/mila/releases/latest",
  },
  windows: {
    primary: "https://github.com/mzunain/mila/releases/latest/download/Mila-Setup.exe",
    secondary: "https://github.com/mzunain/mila/releases/latest",
  },
  ios: {
    primary: "https://apps.apple.com/app/mila-meeting-notes",
  },
  android: {
    primary: "https://play.google.com/store/apps/details?id=app.mila.android",
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
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#101821] shadow-2xl shadow-black/50">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-md text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
          aria-label="Close"
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
      ? "Universal .dmg — works on Apple silicon & Intel"
      : ".exe installer — Windows 10 and 11";
  const links = DOWNLOAD_LINKS[platform];

  return (
    <div className="p-7">
      <div className="grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br from-emerald-300/20 to-cyan-400/20 text-emerald-200">
        <Icon size={22} />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-white">Get Mila for {label}</h2>
      <p className="mt-2 text-sm text-slate-400">{fileNote}</p>

      <a
        href={links.primary}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
      >
        <Download size={15} />
        Download Mila
      </a>

      {links.secondary && (
        <a
          href={links.secondary}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 block text-center text-xs text-slate-400 transition hover:text-white"
        >
          All releases & checksums →
        </a>
      )}

      <ul className="mt-6 space-y-2 border-t border-white/10 pt-5 text-xs text-slate-400">
        <li className="flex items-center gap-2">
          <Check size={12} className="text-emerald-300" />
          Captures system audio — no meeting bots
        </li>
        <li className="flex items-center gap-2">
          <Check size={12} className="text-emerald-300" />
          Auto-updates in the background
        </li>
        <li className="flex items-center gap-2">
          <Check size={12} className="text-emerald-300" />
          Works offline with on-device transcription
        </li>
      </ul>
    </div>
  );
}

function MobileContent({ platform }: { platform: "ios" | "android" }) {
  const label = platform === "ios" ? "iPhone" : "Android";
  const store = platform === "ios" ? "App Store" : "Play Store";
  const link = DOWNLOAD_LINKS[platform].primary;
  const [tab, setTab] = useState<"qr" | "email">("qr");
  const [email, setEmail] = useState("");
  const [emailed, setEmailed] = useState(false);

  return (
    <div className="p-7">
      <div className="grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br from-emerald-300/20 to-cyan-400/20 text-emerald-200">
        <Smartphone size={22} />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-white">Get Mila for {label}</h2>
      <p className="mt-2 text-sm text-slate-400">
        Scan the QR code, or send yourself a one-tap link.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
        <button
          type="button"
          onClick={() => setTab("qr")}
          className={
            tab === "qr"
              ? "flex items-center justify-center gap-1.5 rounded-md bg-white/[0.07] px-3 py-1.5 text-xs font-medium text-white"
              : "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:text-white"
          }
        >
          <QrCode size={12} /> QR code
        </button>
        <button
          type="button"
          onClick={() => setTab("email")}
          className={
            tab === "email"
              ? "flex items-center justify-center gap-1.5 rounded-md bg-white/[0.07] px-3 py-1.5 text-xs font-medium text-white"
              : "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:text-white"
          }
        >
          <Mail size={12} /> Email me a link
        </button>
      </div>

      {tab === "qr" ? (
        <div className="mt-5 grid place-items-center rounded-lg border border-white/10 bg-white/[0.03] px-6 py-8">
          <QrPlaceholder link={link} />
          <p className="mt-4 max-w-[16rem] text-center text-xs text-slate-400">
            Open your camera and point it at the code to install from the {store}.
          </p>
        </div>
      ) : (
        <form
          className="mt-5 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!email) return;
            setEmailed(true);
          }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-md border border-white/10 bg-[#0d131b] px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400"
          />
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
          >
            <Mail size={14} />
            {emailed ? "Sent — check your inbox" : "Send me the install link"}
          </button>
          <p className="text-center text-xs text-slate-500">
            We&apos;ll send one link, then forget your email.
          </p>
        </form>
      )}

      <a
        href={link}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-5 block text-center text-xs text-slate-400 transition hover:text-white"
      >
        Open the {store} →
      </a>
    </div>
  );
}

function QrPlaceholder({ link }: { link: string }) {
  // simple deterministic ASCII-style QR placeholder — visual filler until
  // a real QR generator (qrcode lib) is wired up
  const seed = Array.from(link).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const cells = Array.from({ length: 25 * 25 }, (_, index) => {
    const x = index % 25;
    const y = Math.floor(index / 25);
    const isCorner =
      (x < 7 && y < 7) || (x > 17 && y < 7) || (x < 7 && y > 17);
    const cornerOuter =
      isCorner && (x === 0 || x === 6 || x === 18 || x === 24 || y === 0 || y === 6 || y === 18 || y === 24);
    const cornerInner =
      isCorner && x >= 2 && x <= 4 && (y >= 2 && y <= 4);
    if (isCorner) {
      return cornerOuter || cornerInner;
    }
    return ((x * 31 + y * 17 + seed) % 7) % 2 === 0;
  });
  return (
    <div className="grid h-44 w-44 grid-cols-25 rounded-md bg-white p-2 shadow-inner" style={{ gridTemplateColumns: "repeat(25, 1fr)" }}>
      {cells.map((on, i) => (
        <div key={i} className={on ? "bg-slate-900" : "bg-white"} />
      ))}
    </div>
  );
}
