"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";

interface Reflection {
  id: string;
  reflection: string;
  support_actions: string | null;
  challenges: string | null;
  created_at: string;
}

interface ReflectionResponse {
  success: boolean;
  reflections: Reflection[];
  count: number;
}

export default function ReflectionPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { isOn } = useFeatures();

  const [weekLabel, setWeekLabel] = useState("");
  const [supportActions, setSupportActions] = useState("");
  const [challenges, setChallenges] = useState("");
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch past reflections
  useEffect(() => {
    async function fetchReflections() {
      try {
        const res = await fetch(`/api/features/manager-reflection?token=${token}`);
        if (!res.ok) {
          if (res.status === 403) {
            setError("マネージャー自己省察機能が有効化されていません");
          } else {
            setError("データの取得に失敗しました");
          }
          return;
        }
        const data: ReflectionResponse = await res.json();
        setReflections(data.reflections || []);
      } catch {
        setError("データ取得中にエラーが発生しました");
      } finally {
        setDataLoading(false);
      }
    }
    fetchReflections();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!weekLabel.trim()) {
      setError("週ラベルを入力してください");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/features/manager-reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          weekLabel,
          supportActions: supportActions || undefined,
          challenges: challenges || undefined,
          reflection: weekLabel,
        }),
      });

      if (!res.ok) {
        if (res.status === 403) {
          setError("マネージャー自己省察機能が有効化されていません");
        } else {
          setError("省察の保存に失敗しました");
        }
        return;
      }

      setSuccess(true);
      setWeekLabel("");
      setSupportActions("");
      setChallenges("");

      // Refresh reflections
      const listRes = await fetch(`/api/features/manager-reflection?token=${token}`);
      if (listRes.ok) {
        const data: ReflectionResponse = await listRes.json();
        setReflections(data.reflections || []);
      }

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("保存中にエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  if (!isOn("tier-a.managerSelfReflection")) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-[#5B5560] mb-4">このフィーチャーは現在利用できません</p>
          <Link href={`/m/${token}`} className="text-[#1A1A2E] font-medium hover:underline">
            ダッシュボードに戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F0EB] pb-8">
      {/* Header */}
      <div className="gradient-header-manager text-white px-6 pt-12 pb-6">
        <div className="max-w-md mx-auto relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => router.back()}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 transition-colors"
              aria-label="戻る"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">マネージャー自己省察</h1>
          <p className="text-indigo-300 text-sm font-light">週次リーダーシップ振り返り</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 space-y-4 animate-fade-up relative z-10">
        {/* Form */}
        <form onSubmit={handleSubmit} className="card p-4 space-y-3">
          {error && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50">
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-lg border border-green-200 bg-green-50">
              <p className="text-xs text-green-700">✓ 省察が保存されました</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[#5B5560] uppercase tracking-wide">
              週ラベル（例：4月7-11日）
            </label>
            <input
              type="text"
              value={weekLabel}
              onChange={(e) => setWeekLabel(e.target.value)}
              placeholder="例：4月7-11日、第2週"
              className="w-full px-3 py-2.5 border border-[#E5DCD0] rounded-xl bg-white text-[#1A1A2E] text-sm placeholder-[#8B8489] focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[#5B5560] uppercase tracking-wide">
              支援アクション
            </label>
            <textarea
              value={supportActions}
              onChange={(e) => setSupportActions(e.target.value)}
              placeholder="チームに対して実施した支援や対応を記入"
              rows={3}
              className="w-full px-3 py-2.5 border border-[#E5DCD0] rounded-xl bg-white text-[#1A1A2E] text-sm placeholder-[#8B8489] focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[#5B5560] uppercase tracking-wide">
              課題と学び
            </label>
            <textarea
              value={challenges}
              onChange={(e) => setChallenges(e.target.value)}
              placeholder="直面した課題や今週の学びを記入"
              rows={3}
              className="w-full px-3 py-2.5 border border-[#E5DCD0] rounded-xl bg-white text-[#1A1A2E] text-sm placeholder-[#8B8489] focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary h-10 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>保存中...</span>
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                </svg>
                <span>保存</span>
              </>
            )}
          </button>
        </form>

        {/* Past Reflections */}
        {!dataLoading && reflections.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-[#5B5560] tracking-wide uppercase mb-3 px-1">
              過去の省察 ({reflections.length}件)
            </h2>
            <div className="space-y-2">
              {reflections.map((reflection) => (
                <button
                  key={reflection.id}
                  onClick={() => setExpandedId(expandedId === reflection.id ? null : reflection.id)}
                  className="w-full card p-4 text-left hover:bg-[#FAFAF8] transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-xs text-[#8B8489] font-medium">
                        {formatDate(reflection.created_at)}
                      </p>
                      <p className="text-sm text-[#1A1A2E] font-medium mt-1 line-clamp-1">
                        {reflection.reflection || "（内容なし）"}
                      </p>
                    </div>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`text-[#8B8489] flex-shrink-0 ml-2 transition-transform ${expandedId === reflection.id ? "rotate-180" : ""}`}
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>

                  {/* Expanded Details */}
                  {expandedId === reflection.id && (
                    <div className="mt-3 pt-3 border-t border-[#E5DCD0] space-y-2">
                      {reflection.support_actions && (
                        <div>
                          <p className="text-[10px] text-[#8B8489] font-semibold uppercase tracking-wide mb-1">
                            支援アクション
                          </p>
                          <p className="text-xs text-[#1A1A2E] leading-relaxed">{reflection.support_actions}</p>
                        </div>
                      )}
                      {reflection.challenges && (
                        <div>
                          <p className="text-[10px] text-[#8B8489] font-semibold uppercase tracking-wide mb-1">
                            課題と学び
                          </p>
                          <p className="text-xs text-[#1A1A2E] leading-relaxed">{reflection.challenges}</p>
                        </div>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!dataLoading && reflections.length === 0 && (
          <div className="card p-8 text-center space-y-3">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-[#8B8489]">
              <path d="M12 2v20M2 12h20"/>
            </svg>
            <p className="text-sm text-[#5B5560]">まだ省察を記録していません</p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-6 text-[11px] text-[#C9BDAE]">
          CORE Log — マネージャー自己省察
        </div>
      </div>
    </div>
  );
}
