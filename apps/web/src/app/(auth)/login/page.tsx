import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { getSession } from "@/lib/session";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/app");

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue your multilingual meeting workspace."
      footer={{
        prompt: "New to Mila?",
        href: "/register",
        label: "Create an account",
      }}
    >
      <LoginForm />
    </AuthShell>
  );
}
