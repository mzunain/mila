import { redirect } from "next/navigation";
import { ChatView } from "@/components/chat-view";
import { SessionsShell } from "@/components/sessions-shell";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/app/chat");

  return (
    <SessionsShell user={session.user}>
      <div className="mila-content-bg flex h-full min-h-[calc(100vh-1px)] flex-col">
        <div className="border-b border-[var(--border)] px-6 py-5 lg:px-10">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="mila-eyebrow">
                Meeting memory
              </p>
              <h1 className="mt-1 text-3xl font-semibold leading-tight text-[var(--foreground)]">
                Ask Mila
              </h1>
              <p className="mila-muted mt-2 max-w-2xl text-sm leading-6">
                Search across transcripts, summaries, decisions, and action
                items from recent meetings.
              </p>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--accent-border)] bg-[var(--accent-faint)] px-3 py-1.5 text-xs font-medium text-[var(--accent)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              Chat ready
            </div>
          </div>
        </div>
        <ChatView token={session.token} />
      </div>
    </SessionsShell>
  );
}
