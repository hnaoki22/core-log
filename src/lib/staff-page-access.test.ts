import { describe, it, expect } from "vitest";
import { canUseAdminSurface, decideStaffParticipantView, managerParticipantPagePath } from "./staff-page-access";

// 運営・上司のページを、開いた人が読んでよいかの決まり（合成データ。実在の環境・人物は使わない）。

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

const ADMIN_IN_B = { isAdmin: true, role: "admin", tenantId: TENANT_B };
const OBSERVER_IN_A = { isAdmin: false, role: "observer", tenantId: TENANT_A };
const OBSERVER_IN_B = { isAdmin: false, role: "observer", tenantId: TENANT_B };
const MANAGER_IN_A = { isAdmin: false, role: "manager", tenantId: TENANT_A };
const MANAGER_IN_B = { isAdmin: false, role: "manager", tenantId: TENANT_B };

describe("canUseAdminSurface", () => {
  it("管理者と閲覧者は、管理画面に入れる", () => {
    expect(canUseAdminSurface(ADMIN_IN_B)).toBe(true);
    expect(canUseAdminSurface(OBSERVER_IN_A)).toBe(true);
    expect(canUseAdminSurface({ isAdmin: false, role: "admin", tenantId: TENANT_A })).toBe(true);
  });

  it("上司と、運営・上司でない人は、管理画面に入れない", () => {
    expect(canUseAdminSurface(MANAGER_IN_A)).toBe(false);
    expect(canUseAdminSurface(null)).toBe(false);
    expect(canUseAdminSurface(undefined)).toBe(false);
    expect(canUseAdminSurface({})).toBe(false);
  });
});

describe("decideStaffParticipantView：開いた人が、運営・上司でないとき", () => {
  it("どちらのページでも、読ませない（参加者を引けていても）", () => {
    for (const surface of ["admin", "manager"] as const) {
      expect(decideStaffParticipantView({ surface, viewer: null, participantTenantId: TENANT_A })).toEqual({ ok: false });
      expect(decideStaffParticipantView({ surface, viewer: undefined, participantTenantId: TENANT_A })).toEqual({ ok: false });
      expect(decideStaffParticipantView({ surface, viewer: null, participantTenantId: null })).toEqual({ ok: false });
    }
  });
});

describe("decideStaffParticipantView：上司の側のページ（manager）", () => {
  it("同じ環境の上司・閲覧者は、読める。読む環境は、参加者の側の環境", () => {
    expect(decideStaffParticipantView({ surface: "manager", viewer: MANAGER_IN_A, participantTenantId: TENANT_A }))
      .toEqual({ ok: true, tenantId: TENANT_A });
    expect(decideStaffParticipantView({ surface: "manager", viewer: OBSERVER_IN_A, participantTenantId: TENANT_A }))
      .toEqual({ ok: true, tenantId: TENANT_A });
  });

  it("ほかの環境の上司・閲覧者は、読めない", () => {
    expect(decideStaffParticipantView({ surface: "manager", viewer: MANAGER_IN_B, participantTenantId: TENANT_A }))
      .toEqual({ ok: false });
    expect(decideStaffParticipantView({ surface: "manager", viewer: OBSERVER_IN_B, participantTenantId: TENANT_A }))
      .toEqual({ ok: false });
  });

  it("管理者（is_admin）は、ほかの環境の参加者でも読める", () => {
    expect(decideStaffParticipantView({ surface: "manager", viewer: ADMIN_IN_B, participantTenantId: TENANT_A }))
      .toEqual({ ok: true, tenantId: TENANT_A });
  });

  it("role が admin でも is_admin でない人は、自分の環境だけ", () => {
    const roleOnly = { isAdmin: false, role: "admin", tenantId: TENANT_B };
    expect(decideStaffParticipantView({ surface: "manager", viewer: roleOnly, participantTenantId: TENANT_A }))
      .toEqual({ ok: false });
    expect(decideStaffParticipantView({ surface: "manager", viewer: roleOnly, participantTenantId: TENANT_B }))
      .toEqual({ ok: true, tenantId: TENANT_B });
  });

  it("環境の分からない人は、参加者を引けていても読めない（管理者を除く）", () => {
    expect(decideStaffParticipantView({ surface: "manager", viewer: { isAdmin: false, role: "manager", tenantId: null }, participantTenantId: TENANT_A }))
      .toEqual({ ok: false });
    expect(decideStaffParticipantView({ surface: "manager", viewer: { isAdmin: false, role: "manager" }, participantTenantId: TENANT_A }))
      .toEqual({ ok: false });
    expect(decideStaffParticipantView({ surface: "manager", viewer: { isAdmin: false, role: "manager", tenantId: "" }, participantTenantId: TENANT_A }))
      .toEqual({ ok: false });
  });
});

describe("decideStaffParticipantView：氏名で参加者を引けなかったとき", () => {
  it("開いた人の環境の中だけを読む（これまでと同じ）", () => {
    expect(decideStaffParticipantView({ surface: "manager", viewer: MANAGER_IN_A, participantTenantId: null }))
      .toEqual({ ok: true, tenantId: TENANT_A });
    expect(decideStaffParticipantView({ surface: "manager", viewer: ADMIN_IN_B, participantTenantId: undefined }))
      .toEqual({ ok: true, tenantId: TENANT_B });
    expect(decideStaffParticipantView({ surface: "manager", viewer: MANAGER_IN_A, participantTenantId: "" }))
      .toEqual({ ok: true, tenantId: TENANT_A });
  });

  it("開いた人の環境も分からないときは、読ませない", () => {
    expect(decideStaffParticipantView({ surface: "manager", viewer: { isAdmin: true, role: "admin", tenantId: null }, participantTenantId: null }))
      .toEqual({ ok: false });
  });
});

describe("decideStaffParticipantView：管理画面の側のページ（admin）", () => {
  it("管理者は、どの環境の参加者でも読める", () => {
    expect(decideStaffParticipantView({ surface: "admin", viewer: ADMIN_IN_B, participantTenantId: TENANT_A }))
      .toEqual({ ok: true, tenantId: TENANT_A });
  });

  it("閲覧者は、自分の環境の参加者だけ読める", () => {
    expect(decideStaffParticipantView({ surface: "admin", viewer: OBSERVER_IN_A, participantTenantId: TENANT_A }))
      .toEqual({ ok: true, tenantId: TENANT_A });
    expect(decideStaffParticipantView({ surface: "admin", viewer: OBSERVER_IN_B, participantTenantId: TENANT_A }))
      .toEqual({ ok: false });
  });

  it("上司は、自分の環境の参加者でも、管理画面の側のページでは読めない", () => {
    expect(decideStaffParticipantView({ surface: "admin", viewer: MANAGER_IN_A, participantTenantId: TENANT_A }))
      .toEqual({ ok: false });
    expect(decideStaffParticipantView({ surface: "admin", viewer: MANAGER_IN_A, participantTenantId: null }))
      .toEqual({ ok: false });
  });
});

describe("managerParticipantPagePath", () => {
  it("上司の側の、参加者 1 人のページのパスを返す。氏名は URL に入れられる形にする", () => {
    expect(managerParticipantPagePath("tok-admin", "参加 一郎")).toBe(`/m/tok-admin/${encodeURIComponent("参加 一郎")}`);
    expect(managerParticipantPagePath("tok-admin", "参加（合成）")).toBe(`/m/tok-admin/${encodeURIComponent("参加（合成）")}`);
  });

  it("氏名に / や ? が入っていても、パスの区切りにならない", () => {
    const path = managerParticipantPagePath("tok-admin", "a/b?c#d");
    expect(path.split("/").length).toBe(4);
    expect(path).not.toContain("?");
    expect(path).not.toContain("#");
  });

  it("トークンに使われる文字（英数字・_・-）は、そのまま入る", () => {
    expect(managerParticipantPagePath("mgr_Abc-123", "x")).toBe("/m/mgr_Abc-123/x");
  });
});
