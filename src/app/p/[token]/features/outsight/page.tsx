"use client";

import { useParams } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";
import { useState, useEffect } from "react";

type OutsightTask = {
  id: string;
  task: string;
  deadline: string;
  status: "current" | "completed";
};

export default function OutsightPage() {
  const params = useParams();
  const token = params.token as string;

  const { isOn } = useFeatures();
  const [tasks, setTasks] = useState<OutsightTask[]>([]);
  const [reflection, setReflection] = useState("");
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<{ feedback: number; feedbackTotal: number; mission: number }>({ feedback: 0, feedbackTotal: 0, mission: 0 });

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/features/outsight?token=${token}`);
        if (res.ok) {
          const data = await res.json();
          setTasks(data.tasks || []);
        }
        const badgesRes = await fetch(`/api/logs?token=${token}`);
        if (badgesRes.ok) {
          const badgesData = await badgesRes.json();
          if (badgesData.badges) setBadges(badgesData.badges);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [token]);

  const handleComplete = async (taskId: string) => {
    if (!reflection.trim()) return;
    setCompletingId(taskId);
    try {
      const res = await fetch("/api/features/outsight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "complete", taskId, reflection }),
      });
      if (res.ok) {
        const refreshRes = await fetch(`/api/features/outsight?token=${token}`);
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setTasks(data.tasks || []);
        }
        setReflection("");
      }
    } catch {
      // silently fail
    } finally {
      setCompletingId(null);
    }
  };

  if (!isOn("tier-c.outsightTask")) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <p className="text-[#5B5560] text-sm">このフィーチャーは有効になっていません</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#1A1A2E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#8B8489] text-sm">データを準備しています...</p>
        </div>
      </div>
    );
  }

  const currentTask = tasks.find(t => t.status === "current");
  const completedTasks = tasks.filter(t => t.status === "completed");

  return (
    <div className="min-h-screen bg-[#F5F0EB] pb-24">
      {/* Header with Back Button */}
      <div className="gradient-header text-white px-6 pt-12 pb-6">
        <div className="max-w-md mx-auto relative z-10">
          <Link href={`/p/${token}`} className="inline-flex items-center gap-1 text-indigo-200 hover:text-white transition-colors mb-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            <span className="text-xs font-medium">戻る</span>
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">アウトサイト・タスク</h1>
          <p className="text-indigo-200 text-sm mt-1 font-light">外部視点からの成長課題</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 animate-fade-up relative z-10">
        {/* Current Task */}
        {currentTask ? (
          <div className="card p-5 mb-5 border-l-4 border-l-[#1A1A2E]">
            <h3 className="font-semibold text-sm text-[#1A1A2E] mb-3">現在のタスク</h3>
            <div className="bg-[#F5F0EB] p-3 rounded-xl border border-[#EFE8DD] mb-3">
              <p className="text-sm text-[#2C2C4A]">{currentTask.task}</p>
            </div>
            {currentTask.deadline && (
              <p className="text-xs text-[#8B8489] mb-3">期限: {new Date(currentTask.deadline).toLocaleDateString("ja-JP")}</p>
            )}

            <div>
              <label className="text-sm font-medium text-[#1A1A2E] block mb-2">完了時の振り返り</label>
              <textarea
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                placeholder="このタスクから学んだことを記入"
                className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
                rows={3}
              />
            </div>

            <button
              onClick={() => handleComplete(currentTask.id)}
              disabled={completingId !== null || !reflection.trim()}
              className="w-full mt-3 bg-emerald-600 text-white py-3 rounded-xl hover:bg-emerald-700 disabled:bg-[#C9BDAE] disabled:text-[#8B8489] transition-colors font-medium text-sm"
            >
              {completingId === currentTask.id ? "完了中..." : "タスクを完了"}
            </button>
          </div>
        ) : (
          <div className="card p-8 text-center mb-5">
            <div className="w-12 h-12 bg-[#EFE8DD] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B8489" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4"/>
              </svg>
            </div>
            <p className="text-[#5B5560] text-sm mb-1">現在のタスクがありません</p>
            <p className="text-xs text-[#8B8489]">新しいタスクを待機中です</p>
          </div>
        )}

        {/* Completed Tasks */}
        {completedTasks.length > 0 && (
          <div>
            <h3 className="font-semibold text-sm text-[#1A1A2E] mb-3">完了済みタスク</h3>
            <div className="space-y-2">
              {completedTasks.map((task) => (
                <div key={task.id} className="card p-4 opacity-75">
                  <p className="text-sm text-[#2C2C4A]">{task.task}</p>
                  <p className="text-xs text-[#8B8489] mt-1">✓ 完了</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <BottomNav active="home" baseUrl={`/p/${token}`} badges={badges} />
    </div>
  );
}
