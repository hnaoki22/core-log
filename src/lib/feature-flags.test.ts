import { describe, it, expect } from "vitest";
import {
  applyTenantFlagGuards,
  FEATURE_CATALOG,
  PRESETS,
} from "@/lib/feature-flags";
import { DAIKO_TENANT_ID } from "@/lib/tenants";

// reflection-lab tenant (CLAUDE.md §3) — 観の期(tier-0) is intentionally ON here.
const REFLECTION_LAB_TENANT_ID = "affbe130-f2f7-4387-82d6-e7419e17400d";

const tier0Keys = FEATURE_CATALOG.filter((f) => f.category === "tier-0").map(
  (f) => f.key
);

const allFlagsOn = (): Record<string, boolean> => {
  const flags: Record<string, boolean> = {};
  for (const f of FEATURE_CATALOG) flags[f.key] = true;
  return flags;
};

describe("FEATURE_CATALOG tier-0 (観の期)", () => {
  it("has tier-0 entries (otherwise the guard tests below are vacuous)", () => {
    expect(tier0Keys.length).toBeGreaterThan(0);
  });

  it("ships every tier-0 flag defaulting OFF (reflection-lab opts in via stored flags)", () => {
    for (const f of FEATURE_CATALOG) {
      if (f.category === "tier-0") {
        expect(f.defaultEnabled).toBe(false);
        expect(f.phase1Enabled).toBe(false);
      }
    }
  });
});

describe("applyTenantFlagGuards", () => {
  it("forces every tier-0 flag OFF for the daiko production tenant", () => {
    const guarded = applyTenantFlagGuards(DAIKO_TENANT_ID, allFlagsOn());
    for (const k of tier0Keys) expect(guarded[k]).toBe(false);
  });

  it("neutralizes the 'full' preset's tier-0 flags for daiko", () => {
    const full = PRESETS.find((p) => p.id === "full")!.getFlags();
    // Sanity: the full preset really does turn tier-0 on (implemented=true).
    expect(tier0Keys.some((k) => full[k] === true)).toBe(true);
    const guarded = applyTenantFlagGuards(DAIKO_TENANT_ID, full);
    for (const k of tier0Keys) expect(guarded[k]).toBe(false);
  });

  it("leaves non-tier-0 flags untouched for daiko", () => {
    const guarded = applyTenantFlagGuards(DAIKO_TENANT_ID, {
      "feature.mission": true,
      "tier-s.ruminationDetection": true,
    });
    expect(guarded["feature.mission"]).toBe(true);
    expect(guarded["tier-s.ruminationDetection"]).toBe(true);
  });

  it("does NOT alter flags for non-daiko tenants (reflection-lab keeps tier-0 ON)", () => {
    const guarded = applyTenantFlagGuards(REFLECTION_LAB_TENANT_ID, allFlagsOn());
    for (const k of tier0Keys) expect(guarded[k]).toBe(true);
  });

  it("does not mutate the input map", () => {
    const input = allFlagsOn();
    applyTenantFlagGuards(DAIKO_TENANT_ID, input);
    for (const k of tier0Keys) expect(input[k]).toBe(true);
  });
});
