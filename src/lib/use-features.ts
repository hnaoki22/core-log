"use client";

import { useCallback, useEffect, useState } from "react";

// Global cache — shared across all components in the same SPA session
let globalFlags: Record<string, boolean> | null = null;
let globalPromise: Promise<Record<string, boolean>> | null = null;
const listeners = new Set<(f: Record<string, boolean>) => void>();

// Persistent cache key. We scope by token so cross-tenant tabs don't bleed
// flags into each other.
const SS_KEY_PREFIX = "core-log:feature-flags:";
const SS_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Extract participant or admin token from the current URL.
// Path patterns: /p/<token>, /a/<token>, /p/<token>/..., /a/<token>/...
function tokenFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname;
  const match = path.match(/^\/(p|a)\/([^\/?#]+)/);
  return match ? match[2] : null;
}

function readSessionCache(token: string | null): Record<string, boolean> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SS_KEY_PREFIX + (token || "anon"));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { flags: Record<string, boolean>; at: number };
    if (Date.now() - parsed.at > SS_TTL_MS) {
      sessionStorage.removeItem(SS_KEY_PREFIX + (token || "anon"));
      return null;
    }
    return parsed.flags;
  } catch {
    return null;
  }
}

function writeSessionCache(token: string | null, flags: Record<string, boolean>): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      SS_KEY_PREFIX + (token || "anon"),
      JSON.stringify({ flags, at: Date.now() }),
    );
  } catch {
    // sessionStorage may be unavailable (incognito iframe etc.) — ignore
  }
}

async function fetchFlags(): Promise<Record<string, boolean>> {
  if (globalFlags) return globalFlags;
  if (globalPromise) return globalPromise;
  const token = tokenFromLocation();
  const url = token
    ? `/api/features?token=${encodeURIComponent(token)}`
    : "/api/features";
  globalPromise = fetch(url)
    .then((r) => r.json())
    .then((d) => {
      globalFlags = (d.flags || {}) as Record<string, boolean>;
      writeSessionCache(token, globalFlags);
      listeners.forEach((cb) => cb(globalFlags!));
      return globalFlags;
    })
    .catch(() => {
      globalFlags = {};
      return globalFlags;
    });
  return globalPromise;
}

/**
 * React hook returning the current feature flag map.
 *
 * Bootstraps synchronously from sessionStorage (or in-memory `globalFlags`)
 * so the very first render of every page reflects cached flags — no
 * `/api/features` round trip on the critical path of repeat navigations.
 * A background revalidation still runs to pick up admin edits within the
 * sessionStorage TTL.
 *
 * Trade-off: a freshly edited flag may show a stale value for up to 5
 * minutes per browser tab. Admin UIs that change flags should call
 * `sessionStorage.clear()` or set a wider invalidation if exact-time
 * consistency matters.
 */
export function useFeatures(): { flags: Record<string, boolean>; loaded: boolean; isOn: (key: string) => boolean } {
  // Initialize from in-memory or sessionStorage so the first render is
  // already meaningful instead of waiting an extra round trip.
  const bootstrap = (): Record<string, boolean> | null => {
    if (globalFlags) return globalFlags;
    const cached = readSessionCache(tokenFromLocation());
    if (cached) {
      globalFlags = cached;
      return cached;
    }
    return null;
  };

  const initial = bootstrap();
  const [flags, setFlags] = useState<Record<string, boolean>>(initial || {});
  const [loaded, setLoaded] = useState(!!initial);

  useEffect(() => {
    if (globalFlags) {
      setFlags(globalFlags);
      setLoaded(true);
      // Still revalidate in background so admin edits propagate without
      // forcing a full reload. Don't block the render.
      void fetchFlags().then((f) => {
        if (f !== globalFlags) {
          setFlags({ ...f });
        }
      });
      return;
    }
    const cb = (f: Record<string, boolean>) => {
      setFlags(f);
      setLoaded(true);
    };
    listeners.add(cb);
    fetchFlags().then(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);

  const isOn = useCallback((key: string) => flags[key] === true, [flags]);

  return { flags, loaded, isOn };
}
