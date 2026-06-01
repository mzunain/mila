"use client";

import { ShareLinkResponse } from "@mila/shared";
import { Check, Copy, Link2, Loader2, Share2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { copyTextToClipboard } from "@/lib/clipboard";
import { resolveApiUrl, usePreferences } from "@/lib/preferences";

interface ShareSessionButtonProps {
  sessionId: string | null;
  initialShareToken?: string | null;
  token: string;
  className?: string;
}

export function ShareSessionButton({
  sessionId,
  initialShareToken,
  token,
  className,
}: ShareSessionButtonProps) {
  const { preferences } = usePreferences();
  const apiBase = resolveApiUrl(preferences);
  const [open, setOpen] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(
    initialShareToken ?? null,
  );
  const [lastSessionId, setLastSessionId] = useState<string | null>(sessionId);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sessionId !== lastSessionId) {
    setLastSessionId(sessionId);
    setShareToken(initialShareToken ?? null);
  }

  const shareUrl =
    shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/share/${shareToken}`
      : null;

  const create = useCallback(async () => {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBase}/api/sessions/${sessionId}/share`,
        {
          method: "POST",
          headers: apiBase ? { authorization: `Bearer ${token}` } : {},
        },
      );
      if (!response.ok) {
        throw new Error("Could not create share link");
      }
      const data = (await response.json()) as ShareLinkResponse;
      setShareToken(data.shareToken);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create share link",
      );
    } finally {
      setBusy(false);
    }
  }, [apiBase, sessionId, token]);

  const revoke = useCallback(async () => {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBase}/api/sessions/${sessionId}/share`,
        {
          method: "DELETE",
          headers: apiBase ? { authorization: `Bearer ${token}` } : {},
        },
      );
      if (!response.ok && response.status !== 204) {
        throw new Error("Could not revoke share link");
      }
      setShareToken(null);
    } catch (revokeError) {
      setError(
        revokeError instanceof Error
          ? revokeError.message
          : "Could not revoke share link",
      );
    } finally {
      setBusy(false);
    }
  }, [apiBase, sessionId, token]);

  const copy = useCallback(async () => {
    if (!shareUrl) return;
    setError(null);
    const didCopy = await copyTextToClipboard(shareUrl);
    if (!didCopy) {
      setError("Clipboard access was blocked. Select the link and copy it manually.");
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, [shareUrl]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        disabled={!sessionId}
        onClick={() => setOpen(true)}
        className={
          className ??
          "mila-secondary inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
        }
        title={
          sessionId
            ? "Share this meeting via a public link"
            : "Start a session first to share it"
        }
      >
        <Share2 size={15} />
        <span>Share</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="mila-surface-raised w-full max-w-md rounded-2xl border p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--foreground)]">
                  <Link2 size={17} className="text-[var(--accent)]" />
                  Share this meeting
                </h2>
                <p className="mila-muted mt-1 text-sm">
                  Anyone with the link can view the summary, key points,
                  decisions, and action items. They cannot see the transcript.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-[var(--muted-soft)] transition hover:bg-white/[0.05] hover:text-[var(--foreground)]"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {shareUrl ? (
                <>
                  <div className="mila-focus flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2">
                    <Link2 size={14} className="shrink-0 text-[var(--muted-soft)]" />
                    <input
                      readOnly
                      value={shareUrl}
                      onFocus={(event) => event.currentTarget.select()}
                      className="min-w-0 flex-1 bg-transparent text-sm text-[var(--foreground)] outline-none"
                    />
                    <button
                      type="button"
                      onClick={copy}
                      className="mila-primary inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition"
                    >
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="mila-muted flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span>
                      Link active · Read-only public summary
                    </span>
                    <button
                      type="button"
                      onClick={revoke}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-md border border-red-400/30 bg-red-500/10 px-2.5 py-1 font-medium text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                    >
                      {busy ? <Loader2 size={12} className="animate-spin" /> : null}
                      Revoke link
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={create}
                  disabled={busy || !sessionId}
                  className="mila-primary flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Share2 size={15} />
                  )}
                  Create public link
                </button>
              )}

              {error && (
                <p className="rounded-md border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
