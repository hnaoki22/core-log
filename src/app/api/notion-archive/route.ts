// POST /api/notion-archive
// Deprecated: Notion integration removed. All data is now in Supabase.

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ message: "Notion archive not available - migrated to Supabase" }, { status: 410 });
}
