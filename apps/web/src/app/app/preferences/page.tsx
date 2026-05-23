import { redirect } from "next/navigation";
import { PreferencesForm } from "@/components/preferences-form";
import { SessionsShell } from "@/components/sessions-shell";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/app/preferences");

  return (
    <SessionsShell user={session.user}>
      <div className="px-8 py-10 lg:px-12">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Settings
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-white">
            Preferences
          </h1>
          <p className="mt-2 max-w-xl text-sm text-slate-400">
            Tune Mila for your workflow. Connection settings only apply to this
            browser or desktop install — they are stored locally.
          </p>
        </div>
        <PreferencesForm userEmail={session.user.email} />
      </div>
    </SessionsShell>
  );
}
