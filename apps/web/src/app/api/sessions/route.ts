import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  return proxyToApi("/api/sessions", { method: "GET" });
}

export async function POST(request: NextRequest) {
  return proxyToApi("/api/sessions", {
    method: "POST",
    body: await request.text(),
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
    },
  });
}

function getApiBaseUrl() {
  return process.env.MILA_API_INTERNAL_URL ?? "http://localhost:4000";
}

async function proxyToApi(path: string, init: RequestInit) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
  });
  const body = await response.text();

  return new NextResponse(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
