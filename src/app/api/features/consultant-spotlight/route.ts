// GET /api/features/consultant-spotlight?token=xxx[&tenant=slug]
// Returns "top participants to watch this week" for the consultant.
// Requires admin or observer role.
//
// POST /api/features/consultant-spotlight
// { token, tenant?: slug }
// Force-generates a fresh spotlight analysis for the given tenant.

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getManagerByTokenFromSupabase, getAllLogsForTenant } from "@/lib/supabase";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { resolveAdminTenantContext } from "@/lib/tenant-context";
import {
  generateConsultantSpotlight,
  analyzeReflectionDepth,
  type ConsultantSpotlightResult,
  type ReflectionDepthResult,
} from "@/lib/llm";

const FEATURE_KEY = "tier-a.consultantSpotlight";

// Helper: collect recent logs per participant (last 7 days)
function getRecentLogsPerParticipant(
  logMap: Map<string, { date: string; morningIntent: string; eveningInsight: string | null; energy: string | null; participantName: string }[]>,
  days: number = 7
) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const result: {
    name: string;
    department: string;
    logs: { date: string; morning: string; evening: string; energy: string | null }[];
  }[] = [];

  for (const [name, logs] of Array.from(logMap.entries())) {
    const recentLogs = logs
      .filter((l) => l.date >= cutoffStr)
      .map((l) => ({
        date: l.date,
        morning: l.morningIntent || "",
        evening: l.eveningInsight || "",
        energy: l.energy,
      }));
    if (recentLogs.length > 0) {
      result.push({ name, department: "", logs: recentLogs });
    }
  }
  return result;
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";
    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabled(FEATURE_KEY);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Consultant spotlight feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify admin/observer
    const manager = await getManagerByTokenFromSupabase(token);
    if (!manager) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantCtx = await resolveAdminTenantContext(req, manager);

    // Fetch cached spotlight from DB (less than 24h old)
    const client = getClient();
    let query = client
      .from("consultant_spotlights")
      .select("*")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (tenantCtx.tenantId) {
      query = query.eq("tenant_id", tenantCtx.tenantId);
    }

    const { data: cached } = await query.maybeSingle();

    if (cached) {
      return NextResponse.json({
        success: true,
        spotlight: cached.spotlight_data,
        depthAnalyses: cached.depth_analyses || [],
        generatedAt: cached.created_at,
        cached: true,
      });
    }

    // No recent cache â generate fresh
    return generateAndStore(req, manager, tenantCtx);
  } catch (error) {
    console.error("Consultant spotlight GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabled(FEATURE_KEY);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Consultant spotlight feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify admin/observer
    const manager = await getManagerByTokenFromSupabase(token);
    if (!manager) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantCtx = await resolveAdminTenantContext(req, manager);
    return generateAndStore(req, manager, tenantCtx);
  } catch (error) {
    console.error("Consultant spotlight POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function generateAndStore(
  _req: NextRequest,
  manager: { tenantId: string; id: string },
  tenantCtx: { tenantId: string | null }
) {
  const effectiveTenantId = tenantCtx.tenantId || manager.tenantId;

  // Fetch all logs for the tenant
  const logMap = await getAllLogsForTenant(effectiveTenantId);
  const participantSummaries = getRecentLogsPerParticipant(logMap);

  if (participantSummaries.length === 0) {
    return NextResponse.json({
      success: true,
      spotlight: { spotlight: [], orgPulse: "ã­ã°ãããã¾ãã", weekSummary: "åæå¯¾è±¡ã®ã­ã°ãããã¾ãã" },
      depthAnalyses: [],
      generatedAt: new Date().toISOString(),
      cached: false,
    });
  }

  // Run spotlight analysis
  const spotlightResult: ConsultantSpotlightResult =
    await generateConsultantSpotlight(participantSummaries);

  // Run per-participant reflection depth analysis (for spotlight participants only)
  const depthAnalyses: (ReflectionDepthResult & { name: string })[] = [];
  for (const sp of spotlightResult.spotlight) {
    const pSummary = participantSummaries.find((p) => p.name === sp.name);
    if (pSummary && pSummary.logs.length > 0) {
      const depth = await analyzeReflectionDepth(sp.name, pSummary.logs);
      depthAnalyses.push({ ...depth, name: sp.name });
    }
  }

  // Store in DB
  const client = getClient();
  const { data, error } = await client
    .from("consultant_spotlights")
    .insert({
      tenant_id: effectiveTenantId,
      generated_by: manager.id,
      spotlight_data: spotlightResult,
      depth_analyses: depthAnalyses,
      participant_count: participantSummaries.length,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to store spotlight:", error);
    // Return the analysis even if storage fails
  }

  return NextResponse.json({
    success: true,
    spotlight: spotlightResult,
    depthAnalyses,
    generatedAt: new Date().toISOString(),
    cached: false,
    storedId: data?.id || null,
  });
}
