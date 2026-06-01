import { NextRequest, NextResponse } from "next/server";
import type { ChatResponse } from "@mila/shared";
import { randomUUID } from "node:crypto";
import { apiFetch } from "@/lib/api-server";
import { getSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.text();
  const headers = {
    "content-type": request.headers.get("content-type") ?? "application/json",
  };

  try {
    const response = await apiFetch("/api/chat", {
      method: "POST",
      token: session.token,
      body,
      headers,
    });

    const responseBody = await response.text();
    if (response.ok || response.status === 401 || response.status === 403) {
      return new NextResponse(responseBody, {
        status: response.status,
        headers: {
          "content-type":
            response.headers.get("content-type") ?? "application/json",
        },
      });
    }

    return NextResponse.json(buildServiceUnavailableReply(response.status));
  } catch {
    return NextResponse.json(buildServiceUnavailableReply());
  }
}

function buildServiceUnavailableReply(status?: number): ChatResponse {
  const suffix = status ? ` (${status})` : "";
  return {
    message: {
      id: randomUUID(),
      role: "assistant",
      createdAt: new Date().toISOString(),
      content: `I cannot reach Mila meeting memory right now${suffix}. Your workspace and notes are still available, but chat answers need the API connection to be online. Check the API connection in Preferences, then try again.`,
    },
  };
}
