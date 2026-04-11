// POST /api/features/pitch
// Accepts: { token, companyName, industry, challenges }
// Admin-only
// Calls generatePitchContent() from lib/llm.ts
// Returns generated pitch content

import { NextRequest, NextResponse } from "next/server";
import { getManagerByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { generatePitchContent } from "@/lib/llm";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, companyName, industry, challenges } = body;

    if (!token || !companyName || !industry || !challenges) {
      return NextResponse.json(
        { error: "Token, companyName, industry, and challenges are required" },
        { status: 400 }
      );
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabled("tier-g.pitchGenerator");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Pitch generator feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify admin/manager token
    const manager = await getManagerByTokenFromSupabase(token);
    if (!manager || !manager.isAdmin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Generate pitch content using LLM
    const pitchContent = await generatePitchContent(companyName, industry, challenges);

    return NextResponse.json({
      success: true,
      pitch: {
        companyName,
        industry,
        challenges,
        content: pitchContent,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Pitch generator error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
