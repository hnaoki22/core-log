// POST /api/notion-archive
// Archive (soft-delete) a Notion page by ID
// Used for cleaning up duplicate/test entries

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";

const notion = new Client({
  auth: process.env.NOTION_API_TOKEN,
});

export async function POST(request: NextRequest) {
  if (!process.env.NOTION_API_TOKEN) {
    return NextResponse.json({ error: "Notion not configured" }, { status: 500 });
  }

  try {
    const { pageId } = await request.json();
    if (!pageId) {
      return NextResponse.json({ error: "pageId required" }, { status: 400 });
    }

    await notion.pages.update({
      page_id: pageId,
      archived: true,
    });

    return NextResponse.json({ success: true, archived: pageId });
  } catch (error) {
    console.error("Archive error:", error);
    return NextResponse.json({ error: "Failed to archive" }, { status: 500 });
  }
}
