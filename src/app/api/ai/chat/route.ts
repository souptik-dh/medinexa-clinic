import { NextRequest, NextResponse } from "next/server";
import { processMessage } from "@/lib/ai/orchestrator";
import { createConversation, getConversation, addMessageToConversation } from "@/lib/ai/conversation-store";
import type { AiUser, ChatRequest, ChatMessage } from "@/lib/ai/types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1";

function extractUserFromToken(request: NextRequest): AiUser | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return {
      id: payload.sub ?? payload.user_id ?? payload.id ?? "",
      name: payload.name ?? payload.email ?? "User",
      email: payload.email ?? "",
      role: payload.role ?? "clinic_owner",
      branchId: payload.branch_id ?? null,
      clinicId: payload.clinic_id ?? null,
      permissions: payload.permissions ?? [],
    };
  } catch {
    return null;
  }
}

async function enrichUserWithBackendData(
  user: AiUser,
  token: string
): Promise<AiUser> {
  const enriched = { ...user };

  // Try /branch-staff/me first (works for branch_staff; 403/401 for others)
  try {
    const res = await fetch(`${API_BASE}/branch-staff/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      enriched.branchId = data.branch?.id ?? enriched.branchId;
      enriched.clinicId = data.clinic?.id ?? enriched.clinicId;
      enriched.permissions = data.permissions ?? enriched.permissions;
      return enriched;
    }
  } catch {
    // Fall through to clinic_owner fallback
  }

  // For clinic_owner / sys_admin: fetch clinic list to get clinic_id
  if (user.role === "clinic_owner" || user.role === "sys_admin") {
    try {
      const res = await fetch(`${API_BASE}/clinics?limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        const clinic = data.items?.[0];
        if (clinic) {
          enriched.clinicId = clinic.id ?? enriched.clinicId;
          // First branch of first clinic as default context
          if (!enriched.branchId && clinic.branch_count > 0) {
            try {
              const bRes = await fetch(`${API_BASE}/clinics/${clinic.id}/branches?limit=1`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(5000),
              });
              if (bRes.ok) {
                const bData = await bRes.json();
                enriched.branchId = bData.items?.[0]?.id ?? enriched.branchId;
              }
            } catch {
              // Non-fatal
            }
          }
        }
      }
    } catch {
      // Non-fatal
    }
  }

  return enriched;
}

export async function POST(request: NextRequest) {
  try {
    const user = extractUserFromToken(request);
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

    const enrichedUser = await enrichUserWithBackendData(user, token);

    const body: ChatRequest = await request.json();

    if (!body.message || typeof body.message !== "string" || body.message.trim().length === 0) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Message is required" } },
        { status: 400 }
      );
    }

    if (body.message.length > 2000) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Message too long (max 2000 characters)" } },
        { status: 400 }
      );
    }

    let conversationId = body.conversationId;

    if (conversationId) {
      const existing = getConversation(conversationId);
      if (!existing || existing.userId !== enrichedUser.id) {
        conversationId = undefined;
      }
    }

    if (!conversationId) {
      const conv = createConversation(enrichedUser.id);
      conversationId = conv.id;
    }

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      role: "user",
      content: body.message.trim(),
      timestamp: Date.now(),
    };

    addMessageToConversation(conversationId, userMessage);

    const result = await processMessage(
      enrichedUser,
      body.message.trim(),
      conversationId,
      body.confirmationResponse,
      token
    );

    addMessageToConversation(result.newConversationId, result.response);

    return NextResponse.json({
      conversationId: result.newConversationId,
      message: result.response,
      steps: result.steps,
    });
  } catch (err) {
    console.error("[AI Chat] Error:", err);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred. Please try again.",
        },
      },
      { status: 500 }
    );
  }
}
