"use client";

import { useParams } from "next/navigation";
import { getAllParticipants, getAllManagers } from "@/lib/mock-data";

const ADMIN_TOKENS = ["munetomo-admin", "UE8m8SSJAgRBwsSZ"];

export default function AdminDashboard() {
  const params = useParams();
  const token = params.token as string;

  if (!ADMIN_TOKENS.includes(token)) {
    return (
      <div className="min-h-screen bg-[#F8F7FF] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-[#1E1B3A]">アクセス権限がありません</h1>
          <p className="text-[#8B85A8] mt-2">有効な管理者トークンが必要です。</p>
        </div>
      </div>
    );
  }

  const participants = getAllParticipants();
  const managers = getAllManagers();

  const totalLogs = participants.reduce((sum, p) => sum + p.logs.filter(l => l.status !== "empty").length, 0);
  const avgEntryRate = Math.round(participants.reduce((sum, p) => sum + p.entryRate, 0) / participants.length);
  const totalFeedbacks = participants.reduce((sum, p) => sum + p.fbCount, 0);

  const getStatusBadge = (rate: number, streak: number) => {
    if (streak > 0 && rate >= 80) return { emoji: "🟢", label: "順調" };
    if (rate >= 50) return { emoji: "🟡", label: "やや停滞" };
    return { emoji: "🔴", label: "要フォロー" };
  };

  return (
    <div className="min-h-screen bg-[#F8F7FF]">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1E1B3A] to-[#3D3560] text-white p-6 pb-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">⚙️</span>
            <h1 className="text-2xl font-bold">CORE Log 管理者ダッシュボード</h1>
          </div>
          <p className="text-white/70 text-sm ml-10">システム全体の状況を一覧で確認できます</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-[#E8E5F0]">
            <div className="text-3xl font-bold text-[#5B4FD6]">{participants.length}</div>
            <div className="text-xs text-[#8B85A8] mt-1">参加者数</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-[#E8E5F0]">
            <div className="text-3xl font-bold text-[#22C55E]">{avgEntryRate}%</div>
            <div className="text-xs text-[#8B85A8] mt-1">平均記入率</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-[#E8E5F0]">
            <div className="text-3xl font-bold text-[#FF8C42]">{totalLogs}</div>
            <div className="text-xs text-[#8B85A8] mt-1">総ログ数</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-[#E8E5F0]">
            <div className="text-3xl font-bold text-[#5B4FD6]">{totalFeedbacks}</div>
            <div className="text-xs text-[#8B85A8] mt-1">FB配信数</div>
          </div>
        </div>

        {/* Participants Table */}
        <div className="bg-white rounded-xl shadow-sm border border-[#E8E5F0] mb-6">
          <div className="p-4 border-b border-[#E8E5F0]">
            <h2 className="text-lg font-bold text-[#1E1B3A] flex items-center gap-2">
              👤 参加者一覧
            </h2>
          </div>
          <div className="divide-y divide-[#E8E5F0]">
            {participants.map((p) => {
              const status = getStatusBadge(p.entryRate, p.streak);
              const latestLog = p.logs.find(l => l.status !== "empty");
              return (
                <div key={p.id} className="p-4 hover:bg-[#F8F7FF] transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span>{status.emoji}</span>
                        <span className="font-semibold text-[#1E1B3A]">{p.name}</span>
                        <span className="text-xs bg-[#EDE9FF] text-[#5B4FD6] px-2 py-0.5 rounded-full">
                          {p.dojoPhase}
                        </span>
                      </div>
                      <div className="text-sm text-[#8B85A8] mb-2">{p.department}</div>
                      <div className="flex gap-4 text-xs text-[#8B85A8]">
                        <span>記入率: <strong className="text-[#1E1B3A]">{p.entryRate}%</strong></span>
                        <span>連続: <strong className="text-[#1E1B3A]">{p.streak}日</strong></span>
                        <span>FB: <strong className="text-[#1E1B3A]">{p.fbCount}回</strong></span>
                        <span>ミッション: <strong className="text-[#1E1B3A]">{p.missions.length}件</strong></span>
                      </div>
                      {latestLog && (
                        <div className="mt-2 text-xs text-[#6B6580] bg-[#F8F7FF] rounded-lg p-2">
                          <span className="text-[#8B85A8]">最新 ({latestLog.date}):</span>{" "}
                          {latestLog.morningIntent || "（未記入）"}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 ml-4">
                      <span className="text-xs px-2 py-1 rounded-full bg-[#F0EEFF] text-[#5B4FD6]">
                        {status.label}
                      </span>
                      <div className="flex gap-0.5 mt-1">
                        {p.logs.slice(0, 7).map((log, i) => (
                          <div
                            key={i}
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor:
                                log.energy === "excellent" ? "#FF8C42" :
                                log.energy === "good" ? "#22C55E" :
                                log.energy === "okay" ? "#8B85A8" :
                                log.energy === "low" ? "#EF4444" :
                                "#E8E5F0",
                            }}
                            title={`${log.date}: ${log.energy || "未記入"}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Managers Table */}
        <div className="bg-white rounded-xl shadow-sm border border-[#E8E5F0] mb-6">
          <div className="p-4 border-b border-[#E8E5F0]">
            <h2 className="text-lg font-bold text-[#1E1B3A] flex items-center gap-2">
              👔 マネージャー一覧
            </h2>
          </div>
          <div className="divide-y divide-[#E8E5F0]">
            {managers.map((m) => (
              <div key={m.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-[#1E1B3A]">{m.name}</div>
                    <div className="text-sm text-[#8B85A8]">{m.department}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-[#5B4FD6] font-semibold">
                      担当: {m.participantIds.length}名
                    </div>
                    <div className="text-xs text-[#8B85A8] mt-1">
                      {m.participantIds
                        .map(pid => {
                          const p = participants.find(pp => pp.id === pid);
                          return p?.name || pid;
                        })
                        .join("、")}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* System Info */}
        <div className="bg-white rounded-xl shadow-sm border border-[#E8E5F0] mb-6">
          <div className="p-4 border-b border-[#E8E5F0]">
            <h2 className="text-lg font-bold text-[#1E1B3A] flex items-center gap-2">
              🔧 システム情報
            </h2>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-[#F0EEFF]">
              <span className="text-sm text-[#8B85A8]">データソース</span>
              <span className="text-sm font-medium text-[#1E1B3A]">Notion API + モックデータ</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#F0EEFF]">
              <span className="text-sm text-[#8B85A8]">デプロイ先</span>
              <span className="text-sm font-medium text-[#1E1B3A]">Vercel（自動デプロイ）</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#F0EEFF]">
              <span className="text-sm text-[#8B85A8]">認証方式</span>
              <span className="text-sm font-medium text-[#1E1B3A]">トークン付きURL（個別発行）</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#F0EEFF]">
              <span className="text-sm text-[#8B85A8]">Notionデータベース</span>
              <span className="text-sm font-medium text-[#22C55E]">✓ 接続済み</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-[#8B85A8]">AIフィードバック</span>
              <span className="text-sm font-medium text-[#FF8C42]">準備中（Phase 2で実装）</span>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="bg-white rounded-xl shadow-sm border border-[#E8E5F0] mb-8">
          <div className="p-4 border-b border-[#E8E5F0]">
            <h2 className="text-lg font-bold text-[#1E1B3A] flex items-center gap-2">
              🔗 クイックリンク
            </h2>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <a
              href="/p/munetomo-participant"
              className="block p-3 bg-gradient-to-r from-[#EDE9FF] to-white rounded-lg border border-[#E8E5F0] hover:shadow-md transition-shadow"
            >
              <div className="font-semibold text-[#5B4FD6] text-sm">📱 参加者画面を体験</div>
              <div className="text-xs text-[#8B85A8] mt-1">日報入力・フィードバック確認・ミッション確認</div>
            </a>
            <a
              href="/m/munetomo-manager"
              className="block p-3 bg-gradient-to-r from-[#FFF8F0] to-white rounded-lg border border-[#E8E5F0] hover:shadow-md transition-shadow"
            >
              <div className="font-semibold text-[#FF8C42] text-sm">📊 上司画面を体験</div>
              <div className="text-xs text-[#8B85A8] mt-1">参加者一覧・詳細・コメント入力</div>
            </a>
          </div>
        </div>

        <div className="text-center text-xs text-[#8B85A8] pb-8">
          CORE Log v1.0 — Powered by Next.js + Notion API
        </div>
      </div>
    </div>
  );
}
