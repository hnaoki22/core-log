// GET /api/features/culture-score?token=xxx
// Admin/manager endpoint to fetch organization-wide culture metrics
// Returns dashboard data for the organization

import { NextRequest, NextResponse } from "next/server";
import { getClient, DEFAULT_TENANT_ID } from "@/lib/supabase";
import { getManagerByTokenFromSupabase } from "@/lib/supabase";
import { isAdminOrObserverToken } from "@/lib/participant-db";
import { isFeatureEnabledForToken } from "@/lib/feature-flags";
import { resolveManagerTenantStrict } from "@/lib/tenant-context";



interface LogEntry {
  participant_id?: string;
  status?: string;
  energy?: string;
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabledForToken("tier-b.cultureScore", token);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Culture score feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify admin or manager token
    let tenantId: string;
    const isAdminOrObserver = await isAdminOrObserverToken(token);
    if (!isAdminOrObserver) {
      // Try manager-specific access
      const manager = await getManagerByTokenFromSupabase(token);
      if (!manager) {
        return NextResponse.json(
          { error: "Admin/manager access required" },
          { status: 403 }
        );
      }
      const tenantResult = resolveManagerTenantStrict(manager);
      if (!tenantResult.ok) {
        return NextResponse.json(tenantResult.errorBody, { status: tenantResult.status });
      }
      tenantId = tenantResult.tenantId;
    } else {
      // Admin/observer: fall back to DEFAULT_TENANT_ID — matches other admin-scoped endpoints.
      // NOTE: pre-Phase0 this used the literal "default"; kept compatible by pointing at
      // the real default UUID. If it was intentionally different before, revisit in Phase 0.5.
      tenantId = DEFAULT_TENANT_ID;
    }

    const client = getClient();
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Total participants
    const { count: totalParticipants } = await client
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    // Active participants (logged in last 30 days)
    const { data: activeLogs } = await client
      .from("logs")
      .select("participant_id")
      .eq("tenant_id", tenantId)
      .gte("datetime", thirtyDaysAgo.toISOString());

    const activeParticipantIds = new Set(
      (activeLogs || [])
        .map((log: LogEntry) => log.participant_id)
        .filter((id): id is string => typeof id === "string")
    );
    const activeRate =
      totalParticipants && totalParticipants > 0
        ? Math.round((activeParticipantIds.size / totalParticipants) * 100)
        : 0;

    // Entry rate calculation
    const { data: allLogs } = await client
      .from("logs")
      .select("participant_id, status")
      .eq("tenant_id", tenantId)
      .gte("datetime", thirtyDaysAgo.toISOString());

    let avgEntryRate = 0;
    if (activeParticipantIds.size > 0) {
      const entryRatesByParticipant: Record<string, { complete: number; total: number }> =
        {};

      (allLogs || []).forEach((log: LogEntry) => {
        if (!log.participant_id) return;
        if (!entryRatesByParticipant[log.participant_id]) {
          entryRatesByParticipant[log.participant_id] = { complete: 0, total: 0 };
        }
        entryRatesByParticipant[log.participant_id].total += 1;
        if (log.status === "complete") {
          entryRatesByParticipant[log.participant_id].complete += 1;
        }
      });

      const rates = Object.values(entryRatesByParticipant).map((p) =>
        p.total > 0 ? p.complete / p.total : 0
      );
      avgEntryRate =
        rates.length > 0
          ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100)
          : 0;
    }

    // Average energy
    const { data: energyLogs } = await client
      .from("logs")
      .select("energy")
      .eq("tenant_id", tenantId)
      .gte("datetime", thirtyDaysAgo.toISOString())
      .not("energy", "is", null);

    let avgEnergy = 0;
    if (energyLogs && energyLogs.length > 0) {
      const energyMap = { excellent: 4, good: 3, okay: 2, low: 1 };
      const scores = (energyLogs || [])
        .map((log: LogEntry) => {
          if (!log.energy) return 0;
          const key = log.energy as keyof typeof energyMap;
          return energyMap[key] || 2;
        })
        .filter((score) => score > 0);
      avgEnergy =
        scores.length > 0
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
          : 0;
    }

    // Return dashboard summary
    return NextResponse.json({
      success: true,
      dashboard: {
        totalParticipants: totalParticipants || 0,
        activeParticipants: activeParticipantIds.size,
        activeRate,
        avgEntryRate,
        avgEnergy,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Culture score error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
