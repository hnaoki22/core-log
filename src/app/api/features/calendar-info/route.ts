// GET /api/features/calendar-info?token=xxx
// Returns calendar blocking feature info and settings
// POST /api/features/calendar-info
// Save calendar settings (currently just stores preferences, no actual Google Calendar integration yet)

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getParticipantByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabledForToken } from "@/lib/feature-flags";

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabledForToken("tier-e.calendarBlock", token);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Calendar block feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Try to fetch saved preferences
    const client = getClient();
    const { data } = await client
      .from("calendar_settings")
      .select("*")
      .eq("participant_id", participant.id)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      status: "ready",
      feature: "Googleカレンダー自動ブロック",
      description:
        "毎日15分のリフレクション時間をカレンダーに自動登録します。",
      settings: data || {
        enabled: false,
        preferredTime: "17:00",
        durationMinutes: 15,
      },
      message: "Googleカレンダー連携は今後のアップデートで対応予定です",
      integration: "googleCalendar",
      status_ja: "準備中",
    });
  } catch (error) {
    console.error("Calendar info GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, enabled, preferredTime, durationMinutes } = body;

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabledForToken("tier-e.calendarBlock", token);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Calendar block feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Store settings (no actual Google Calendar integration yet)
    const client = getClient();
    const { error } = await client.from("calendar_settings").upsert(
      {
        participant_id: participant.id,
        tenant_id: participant.tenantId,
        enabled: enabled ?? false,
        preferred_time: preferredTime || "17:00",
        duration_minutes: durationMinutes || 15,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "participant_id",
      }
    );

    if (error) {
      return NextResponse.json(
        { error: "Failed to save calendar settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "カレンダー設定を保存しました",
      note: "Googleカレンダー連携は今後のアップデートで対応予定です。",
      settings: {
        enabled,
        preferredTime,
        durationMinutes,
      },
    });
  } catch (error) {
    console.error("Calendar info POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
