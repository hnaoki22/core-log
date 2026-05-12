// GET /api/placeholder-examples?token=xxx
// Returns approved placeholder examples for the participant's tenant.
// If no tenant-specific examples exist, returns null (client falls back to hardcoded defaults).

import { NextRequest, NextResponse } from "next/server";
import { getParticipantByTokenFromSupabase as getParticipantByToken } from "@/lib/supabase";
import { getApprovedExamples } from "@/lib/placeholder-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    const participant = await getParticipantByToken(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const tenantId = participant.tenantId;
    if (!tenantId) {
      // No tenant → no custom examples
      return NextResponse.json({ examples: null });
    }

    const approved = await getApprovedExamples(tenantId);
    return NextResponse.json({ examples: approved });
  } catch (err) {
    console.error("GET /api/placeholder-examples error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
