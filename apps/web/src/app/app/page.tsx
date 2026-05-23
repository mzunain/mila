import { redirect } from "next/navigation";
import { MeetingWorkspace } from "@/components/meeting-workspace";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/app");

  return (
    <MeetingWorkspace
      token={session.token}
      user={session.user}
    />
  );
}
