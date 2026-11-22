"use client";

// 保存していない変更があるときに、ページを離れる前に確かめる（設計図のページで使う）。
//
// - 再読み込み・タブを閉じる・ほかのサイトへ移る：ブラウザの確認（beforeunload）。文は、ブラウザが決める。
// - ページの中のリンク（下のタブを含む）：押したときに、window.confirm で確かめる。
//   「キャンセル」のときは、その移動を取りやめる。
// - ブラウザの「戻る」は、ここでは確かめない。
//
// どのクリックを「離れる操作」と見るかは、leavingHref（純関数。テスト: use-leave-guard.test.ts）が決める。

import { useEffect } from "react";

/** クリックのうち、判定に使うものだけ（ブラウザの MouseEvent が、そのまま当てはまる）。 */
export type LeaveClickEvent = {
  defaultPrevented: boolean;
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  target: unknown;
};

type AnchorLike = {
  getAttribute?: (name: string) => string | null;
  hasAttribute?: (name: string) => boolean;
};

/**
 * そのクリックが、いまのタブで、ほかのページへ移るリンクを押したものか。
 * 移るなら行き先（href）を、そうでなければ null を返す。
 * - 左クリック以外、別のタブで開く操作（Ctrl・⌘・Shift・Alt）、target が _self 以外のリンク、
 *   ダウンロードのリンク、ページ内の位置へのリンク（#…）、いまと同じページへのリンクは、null。
 */
export function leavingHref(event: LeaveClickEvent, currentPathname: string): string | null {
  if (event.defaultPrevented) return null;
  if (event.button !== undefined && event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;

  const target = event.target as { closest?: (selector: string) => unknown } | null;
  if (!target || typeof target.closest !== "function") return null;
  const anchor = target.closest("a[href]") as AnchorLike | null;
  if (!anchor || typeof anchor.getAttribute !== "function") return null;

  const targetAttr = anchor.getAttribute("target");
  if (targetAttr && targetAttr !== "_self") return null;
  if (typeof anchor.hasAttribute === "function" && anchor.hasAttribute("download")) return null;

  const href = (anchor.getAttribute("href") ?? "").trim();
  if (href === "" || href.startsWith("#")) return null;
  const path = href.split(/[?#]/)[0];
  if (path === currentPathname) return null;
  return href;
}

/**
 * active のあいだ、ページを離れる前に確かめる。active が false になると、何もしなくなる。
 * message は、ページの中のリンクを押したときに出す文。
 */
export function useLeaveGuard(active: boolean, message: string): void {
  useEffect(() => {
    if (!active) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 古いブラウザは、returnValue を入れないと確認を出さない。
      e.returnValue = "";
    };

    // 取り込みの段階（capture）で受ける。React と Next.js の Link が動く前に、移動を取りやめられる。
    const onClick = (e: MouseEvent) => {
      if (leavingHref(e, window.location.pathname) === null) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [active, message]);
}
