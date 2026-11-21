"use client";

import { useMemo, useState } from "react";
import {
  USER_KIND_LABEL,
  countUsersByEnvironment,
  emptyCounts,
  environmentLabel,
  formatEnvironmentCounts,
  formatJstMonthDay,
  groupDirectoryUsers,
  isAddedOn,
  sortEnvironments,
  type DirectoryEnvironment,
  type DirectoryUser,
  type EnvironmentTone,
} from "@/lib/admin-directory";

/**
 * 管理画面の「環境とユーザー」の欄（管理者にだけ出す）。
 *  - 環境の一覧：用途・人数・入力画面の型・確認コードの有無。押すと、その環境に切り替わる。
 *  - ユーザーの一覧：環境ごとに区切り、1 人ずつ「画面を開く」「URLをコピー」を出す。
 *
 * ログイン用の URL の文字列は画面に出さない（画面の共有やスクリーンショットに残さないため）。
 * 開くか、コピーして使う。コピーできなかったときだけ、その人の URL を欄に出す。
 * データは親（管理画面）が取得して渡す。この部品は API を呼ばない。
 */

type Props = {
  environments: DirectoryEnvironment[];
  users: DirectoryUser[];
  /** 行数の上限に当たって、一部だけが渡されているとき true */
  truncated?: boolean;
  /** いま選んでいる環境の slug。全環境のときは空文字 */
  selectedSlug: string;
  onSelect: (slug: string) => void;
  /** URL の先頭（https://…）。まだ分からないときは空文字 */
  origin: string;
  /** 日本時間の今日（YYYY-MM-DD）。「今日追加」の印に使う */
  todayJst: string;
};

const BADGE_CLASS: Record<EnvironmentTone, string> = {
  production: "bg-red-50 text-red-700 border border-red-200",
  test: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  neutral: "bg-[#EFE8DD] text-[#5B5560] border border-transparent",
};

function PurposeBadge({ environment }: { environment: DirectoryEnvironment }) {
  if (!environment.purpose) return null;
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md whitespace-nowrap ${BADGE_CLASS[environment.purpose.tone]}`}>
      {environment.purpose.label}
    </span>
  );
}

function settingsLine(environment: DirectoryEnvironment): string {
  const mode = environment.inputMode === "standalone" ? "商品モード" : "従来型";
  return `${mode}・確認コード${environment.otpEnabled ? "あり" : "なし"}`;
}

export function AdminDirectory({ environments, users, truncated, selectedSlug, onSelect, origin, todayJst }: Props) {
  const [query, setQuery] = useState("");
  // 見出しを押して開閉した環境（id → 開いているか）。押していない環境は既定の開閉に従う
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [manualCopyId, setManualCopyId] = useState<string | null>(null);

  const sortedEnvironments = useMemo(() => sortEnvironments(environments), [environments]);
  const allCounts = useMemo(() => countUsersByEnvironment(users), [users]);
  const groups = useMemo(
    () => groupDirectoryUsers(environments, users, { environmentSlug: selectedSlug || null, query }),
    [environments, users, selectedSlug, query]
  );
  const searching = query.trim() !== "";

  // 既定の開閉：環境を 1 つ選んでいるとき・探しているときは開く。
  // 全環境のときは、本番だけ閉じておく（人数が多く、誤って開く先にもしたくないため）。
  const isOpen = (environment: DirectoryEnvironment): boolean => {
    if (searching || selectedSlug !== "") return true;
    const override = toggled[environment.id];
    if (override !== undefined) return override;
    return environment.purpose?.tone !== "production";
  };

  const fullUrl = (user: DirectoryUser): string => {
    const base = origin || (typeof window !== "undefined" ? window.location.origin : "");
    return `${base}${user.loginPath}`;
  };

  // 行の目印。参加者と管理する側は別の表なので、種別と id を合わせて 1 行を決める
  const rowKeyOf = (user: DirectoryUser): string => `${user.kind}-${user.id}`;

  const copyUrl = async (user: DirectoryUser) => {
    const key = rowKeyOf(user);
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(fullUrl(user));
      setManualCopyId(null);
      setCopiedId(key);
      window.setTimeout(() => setCopiedId((current) => (current === key ? null : current)), 2000);
    } catch {
      // コピーできない環境（権限がない、古いブラウザなど）では、その人の URL だけを欄に出す
      setCopiedId(null);
      setManualCopyId(key);
    }
  };

  return (
    <section className="card overflow-hidden mb-5" aria-label="環境とユーザー">
      <div className="px-5 py-4 border-b border-[#EFE8DD]">
        <h2 className="text-sm font-semibold text-[#1A1A2E]">環境とユーザー</h2>
        <p className="text-[11px] text-[#8B8489] mt-0.5">
          環境を押すと、画面全体がその環境に切り替わります。ログイン用のURLは、1人ずつ開くかコピーして使います。
        </p>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onSelect("")}
            aria-pressed={selectedSlug === ""}
            className={`text-left rounded-xl border p-3 transition-colors ${
              selectedSlug === "" ? "border-[#1A1A2E] ring-1 ring-[#1A1A2E] bg-white" : "border-[#EFE8DD] bg-white hover:bg-[#FBF8F4]"
            }`}
          >
            <div className="text-xs font-semibold text-[#1A1A2E]">全環境</div>
            <div className="text-[11px] text-[#8B8489] mt-1">{environments.length}つの環境をまとめて表示</div>
          </button>
          {sortedEnvironments.map((environment) => {
            const selected = selectedSlug === environment.slug;
            return (
              <button
                key={environment.id}
                type="button"
                onClick={() => onSelect(environment.slug)}
                aria-pressed={selected}
                className={`text-left rounded-xl border p-3 transition-colors ${
                  selected ? "border-[#1A1A2E] ring-1 ring-[#1A1A2E] bg-white" : "border-[#EFE8DD] bg-white hover:bg-[#FBF8F4]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#1A1A2E] break-words">{environment.name}</div>
                    {environment.companyName && environment.companyName !== environment.name && (
                      <div className="text-[11px] text-[#8B8489] break-words">{environment.companyName}</div>
                    )}
                  </div>
                  <PurposeBadge environment={environment} />
                </div>
                <div className="text-[11px] text-[#5B5560] mt-1.5">
                  {formatEnvironmentCounts(allCounts.get(environment.id) ?? emptyCounts())}
                </div>
                <div className="text-[11px] text-[#8B8489]">{settingsLine(environment)}</div>
              </button>
            );
          })}
        </div>

        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
            <h3 className="text-xs font-semibold text-[#1A1A2E] whitespace-nowrap">ユーザーとログインURL</h3>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="氏名・部署で探す"
              aria-label="氏名・部署で探す"
              className="input-field text-xs sm:max-w-[220px]"
            />
          </div>

          {truncated && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
              人数が多いため、一部だけを表示しています。
            </p>
          )}

          {groups.length === 0 ? (
            <p className="text-xs text-[#8B8489] px-1 py-3">
              {searching ? "当てはまるユーザーがいません。" : "表示できる環境がありません。"}
            </p>
          ) : (
            <div className="rounded-xl border border-[#EFE8DD] overflow-hidden divide-y divide-[#EFE8DD]">
              {groups.map((group) => {
                const open = isOpen(group.environment);
                return (
                  <div key={group.environment.id}>
                    <button
                      type="button"
                      onClick={() => setToggled((prev) => ({ ...prev, [group.environment.id]: !open }))}
                      aria-expanded={open}
                      className="w-full text-left px-3 py-2.5 bg-[#FBF8F4] hover:bg-[#F5F0EB] transition-colors flex flex-wrap items-center gap-x-2 gap-y-1"
                    >
                      <span className="text-xs font-semibold text-[#1A1A2E] break-words">{environmentLabel(group.environment)}</span>
                      <PurposeBadge environment={group.environment} />
                      <span className="text-[11px] text-[#8B8489]">{formatEnvironmentCounts(group.counts)}</span>
                      <span className="text-[11px] text-[#8B8489] ml-auto whitespace-nowrap">{open ? "閉じる" : "開く"}</span>
                    </button>
                    {open && group.users.length === 0 && (
                      <p className="text-[11px] text-[#8B8489] px-3 py-2.5">この環境には、まだユーザーがいません。</p>
                    )}
                    {open &&
                      group.users.map((user) => {
                        const added = formatJstMonthDay(user.createdAt);
                        const rowKey = rowKeyOf(user);
                        return (
                          <div key={rowKey} className="px-3 py-2.5 border-t border-[#EFE8DD]">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="text-xs font-medium text-[#1A1A2E] break-words">{user.name}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#F2F2F7] text-[#5B5560] whitespace-nowrap">
                                    {USER_KIND_LABEL[user.kind]}
                                  </span>
                                  {isAddedOn(user.createdAt, todayJst) && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 whitespace-nowrap">
                                      今日追加
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-[#8B8489] break-words">
                                  {[user.department, added ? `追加 ${added}` : ""].filter((s) => s !== "").join("・")}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
                                <a
                                  href={user.loginPath}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-[#1A1A2E] text-white hover:bg-[#2C2C4A] transition-colors whitespace-nowrap"
                                >
                                  画面を開く
                                </a>
                                <button
                                  type="button"
                                  onClick={() => copyUrl(user)}
                                  className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-[#EFE8DD] text-[#5B5560] hover:bg-[#E5DDD3] transition-colors whitespace-nowrap"
                                >
                                  {copiedId === rowKey ? "コピーしました" : "URLをコピー"}
                                </button>
                              </div>
                            </div>
                            {manualCopyId === rowKey && (
                              <div className="mt-2">
                                <p className="text-[11px] text-amber-700 mb-1">コピーできませんでした。下のURLを選んでコピーしてください。</p>
                                <input
                                  readOnly
                                  value={fullUrl(user)}
                                  onFocus={(e) => e.currentTarget.select()}
                                  aria-label={`${user.name}さんのログイン用URL`}
                                  className="input-field text-xs font-mono"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
