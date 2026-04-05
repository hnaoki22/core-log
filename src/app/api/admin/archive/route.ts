// POST /api/admin/archive - Archive (delete) a Notion page
// One-time admin utility - remove after use

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";

// Read from environment variable with fallback defaults
const ADMIN_TOKENS = (process.env.ADMIN_TOKENS || "munetomo-admin,UE8m8SSJAgRBwsSZ")
  .split(",")
  .map((t) => t.trim());

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, pageIds } = body;

    if (!token || !ADMIN_TOKENS.includes(token)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (!pageIds || !Array.isArray(pageIds)) {
      return NextResponse.json({ error: "pageIds array required" }, { status: 400 });
    }

    const notion = new Client({ auth: process.env.NOTION_API_TOKEN });
    const results = [];

    for (const pageId of pageIds) {
      try {
        await notion.pages.update({ page_id: pageId, archived: true });
        results.push({ pageId, success: true });
      } catch (e) {
        results.push({ pageId, success: false, error: String(e) });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Archive API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
