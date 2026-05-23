import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  const response = await apiFetch("/api/capabilities", {
    token: session?.token,
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
