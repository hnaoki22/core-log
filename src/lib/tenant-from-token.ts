// Resolve a participant or admin/manager token to its tenant_id.
// Used by feature flag checks in API routes that have a token but don't
// already know the tenant context.
//
// Returns null if the token doesn't match any participant or manager —
// callers should treat that as "deny" (defense in depth).

import { getParticipantByToken, getManagerByToken } from "./participant-db";

// Bounded positive-result cache. We only cache successful resolutions because
// caching null lookups can lock a freshly-created participant out of feature
// access until the cache entry expires (e.g., right after CSV import). LRU
// bound protects against memory growth from random-token probing.
const CACHE_TTL_MS = 30 * 1000;
const CACHE_MAX_ENTRIES = 5000;
const cache = new Map<string, { tenantId: string; at: number }>();

function setCached(token: string, tenantId: string): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Map preserves insertion order — drop the oldest entry. Cheap enough at
    // this scale that we don't need a real LRU.
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(token, { tenantId, at: Date.now() });
}

export async function resolveTenantFromToken(
  token: string
): Promise<string | null> {
  const cached = cache.get(token);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.tenantId;
  if (cached) cache.delete(token); // expired

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

  if (tenantId) setCached(token, tenantId);
  return tenantId;
}
