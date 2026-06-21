"use client";

// 管理画面: 毎日の問い（7曜日 × 軸 × 朝/夕）の編集。admin 専用。
// 1行1問で編集 → 保存（/api/admin/daily-questions）。反映は最大1分（読み取りキャッシュTTL）。

import { useParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
type DayData = { axis: string; morning: string[]; evening: string[] };
type Weekly = Record<DayKey, DayData>;
type TenantOpt = { id: string; slug: string; name: string };

const DAY_ORDER: { key: DayKey; label: string; defaultAxis: string }[] = [
  { key: "monday", label: "月", defaultAxis: "意図" },
  { key: "tuesday", label: "火", defaultAxis: "対話" },
  { key: "wednesday", label: "水", defaultAxis: "感情" },
  { key: "thursday", label: "木", defaultAxis: "学び" },
  { key: "friday", label: "金", defaultAxis: "体" },
  { key: "saturday", label: "土", defaultAxis: "関係" },
  { key: "sunday", label: "日", defaultAxis: "統合" },
];

function emptyWeekly(): Weekly {
  const w = {} as Weekly;
  for (const d of DAY_ORDER) w[d.key] = { axis: d.defaultAxis, morning: [], evening: [] };
  return w;
}

export default function DailyQuestionsAdminPage() {
  const params = useParams();
  const token = params.token as string;

  const [weekly, setWeekly] = useState<Weekly>(emptyWeekly());
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [allTenants, setAllTenants] = useState<TenantOpt[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const apiUrl = useCallback(
    (base: string) => {
      let url = `${base}?token=${encodeURIComponent(token)}`;
      const slug =
        tenantSlug ??
        (typeof window !== "undefined"
          ? new URL(window.location.href).searchParams.get("tenant")
          : null);
      if (slug) url += `&tenant=${encodeURIComponent(slug)}`;
      return url;
    },
    [token, tenantSlug]
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(apiUrl("/api/admin/daily-questions"));
        const json = await res.json();
        if (res.ok && json.success) {
          const base = emptyWeekly();
          if (json.weekly) {
            for (const d of DAY_ORDER) {
              const src = json.weekly[d.key];
              if (src) {
                base[d.key] = {
                  axis: src.axis || d.defaultAxis,
                  morning: Array.isArray(src.morning) ? src.morning : [],
                  evening: Array.isArray(src.evening) ? src.evening : [],
                };
              }
            }
          }
          setWeekly(base);
          setTenantSlug(json.tenantSlug ?? null);
          setTenantName(json.tenantName ?? null);
          setAllTenants(json.allTenants ?? []);
          setIsSuperAdmin(!!json.isSuperAdmin);
        } else {
          setMsg(json.error || "読み込みに失敗しました");
        }
      } catch {
        setMsg("通信エラーが発生しました");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setDay(key: DayKey, patch: Partial<DayData>) {
    setWeekly((w) => ({ ...w, [key]: { ...w[key], ...patch } }));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(apiUrl("/api/admin/daily-questions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "save", weekly }),
      });
      const json = await res.json();
      setMsg(
        res.ok && json.success
          ? "保存しました（参加者画面への反映まで最大1分）"
          : json.error || "保存に失敗しました"
      );
    } catch {
      setMsg("通信エラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center">
        <p className="text-[#5B5560] text-sm">読み込み中…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F0EB] pb-28">
      <div className="gradient-header text-white px-6 pt-12 pb-6">
        <div className="max-w-2xl mx-auto">
          <Link
            href={`/a/${token}/features`}
            className="text-indigo-200 hover:text-white text-sm mb-3 inline-block"
          >
            ← 機能設定に戻る
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">毎日の問い（曜日 × 朝夕）</h1>
          {tenantName && (
            <p className="text-indigo-200 text-sm mt-1">編集中: {tenantName}</p>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 pt-6 space-y-5">
        {isSuperAdmin && allTenants.length > 0 && (
          <div className="card p-4">
            <label className="text-xs text-[#8B8489] block mb-1">テナント</label>
            <select
              className="w-full border border-stone-300 rounded-lg p-2 text-sm bg-white"
              value={tenantSlug ?? ""}
              onChange={(e) => {
                const url = new URL(window.location.href);
                if (e.target.value) url.searchParams.set("tenant", e.target.value);
                else url.searchParams.delete("tenant");
                window.location.href = url.toString();
              }}
            >
              {allTenants.map((t) => (
                <option key={t.id} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <p className="text-xs text-[#5B5560] leading-relaxed">
          各曜日の「軸」と、朝・夕の問いを編集できます。<strong>1行に1問</strong>で入力してください（空行は無視されます）。保存すると参加者の入力画面に反映されます（最大1分）。
        </p>

        {DAY_ORDER.map((d) => (
          <div key={d.key} className="card p-5 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-base font-semibold text-[#1A1A2E] w-12">{d.label}曜</span>
              <input
                className="flex-1 border border-stone-300 rounded-lg p-2 text-sm bg-white"
                value={weekly[d.key].axis}
                onChange={(e) => setDay(d.key, { axis: e.target.value })}
                placeholder="軸（例：意図）"
              />
            </div>
            <div>
              <label className="text-xs text-[#8B8489] block mb-1">朝の意図（1行1問）</label>
              <textarea
                rows={5}
                className="w-full border border-stone-300 rounded-lg p-2 text-sm leading-relaxed bg-white"
                value={weekly[d.key].morning.join("\n")}
                onChange={(e) => setDay(d.key, { morning: e.target.value.split("\n") })}
              />
            </div>
            <div>
              <label className="text-xs text-[#8B8489] block mb-1">夕の振り返り（1行1問）</label>
              <textarea
                rows={5}
                className="w-full border border-stone-300 rounded-lg p-2 text-sm leading-relaxed bg-white"
                value={weekly[d.key].evening.join("\n")}
                onChange={(e) => setDay(d.key, { evening: e.target.value.split("\n") })}
              />
            </div>
          </div>
        ))}

        {msg && <p className="text-sm text-center text-[#1A1A2E]">{msg}</p>}

        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="text-sm font-medium text-white bg-[#1A1A2E] rounded-full px-6 py-2.5 disabled:opacity-40 transition-opacity"
          >
            {saving ? "保存中…" : "保存する"}
          </button>
        </div>
      </div>
    </div>
  );
}
