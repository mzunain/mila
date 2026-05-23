"use client";

import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

interface MilaUpdateInfo {
  version?: string;
}

interface MilaBridge {
  installUpdateAndRestart: () => Promise<void>;
  onUpdateStatus: (
    cb: (status: string, info?: unknown) => void,
  ) => () => void;
}

declare global {
  interface Window {
    mila?: MilaBridge;
  }
}

export function UpdateBanner() {
  const [version, setVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const bridge = window.mila;
    if (!bridge) return;

    return bridge.onUpdateStatus((status, info) => {
      if (status === "downloaded") {
        const next = (info as MilaUpdateInfo | undefined)?.version ?? null;
        setVersion(next);
        setDismissed(false);
      }
    });
  }, []);

  if (!version || dismissed) return null;

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await window.mila?.installUpdateAndRestart();
    } catch {
      setInstalling(false);
    }
  };

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-3">
      <div className="flex items-center gap-3 rounded-full border border-emerald-300/30 bg-emerald-300/[0.08] px-4 py-2 text-sm text-emerald-100 shadow-lg backdrop-blur">
        <Download size={15} className="text-emerald-200" />
        <span>
          Mila {version} is ready
        </span>
        <button
          type="button"
          onClick={handleInstall}
          disabled={installing}
          className="rounded-full bg-emerald-300 px-3 py-1 text-xs font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:opacity-60"
        >
          {installing ? "Restarting…" : "Install now"}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-full p-1 text-emerald-200/70 transition hover:text-emerald-50"
          aria-label="Dismiss until next launch"
          title="Later"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
