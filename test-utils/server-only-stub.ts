// Vitest stub for the `server-only` package, which intentionally throws when
// imported outside a Next.js server bundle. Tests import server-side modules
// (e.g. lib/supabase.ts) directly, so we replace the package with this empty
// module via `resolve.alias` in vitest.config.ts.
export {};
