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
      <div className="flex h-full min-h-[calc(100vh-1px)] flex-col">
        <div className="border-b border-white/10 px-8 py-6 lg:px-12">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Cross-meeting chat
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-white">
            Mila chat
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Ask anything about your recent meetings. Mila already knows the
            summaries, action items, and decisions — you just have to ask.
          </p>
        </div>
        <ChatView token={session.token} />
      </div>
    </SessionsShell>
  );
}
