import { NextResponse } from "next/server";

export async function GET() {
  const response = await fetch(`${getApiBaseUrl()}/api/capabilities`, {
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

function getApiBaseUrl() {
  return process.env.MILA_API_INTERNAL_URL ?? "http://localhost:4000";
}
