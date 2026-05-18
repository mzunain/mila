import { NextRequest, NextResponse } from "next/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const response = await fetch(`${getApiBaseUrl()}/api/sessions/${id}`, {
    cache: "no-store",
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

function getApiBaseUrl() {
  return process.env.MILA_API_INTERNAL_URL ?? "http://localhost:4000";
}
