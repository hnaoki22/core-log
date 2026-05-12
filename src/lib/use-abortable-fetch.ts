"use client";

import { useEffect, useRef } from "react";

/**
 * Wrap an async data fetch so that:
 *   - A pending request is aborted when the component unmounts (no setState
 *     on unmounted components, no out-of-order responses).
 *   - When the dependency array changes mid-flight, the previous request is
 *     aborted before the new one runs.
 *
 * Usage:
 *   useAbortableFetch(async (signal) => {
 *     const r = await fetch(url, { signal });
 *     if (!r.ok) return;
 *     const data = await r.json();
 *     setData(data);
 *   }, [url]);
 *
 * The `signal` MUST be passed to fetch so the abort actually cancels the
 * network request. Setters called after the work finishes won't run on
 * unmount because the function early-returns on `signal.aborted`.
 *
 * If you call any user state setters from inside the callback, guard them
 * with `if (signal.aborted) return;` between awaits — fetch only rejects on
 * `signal.abort()` once it's already awaiting the response, so a synchronous
 * setState right after a quick await can still leak.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useAbortableFetch(
  run: (signal: AbortSignal) => Promise<void>,
  deps: ReadonlyArray<unknown>,
): void {
  // Keep a ref to the latest callback so we don't restart fetches when only
  // the inline closure identity changes (typical with `() => fetch(...)`).
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    const ctl = new AbortController();
    runRef.current(ctl.signal).catch((e) => {
      // Swallow AbortError — it's the expected cancellation path.
      if ((e as { name?: string })?.name !== "AbortError") {
        console.error("useAbortableFetch error:", e);
      }
    });
    return () => {
      ctl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
