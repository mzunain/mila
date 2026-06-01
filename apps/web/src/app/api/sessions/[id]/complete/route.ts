import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-server";
import { getSession } from "@/lib/session";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await context.params;
  const response = await apiFetch(`/api/sessions/${id}/complete`, {
    method: "POST",
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
