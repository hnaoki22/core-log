// Temporary client-side error sink for diagnosing the blank input screen.
//
// The participant input page renders blank on some tenants with no server
// error and without tripping the route error boundary — which points at a
// client-only failure (e.g. a React hydration mismatch) that only surfaces in
// the browser console. This endpoint lets the browser forward those messages
// to the Vercel function log so we can read the exact error here.
//
// Remove once the blank-screen root cause is fixed.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const kind = typeof body?.kind === "string" ? body.kind.slice(0, 40) : "unknown";
    const message = typeof body?.message === "string" ? body.message.slice(0, 4000) : "";
    const stack = typeof body?.stack === "string" ? body.stack.slice(0, 4000) : "";
    const url = typeof body?.url === "string" ? body.url.slice(0, 400) : "";
    console.error(`[client-error] kind=${kind} url=${url} message=${message} stack=${stack}`);
  } catch {
    console.error("[client-error] (failed to parse body)");
  }
  return new NextResponse(null, { status: 204 });
}
