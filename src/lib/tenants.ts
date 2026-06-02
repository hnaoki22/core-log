// Canonical tenant UUIDs.
//
// Pure constants with no server-only dependencies, so this module is safe to
// import from BOTH client components (e.g. the admin /features page) and server
// routes. Do not import "@/lib/supabase" here — that would pull the service-role
// client into client bundles.
//
// Source of truth: CLAUDE.md §3 tenant table.

/**
 * 大幸薬品 — the production tenant (CLAUDE.md guardrail #1: protect at all costs).
 *
 * Distinct from supabase.ts `DEFAULT_TENANT_ID`, which is the *fallback* tenant
 * and is overridable via the DEFAULT_TENANT_ID env var. This constant always
 * means "the daiko production tenant" regardless of environment configuration.
 */
export const DAIKO_TENANT_ID = "81f91c26-214e-4da2-9893-6ac6c8984062";
