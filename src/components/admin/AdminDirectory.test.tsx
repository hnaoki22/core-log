import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminDirectory } from "./AdminDirectory";
import { EnvironmentBanner } from "./EnvironmentBanner";
import type { DirectoryEnvironment, DirectoryUser } from "@/lib/admin-directory";

// テストのデータは合成（実在の環境・人物・トークンは使わない）。
const PROD: DirectoryEnvironment = {
  id: "e-prod",
  slug: "prod",
  name: "Prod Env",
  companyName: "株式会社本番サンプル",
  purpose: { label: "本番", tone: "production" },
  inputMode: "standard",
  otpEnabled: true,
};
const TEST: DirectoryEnvironment = {
  id: "e-test",
  slug: "test",
  name: "Test Env",
  companyName: "株式会社テストサンプル",
  purpose: { label: "テスト用", tone: "test" },
  inputMode: "standard",
  otpEnabled: false,
};
const LAB: DirectoryEnvironment = {
  id: "e-lab",
  slug: "lab",
  name: "Lab Env",
  companyName: "",
  purpose: null,
  inputMode: "standalone",
  otpEnabled: false,
};

const USERS: DirectoryUser[] = [
  { id: "p1", kind: "participant", name: "試験 一郎", department: "製造部", environmentId: "e-test", createdAt: "2026-01-10T03:00:00Z", loginPath: "/p/tok-p1" },
  { id: "p2", kind: "participant", name: "試験 花子", department: "", environmentId: "e-test", createdAt: "2025-12-01T03:00:00Z", loginPath: "/p/tok-p2" },
  { id: "m1", kind: "manager", name: "試験 上司", department: "", environmentId: "e-test", createdAt: null, loginPath: "/m/tok-m1" },
  { id: "a1", kind: "admin", name: "試験 管理", department: "", environmentId: "e-test", createdAt: null, loginPath: "/a/tok-a1" },
  { id: "p9", kind: "participant", name: "本番 太郎", department: "", environmentId: "e-prod", createdAt: null, loginPath: "/p/tok-p9" },
  { id: "o1", kind: "observer", name: "本番 閲覧", department: "", environmentId: "e-prod", createdAt: null, loginPath: "/a/tok-o1" },
];

function render(selectedSlug = "", extra?: { truncated?: boolean; users?: DirectoryUser[] }): string {
  return renderToStaticMarkup(
    createElement(AdminDirectory, {
      environments: [LAB, TEST, PROD],
      users: extra?.users ?? USERS,
      truncated: extra?.truncated,
      selectedSlug,
      onSelect: () => {},
      origin: "https://example.test",
      todayJst: "2026-01-10",
    })
  );
}

/** タグを取り除いて、画面に見える文字だけにする */
function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

// この環境のテストは DOM なし（Node）なので、押す操作（切り替え・コピー・開閉）は確かめられない。
// ここでは最初の描画で何が出るかを確かめる。
describe("AdminDirectory（描画）", () => {
  it("環境の一覧に、名前・会社名・用途・人数・設定を出す", () => {
    const html = render();
    expect(html).toContain("全環境");
    expect(html).toContain("3つの環境をまとめて表示");
    expect(html).toContain("Test Env");
    expect(html).toContain("株式会社テストサンプル");
    expect(html).toContain("テスト用");
    expect(html).toContain("本番");
    expect(html).toContain("参加者 2・管理者 1・マネージャー 1");
    expect(html).toContain("参加者 1・閲覧者 1");
    expect(html).toContain("従来型・確認コードなし");
    expect(html).toContain("従来型・確認コードあり");
    expect(html).toContain("商品モード・確認コードなし");
  });

  it("全環境のときは「全環境」が選ばれた状態、環境を選ぶとその環境が選ばれた状態", () => {
    expect(render()).toMatch(/aria-pressed="true"[^>]*>\s*<div[^>]*>全環境/);
    const selected = render("test");
    expect(selected).not.toMatch(/aria-pressed="true"[^>]*>\s*<div[^>]*>全環境/);
    expect((selected.match(/aria-pressed="true"/g) ?? []).length).toBe(1);
  });

  it("全環境のとき、本番のユーザーは閉じておき、ほかの環境のユーザーは出す", () => {
    const html = render();
    expect(html).toContain("試験 一郎");
    expect(html).toContain("試験 上司");
    expect(html).not.toContain("本番 太郎");
    expect(html).not.toContain("/p/tok-p9");
  });

  it("環境を 1 つ選ぶと、その環境のユーザーだけを開いて出す（本番でも開く）", () => {
    const html = render("prod");
    expect(html).toContain("本番 太郎");
    expect(html).toContain("本番 閲覧");
    expect(html).not.toContain("試験 一郎");
  });

  it("1 人ずつ「画面を開く」と「URLをコピー」を出す。開く先は、その人のログイン用のパス", () => {
    const html = render("test");
    expect(html).toContain('href="/p/tok-p1"');
    expect(html).toContain('href="/m/tok-m1"');
    expect(html).toContain('href="/a/tok-a1"');
    expect((html.match(/画面を開く/g) ?? []).length).toBe(4);
    expect((html.match(/URLをコピー/g) ?? []).length).toBe(4);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("ログイン用の URL の文字列は、画面に見える文字としては出さない", () => {
    const text = visibleText(render("test"));
    expect(text).not.toContain("tok-");
    expect(text).not.toContain("https://example.test");
  });

  it("種別と、追加した日、「今日追加」の印を出す", () => {
    const html = render("test");
    expect(html).toContain("参加者");
    expect(html).toContain("マネージャー");
    expect(html).toContain("管理者");
    expect(html).toContain("製造部・追加 1/10");
    expect(html).toContain("追加 12/1");
    expect((html.match(/今日追加/g) ?? []).length).toBe(1);
  });

  it("ユーザーがいない環境は、その旨を出す", () => {
    expect(render("lab")).toContain("この環境には、まだユーザーがいません。");
  });

  it("一部だけを渡されたときは、その旨を出す", () => {
    expect(render("", { truncated: true })).toContain("一部だけを表示しています");
    expect(render()).not.toContain("一部だけを表示しています");
  });
});

describe("EnvironmentBanner（描画）", () => {
  it("環境を選んでいないときは「全環境を表示中」と、追加の決まりを出す", () => {
    const html = renderToStaticMarkup(createElement(EnvironmentBanner, { environment: null }));
    expect(html).toContain("全環境を表示中");
    expect(html).toContain("環境を1つ選んでから");
  });

  it("環境の名前（会社名）と用途を出す。本番は色を変える", () => {
    const prod = renderToStaticMarkup(createElement(EnvironmentBanner, { environment: PROD }));
    expect(prod).toContain("表示中の環境");
    expect(prod).toContain("Prod Env（株式会社本番サンプル）");
    expect(prod).toContain("本番");
    expect(prod).toContain("bg-red-600");

    const test = renderToStaticMarkup(createElement(EnvironmentBanner, { environment: TEST }));
    expect(test).toContain("bg-emerald-600");
    expect(test).not.toContain("bg-red-600");
  });

  it("用途が決まっていない環境は、名前だけを出す", () => {
    const html = renderToStaticMarkup(createElement(EnvironmentBanner, { environment: LAB }));
    expect(html).toContain("Lab Env");
    expect(html).not.toContain("bg-red-600");
    expect(html).not.toContain("bg-emerald-600");
  });
});
