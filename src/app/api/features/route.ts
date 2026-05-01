// GET /api/features?token=xxx
// Returns the current flag state for the tenant the token belongs to.
// Token is required so we know which tenant's flags to return.
//
// NOTE: No CDN/edge caching. Feature flags must reflect admin changes promptly.
// The server-side in-memory cache (5s TTL) provides sufficient rate-limit
// protection without causing stale reads after preset changes.

import { NextRequest, NextResponse } from "next/server";
import { getFlagsForTenant } from "@/lib/feature-flags";
import { resolveTenantFromToken } from "@/lib/tenant-from-token";
import { DEFAULT_TENANT_ID } from "@/lib/supabase";

export const dynamic = "force-dynamic"; // Prevent Vercel from caching this route

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  // If token provided, scope flags to that tenant. If not (legacy callers
  // that haven't been updated yet), fall back to DEFAULT_TENANT_ID with the
  // same behavior as before — this preserves backwards compatibility while
  // we migrate the frontend.
  let tenantId: string | null = null;
  if (token) {
    tenantId = await resolveTenantFromToken(token);
  }
  const effectiveTenantId = tenantId ?? DEFAULT_TENANT_ID;
  const flags = await getFlagsForTenant(effectiveTenantId);

  return NextResponse.json(
    { tenantId: effectiveTenantId, flags },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
