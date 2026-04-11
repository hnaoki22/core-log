import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ message: "Backfill not needed in Supabase mode" });
}
