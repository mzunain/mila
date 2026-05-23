import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  const response = await apiFetch("/api/sessions", { token: session.token });
  return relay(response);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  const response = await apiFetch("/api/sessions", {
    method: "POST",
    token: session.token,
    body: await request.text(),
    headers: {
      "content-type":
        request.headers.get("content-type") ?? "application/json",
    },
  });
  return relay(response);
}

function unauthorized() {
  return NextResponse.json(
    { message: "Unauthorized" },
    { status: 401 },
  );
}

async function relay(response: Response) {
  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "application/json",
    },
  });
}
