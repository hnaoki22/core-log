// GET /api/features
// Public endpoint that returns the current flag state for the default client.
// No auth required — flags are considered non-sensitive UI config.
// Client components call this on mount to decide what to render.
//
// NOTE: No CDN/edge caching. Feature flags must reflect admin changes promptly.
// The server-side in-memory cache (5s TTL) provides sufficient Notion rate-limit
// protection without causing stale reads after preset changes.

import { NextResponse } from "next/server";
import { getFlagsForClient, getCurrentClientId } from "@/lib/feature-flags";

export const dynamic = "force-dynamic"; // Prevent Vercel from caching this route

export async function GET() {
  const clientId = getCurrentClientId();
  const flags = await getFlagsForClient(clientId);
  return NextResponse.json(
    { clientId, flags },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
