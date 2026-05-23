import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";
import { getSession } from "@/lib/session";

export default async function RegisterPage() {
  const session = await getSession();
  if (session) redirect("/app");

  return (
    <AuthShell
      title="Create your Mila account"
      subtitle="Capture multilingual meetings with shared, searchable notes."
      footer={{
        prompt: "Already have an account?",
        href: "/login",
        label: "Sign in",
      }}
    >
      <RegisterForm />
    </AuthShell>
  );
}
