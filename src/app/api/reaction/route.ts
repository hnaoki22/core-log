// POST /api/reaction
// Toggle a manager reaction stamp on a log entry

import { NextRequest, NextResponse } from "next/server";
import { toggleManagerReaction } from "@/lib/supabase";
import { getManagerByToken } from "@/lib/participant-db";
import { standaloneGuard } from "@/lib/standalone";

const ALLOWED_REACTIONS = ["👍", "👏", "🔥", "💪", "❤️", "💡"];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, logEntryId, reaction } = body;

    if (!token || !logEntryId || !reaction) {
      return NextResponse.json(
        { error: "token, logEntryId, and reaction are required" },
        { status: 400 }
      );
    }

    // Verify manager token
    const manager = await getManagerByToken(token);
    if (!manager) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    if (!manager.tenantId) {
      return NextResponse.json({ error: "Tenant unresolved" }, { status: 500 });
    }

    // standalone §7-3: マネージャーのリアクションも介入経路のひとつ。機能ごと無効。
    const blocked = await standaloneGuard(manager.tenantId, "reaction");
    if (blocked) return blocked;

    // Validate reaction
    if (!ALLOWED_REACTIONS.includes(reaction)) {
      return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });
    }

    // Scope the toggle to the manager's tenant so reactions on logs from
    // other tenants are rejected (manager.tenantId comes from the verified
    // token lookup above).
    const result = await toggleManagerReaction(logEntryId, reaction, manager.tenantId);
    if (!result.success) {
      return NextResponse.json({ error: "Failed to update reaction" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      reactions: result.reactions,
    });
  } catch (error) {
    console.error("Reaction API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
