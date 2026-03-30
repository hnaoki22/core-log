import { NextRequest, NextResponse } from "next/server";
import { isAdminToken } from "@/lib/participant-db";
import { getAllParticipantsFromNotion, getAllManagersFromNotion } from "@/lib/notion";
import { Client } from "@notionhq/client";

const notion = new Client({
  auth: process.env.NOTION_API_TOKEN,
});

/**
 * POST /api/admin/backfill-urls
 * One-time backfill: sets アクセスURL for all existing participants and managers
 */
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    const isAdmin = await isAdminToken(token);
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://core-log-lilac.vercel.app";
    const results: string[] = [];

    // Backfill participants
    const participants = await getAllParticipantsFromNotion();
    for (const p of participants) {
      if (!p.token) continue;
      const accessUrl = `${baseUrl}/p/${p.token}`;
      try {
        await notion.pages.update({
          page_id: p.id,
          properties: {
            "アクセスURL": { url: accessUrl },
          },
        });
        results.push(`✓ 参加者: ${p.name} → ${accessUrl}`);
      } catch (err) {
        results.push(`✗ 参加者: ${p.name} - エラー: ${err}`);
      }
    }

    // Backfill managers
    const managers = await getAllManagersFromNotion();
    for (const m of managers) {
      if (!m.token) continue;
      const accessUrl = `${baseUrl}/m/${m.token}`;
      try {
        await notion.pages.update({
          page_id: m.id,
          properties: {
            "アクセスURL": { url: accessUrl },
          },
        });
        results.push(`✓ マネージャー: ${m.name} → ${accessUrl}`);
      } catch (err) {
        results.push(`✗ マネージャー: ${m.name} - エラー: ${err}`);
      }
    }

    return NextResponse.json({
      success: true,
      updated: results.length,
      details: results,
    });
  } catch (error) {
    console.error("Backfill error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
