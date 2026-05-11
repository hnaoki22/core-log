// GET/POST /api/admin/phase-labels
// Manage per-tenant phase labels (e.g. "覚悟", "武装", "実践"...)
// Replaces hardcoded dojo phase lists

import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_TENANT_ID,
  getManagerByTokenFromSupabase as getManagerByToken,
} from "@/lib/supabase";
import { getPhaseLabels, savePhaseLabels } from "@/lib/phase-labels";

export const dynamic = "force-dynamic";

// ---------- GET: Retrieve phase labels for a tenant ----------
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    const manager = await getManagerByToken(token);
    if (!manager) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const tenantId = manager.tenantId || DEFAULT_TENANT_ID;

    const labels = await getPhaseLabels(tenantId);
    return NextResponse.json({ success: true, labels });
  } catch (err) {
    console.error("GET /api/admin/phase-labels error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------- POST: Save phase labels for a tenant ----------
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, labels } = body;

    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }
    if (!Array.isArray(labels)) {
      return NextResponse.json({ error: "labels must be an array of strings" }, { status: 400 });
    }
    // Validate: all items must be non-empty strings
    const cleaned = labels
      .map((l: unknown) => (typeof l === "string" ? l.trim() : ""))
      .filter((l: string) => l.length > 0);

    const manager = await getManagerByToken(token);
    if (!manager) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const tenantId = manager.tenantId || DEFAULT_TENANT_ID;

    const ok = await savePhaseLabels(tenantId, cleaned);
    if (!ok) {
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }
    return NextResponse.json({ success: true, labels: cleaned });
  } catch (err) {
    console.error("POST /api/admin/phase-labels error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
