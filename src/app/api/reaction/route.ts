// POST /api/reaction
// Toggle a manager reaction stamp on a log entry

import { NextRequest, NextResponse } from "next/server";
import { toggleManagerReaction } from "@/lib/supabase";
import { getManagerByToken } from "@/lib/participant-db";

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

    // Validate reaction
    if (!ALLOWED_REACTIONS.includes(reaction)) {
      return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });
    }

    const result = await toggleManagerReaction(logEntryId, reaction);
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
