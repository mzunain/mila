import { redirect } from "next/navigation";
import { PreferencesForm } from "@/components/preferences-form";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/app/preferences");

  return <PreferencesForm user={session.user} />;
}
