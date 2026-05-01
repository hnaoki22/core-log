"use client";

import { useEffect, useState } from "react";

// Global cache — shared across all components in the same SPA session
let globalFlags: Record<string, boolean> | null = null;
let globalPromise: Promise<Record<string, boolean>> | null = null;
const listeners = new Set<(f: Record<string, boolean>) => void>();

// Extract participant or admin token from the current URL.
// Path patterns: /p/<token>, /a/<token>, /p/<token>/..., /a/<token>/...
function tokenFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname;
  const match = path.match(/^\/(p|a)\/([^\/?#]+)/);
  return match ? match[2] : null;
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
 * Returns an empty object until flags are loaded (treat all as OFF during loading).
 */
export function useFeatures(): { flags: Record<string, boolean>; loaded: boolean; isOn: (key: string) => boolean } {
  const [flags, setFlags] = useState<Record<string, boolean>>(globalFlags || {});
  const [loaded, setLoaded] = useState(!!globalFlags);

  useEffect(() => {
    if (globalFlags) {
      setFlags(globalFlags);
      setLoaded(true);
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

  return {
    flags,
    loaded,
    isOn: (key: string) => flags[key] === true,
  };
}
