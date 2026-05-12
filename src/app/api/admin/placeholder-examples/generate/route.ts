// POST /api/admin/placeholder-examples/generate
// AI-powered placeholder example generation.
//
// Input:
//   token: string         — admin auth token
//   mvv: string           — client's Mission/Vision/Values
//   courseBooks: string    — course book titles and key concepts
//   dojoPhase: number|null — target dojo phase (null = universal)
//   groundRules?: string  — custom ground rules (optional, defaults to CORE)
//   count?: number        — examples per set (default 7)
//
// Output:
//   { success: true, generated: GeneratedExampleSet[], summary: string }
//
// The generated examples are automatically saved as drafts for the tenant.
// Admin can then review, edit, and approve via the main placeholder-examples endpoint.

import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_TENANT_ID,
  getManagerByTokenFromSupabase as getManagerByToken,
  getTenantBySlug,
} from "@/lib/supabase";
import { generatePlaceholderExamples } from "@/lib/llm";
import { saveDraftExamples, type StoredExampleSet } from "@/lib/placeholder-store";
import type { PhaseKey } from "@/lib/placeholder-examples";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, mvv, courseBooks, dojoPhase, groundRules, count } = body;

    // --- Auth ---
    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }
    const manager = await getManagerByToken(token);
    if (!manager || !manager.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // --- Validate inputs ---
    if (!mvv || typeof mvv !== "string" || mvv.trim().length === 0) {
      return NextResponse.json(
        { error: "mvv (ミッション・ビジョン・バリュー) is required" },
        { status: 400 }
      );
    }
    if (!courseBooks || typeof courseBooks !== "string" || courseBooks.trim().length === 0) {
      return NextResponse.json(
        { error: "courseBooks (課題図書情報) is required" },
        { status: 400 }
      );
    }

    // Resolve tenant
    const slug = request.nextUrl.searchParams.get("tenant");
    let tenantId = manager.tenantId || DEFAULT_TENANT_ID;
    if (manager.isAdmin && slug) {
      const t = await getTenantBySlug(slug);
      if (t) tenantId = t.id;
    }

    // --- Generate via LLM ---
    const result = await generatePlaceholderExamples({
      mvv: mvv.trim(),
      courseBooks: courseBooks.trim(),
      dojoPhase: dojoPhase != null ? Number(dojoPhase) : null,
      groundRules: groundRules?.trim() || undefined,
      count: count ? Number(count) : 7,
    });

    if (!result.sets || result.sets.length === 0) {
      return NextResponse.json(
        { error: "AI generation returned no results. Please try again." },
        { status: 500 }
      );
    }

    // Convert to StoredExampleSet format (ensure phase type matches)
    const drafts: StoredExampleSet[] = result.sets.map((s) => ({
      phase: (typeof s.phase === "number" ? s.phase : "universal") as PhaseKey,
      type: s.type as "morning" | "evening",
      examples: s.examples.map((e) => ({
        text: e.text,
        source: e.source,
      })),
    }));

    // Save as drafts
    const generationContext = `MVV: ${mvv.trim().slice(0, 200)}... | 課題図書: ${courseBooks.trim().slice(0, 200)}... | 道場: ${dojoPhase ?? "universal"} | 生成日: ${new Date().toISOString()}`;
    const saved = await saveDraftExamples(tenantId, drafts, generationContext);

    if (!saved) {
      // Generation succeeded but save failed — return the data so it's not lost
      return NextResponse.json({
        success: false,
        error: "Generated but failed to save as draft",
        generated: drafts,
        summary: result.summary,
      });
    }

    return NextResponse.json({
      success: true,
      generated: drafts,
      summary: result.summary,
    });
  } catch (err) {
    console.error("POST /api/admin/placeholder-examples/generate error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
