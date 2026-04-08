// GET /api/features
// Public endpoint that returns the current flag state for the default client.
// No auth required — flags are considered non-sensitive UI config.
// Client components call this on mount to decide what to render.

import { NextResponse } from "next/server";
import { getFlagsForClient, getCurrentClientId } from "@/lib/feature-flags";

export async function GET() {
  const clientId = getCurrentClientId();
  const flags = await getFlagsForClient(clientId);
  return NextResponse.json(
    { clientId, flags },
    {
      headers: {
        // Cache briefly at edge to reduce Notion load; admin save invalidates server-side cache
        "Cache-Control": "public, max-age=30, s-maxage=30",
      },
    }
  );
}
