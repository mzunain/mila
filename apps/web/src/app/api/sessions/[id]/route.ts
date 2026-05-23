import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-server";
import { getSession } from "@/lib/session";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const response = await apiFetch(`/api/sessions/${id}`, {
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
