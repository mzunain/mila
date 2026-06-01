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
  const response = await apiFetch(`/api/sessions/${id}/share`, {
    method: "POST",
    token: session.token,
  });

  return relay(response);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await context.params;
  const response = await apiFetch(`/api/sessions/${id}/share`, {
    method: "DELETE",
    token: session.token,
  });

  return relay(response);
}

function unauthorized() {
  return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
}

async function relay(response: Response) {
  const body = response.status === 204 ? null : await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "application/json",
    },
  });
}
