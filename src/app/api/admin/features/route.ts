// GET  /api/admin/features?token=xxx           → fetch catalog + current flags
// POST /api/admin/features?token=xxx           → save flags { flags: {...} } or { presetId: "..." }

import { NextRequest, NextResponse } from "next/server";
import { isAdminToken } from "@/lib/participant-db";

export const dynamic = "force-dynamic"; // Always fresh reads from Supabase
import {
  FEATURE_CATALOG,
  PRESETS,
  getFlagsForClient,
  setFlagsForClient,
  getCurrentClientId,
} from "@/lib/feature-flags";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const authorized = await isAdminToken(token);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const clientId = getCurrentClientId();
  const currentFlags = await getFlagsForClient(clientId);

  return NextResponse.json({
    clientId,
    catalog: FEATURE_CATALOG,
    presets: PRESETS.map((p) => ({ id: p.id, label: p.label, description: p.description })),
    flags: currentFlags,
    storageConfigured: !!(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL),
  });
}

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const authorized = await isAdminToken(token);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await request.json();
  const clientId = getCurrentClientId();

  let flagsToSave: Record<string, boolean> | null = null;

  if (body.presetId) {
    const preset = PRESETS.find((p) => p.id === body.presetId);
    if (!preset) {
      return NextResponse.json({ error: "Unknown preset" }, { status: 400 });
    }
    flagsToSave = preset.getFlags();
  } else if (body.flags && typeof body.flags === "object") {
    flagsToSave = body.flags as Record<string, boolean>;
  } else {
    return NextResponse.json({ error: "Missing flags or presetId" }, { status: 400 });
  }

  const ok = await setFlagsForClient(clientId, flagsToSave);
  if (!ok) {
    return NextResponse.json(
      {
        error: "Failed to save feature flags to Supabase.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, flags: flagsToSave });
}
