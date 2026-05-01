// Resolve a participant or admin/manager token to its tenant_id.
// Used by feature flag checks in API routes that have a token but don't
// already know the tenant context.
//
// Returns null if the token doesn't match any participant or manager —
// callers should treat that as "deny" (defense in depth).

import { getParticipantByToken, getManagerByToken } from "./participant-db";

const cache = new Map<string, { tenantId: string | null; at: number }>();
const CACHE_TTL_MS = 30 * 1000; // 30s — feature checks are read-heavy

export async function resolveTenantFromToken(
  token: string
): Promise<string | null> {
  const cached = cache.get(token);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.tenantId;

  // Admin tokens are prefixed mgr_; participant tokens are not. Try manager
  // first when the prefix matches, otherwise participant first. Fall back to
  // the other lookup either way so we never miss.
  let tenantId: string | null = null;
  const looksLikeManager = token.startsWith("mgr_");
  if (looksLikeManager) {
    const m = await getManagerByToken(token);
    tenantId = m?.tenantId ?? null;
    if (!tenantId) {
      const p = await getParticipantByToken(token);
      tenantId = p?.tenantId ?? null;
    }
  } else {
    const p = await getParticipantByToken(token);
    tenantId = p?.tenantId ?? null;
    if (!tenantId) {
      const m = await getManagerByToken(token);
      tenantId = m?.tenantId ?? null;
    }
  }

  cache.set(token, { tenantId, at: Date.now() });
  return tenantId;
}
