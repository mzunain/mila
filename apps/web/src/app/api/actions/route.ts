import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  const response = await apiFetch("/api/sessions/actions/inbox", {
    token: session.token,
  });
  const body = await response.text();

  return new NextResponse(body, {
    status: response.status,
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "application/json",
    },
  });
}

function unauthorized() {
  return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
}
