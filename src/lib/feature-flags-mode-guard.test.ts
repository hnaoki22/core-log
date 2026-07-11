import { describe, it, expect } from "vitest";
import { applyTenantFlagGuards } from "./feature-flags";

// 大幸(daiko)テナントでは category=tier-0 と category=mode のフラグが読み書き両側で
// 強制 OFF されること（standalone_mode / logform_v2 は mode カテゴリ）。既存テストは
// tier-0 を検証するが mode 未検証だったため補完（logform v2 T3）。
const DAIKO = "81f91c26-214e-4da2-9893-6ac6c8984062";
const REFLECTION_LAB = "affbe130-f2f7-4387-82d6-e7419e17400d";

describe("applyTenantFlagGuards — mode カテゴリ (standalone_mode / logform_v2)", () => {
  it("大幸では standalone_mode / logform_v2 が強制 OFF、他カテゴリは不変", () => {
    const guarded = applyTenantFlagGuards(DAIKO, {
      standalone_mode: true,
      logform_v2: true,
      "core.morningInput": true,
      "feature.managerFeedback": true,
    });
    expect(guarded["standalone_mode"]).toBe(false);
    expect(guarded["logform_v2"]).toBe(false);
    expect(guarded["core.morningInput"]).toBe(true);
    expect(guarded["feature.managerFeedback"]).toBe(true);
  });

  it("大幸以外(reflection-lab)は mode フラグを尊重する", () => {
    const guarded = applyTenantFlagGuards(REFLECTION_LAB, {
      standalone_mode: true,
      logform_v2: true,
    });
    expect(guarded["standalone_mode"]).toBe(true);
    expect(guarded["logform_v2"]).toBe(true);
  });

  it("入力オブジェクトを破壊しない（新しい map を返す）", () => {
    const input = { standalone_mode: true, logform_v2: true };
    const guarded = applyTenantFlagGuards(DAIKO, input);
    expect(input.standalone_mode).toBe(true);
    expect(input.logform_v2).toBe(true);
    expect(guarded).not.toBe(input);
  });
});
