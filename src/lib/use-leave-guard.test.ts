import { describe, it, expect } from "vitest";
import { leavingHref, type LeaveClickEvent } from "./use-leave-guard";

// この環境のテストは DOM なし（Node）なので、リンクとクリックは、同じ形の作り物で確かめる。
function anchor(attrs: Record<string, string>) {
  return {
    getAttribute: (name: string) => (name in attrs ? attrs[name] : null),
    hasAttribute: (name: string) => name in attrs,
  };
}

/** リンクの中の要素（アイコンや文字）を押したときと同じく、closest でリンクにたどり着く作り物。 */
function clickOn(a: ReturnType<typeof anchor> | null, extra: Partial<LeaveClickEvent> = {}): LeaveClickEvent {
  return {
    defaultPrevented: false,
    button: 0,
    target: { closest: (selector: string) => (selector === "a[href]" ? a : null) },
    ...extra,
  };
}

const HERE = "/p/tok_synthetic/blueprint";

describe("leavingHref：ページを離れるリンクを押したか", () => {
  it("ほかのページへのリンクを押したときは、行き先を返す（下のタブ、記入画面へのリンク）", () => {
    expect(leavingHref(clickOn(anchor({ href: "/p/tok_synthetic" })), HERE)).toBe("/p/tok_synthetic");
    expect(leavingHref(clickOn(anchor({ href: "/p/tok_synthetic/mission" })), HERE)).toBe("/p/tok_synthetic/mission");
    expect(leavingHref(clickOn(anchor({ href: "/p/tok_synthetic/input?from=bp" })), HERE)).toBe(
      "/p/tok_synthetic/input?from=bp"
    );
    expect(leavingHref(clickOn(anchor({ href: "https://example.com/" })), HERE)).toBe("https://example.com/");
  });

  it("リンクでないところ（ボタン、入力欄）を押したときは、null", () => {
    expect(leavingHref(clickOn(null), HERE)).toBeNull();
    expect(leavingHref({ defaultPrevented: false, button: 0, target: null }, HERE)).toBeNull();
    expect(leavingHref({ defaultPrevented: false, button: 0, target: {} }, HERE)).toBeNull();
  });

  it("いまと同じページへのリンクと、ページ内の位置へのリンクは、離れる操作ではない", () => {
    expect(leavingHref(clickOn(anchor({ href: HERE })), HERE)).toBeNull();
    expect(leavingHref(clickOn(anchor({ href: `${HERE}?saved=1` })), HERE)).toBeNull();
    expect(leavingHref(clickOn(anchor({ href: `${HERE}#top` })), HERE)).toBeNull();
    expect(leavingHref(clickOn(anchor({ href: "#top" })), HERE)).toBeNull();
    expect(leavingHref(clickOn(anchor({ href: "" })), HERE)).toBeNull();
  });

  it("別のタブで開く操作は、いまのページを離れないので確かめない", () => {
    const link = anchor({ href: "/p/tok_synthetic/mission" });
    for (const extra of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }]) {
      expect(leavingHref(clickOn(link, extra), HERE)).toBeNull();
    }
    expect(leavingHref(clickOn(link, { button: 1 }), HERE)).toBeNull();
    expect(leavingHref(clickOn(anchor({ href: "/p/tok_synthetic/mission", target: "_blank" })), HERE)).toBeNull();
    expect(leavingHref(clickOn(anchor({ href: "/files/a.csv", download: "" })), HERE)).toBeNull();
  });

  it("target が _self のリンクは、いまのタブで移るので確かめる", () => {
    expect(leavingHref(clickOn(anchor({ href: "/p/tok_synthetic/logs", target: "_self" })), HERE)).toBe(
      "/p/tok_synthetic/logs"
    );
  });

  it("ほかの処理が、すでに移動を取りやめているときは、何もしない", () => {
    expect(leavingHref(clickOn(anchor({ href: "/p/tok_synthetic/mission" }), { defaultPrevented: true }), HERE)).toBeNull();
  });
});
