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
      <div className="flex items-center gap-3 rounded-full border border-[var(--accent-border)] bg-[var(--accent-faint)] px-4 py-2 text-sm text-[var(--foreground)] shadow-lg backdrop-blur">
        <Download size={15} className="text-[var(--accent)]" />
        <span>
          Mila {version} is ready
        </span>
        <button
          type="button"
          onClick={handleInstall}
          disabled={installing}
          className="mila-primary rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-60"
        >
          {installing ? "Restarting…" : "Install now"}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-full p-1 text-[var(--accent)]/70 transition hover:text-[var(--foreground)]"
          aria-label="Dismiss until next launch"
          title="Later"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
