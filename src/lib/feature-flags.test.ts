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

// 入力画面へのミッション表示（feature.missionOnInput）と、呼び名の切り替え
// （feature.missionLabelIssue）。どちらも、スイッチを入れるまで既存テナントの表示を
// 変えないことが前提なので、既定値とプリセットでの扱いを固定する。
describe("mission flags (input screen / label)", () => {
  const missionKeys = ["feature.missionOnInput", "feature.missionLabelIssue"];
  const byKey = (key: string) => FEATURE_CATALOG.find((f) => f.key === key);

  it("are in the catalog, default OFF, and depend on the Mission feature", () => {
    for (const key of missionKeys) {
      const f = byKey(key);
      expect(f, key).toBeDefined();
      expect(f!.defaultEnabled).toBe(false);
      expect(f!.phase1Enabled).toBe(false);
      expect(f!.implemented).toBe(true);
      expect(f!.dependencies).toEqual(["feature.mission"]);
      // features 画面のグルーピングは既存カテゴリだけを前提にしている（CLAUDE.md §5 ルール 4）
      expect(f!.category).toBe("existing");
    }
  });

  it("stay OFF in every preset except 'full'", () => {
    for (const preset of PRESETS) {
      if (preset.id === "full") continue;
      const flags = preset.getFlags();
      for (const key of missionKeys) expect(flags[key], `${preset.id}:${key}`).toBe(false);
    }
  });

  it("'full' turns the input-screen display ON but never switches the label", () => {
    const full = PRESETS.find((p) => p.id === "full")!.getFlags();
    expect(full["feature.missionOnInput"]).toBe(true);
    expect(full["feature.missionLabelIssue"]).toBe(false);
  });

  it("are not forced either way by the daiko guard (the tenant's stored value decides)", () => {
    const on = applyTenantFlagGuards(DAIKO_TENANT_ID, {
      "feature.missionOnInput": true,
      "feature.missionLabelIssue": true,
    });
    expect(on["feature.missionOnInput"]).toBe(true);
    expect(on["feature.missionLabelIssue"]).toBe(true);
    const off = applyTenantFlagGuards(DAIKO_TENANT_ID, {
      "feature.missionOnInput": false,
      "feature.missionLabelIssue": false,
    });
    expect(off["feature.missionOnInput"]).toBe(false);
    expect(off["feature.missionLabelIssue"]).toBe(false);
  });
});
