"use client";

import { useFeatures } from "@/lib/use-features";

interface BadgeCounts {
  feedback?: number;
  feedbackTotal?: number;
  mission?: number;
}

interface BottomNavProps {
  active: "home" | "logs" | "feedback" | "mission";
  baseUrl: string;
  badges?: BadgeCounts;
}

const HomeIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#1A1A2E" : "#8B8489"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const LogIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#1A1A2E" : "#8B8489"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
);

const FeedbackIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#1A1A2E" : "#8B8489"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

const MissionIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#1A1A2E" : "#8B8489"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="6"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>
);

export function BottomNav({ active, baseUrl, badges }: BottomNavProps) {
  const { isOn, loaded } = useFeatures();
  // While flags are loading, assume all enabled (match historic behavior).
  // Once loaded, respect flags to conditionally hide tabs.
  const fbOn = !loaded || isOn("feature.managerFeedback");
  const missionOn = !loaded || isOn("feature.mission");
  // フィードバック機能がOFFでも、フィードバックが1件でもあればタブを表示する（HM送信分を閲覧可能にする）
  // 未読数ではなく総数で判定：既読後もタブが消えないようにする
  const hasFeedbacks = (badges?.feedbackTotal ?? 0) > 0;

  const allTabs = [
    { id: "home" as const, label: "ホーム", Icon: HomeIcon, path: "", visible: true },
    { id: "logs" as const, label: "ログ", Icon: LogIcon, path: "logs", visible: true },
    { id: "feedback" as const, label: "FB", Icon: FeedbackIcon, path: "feedback", visible: fbOn || hasFeedbacks },
    { id: "mission" as const, label: "ミッション", Icon: MissionIcon, path: "mission", visible: missionOn },
  ];
  const tabs = allTabs.filter((t) => t.visible);

  const getBadge = (tabId: string): number => {
    if (!badges) return 0;
    if (tabId === "feedback") return badges.feedback ?? 0;
    if (tabId === "mission") return badges.mission ?? 0;
    return 0;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-[#EFE8DD] safe-area-bottom z-50">
      <div className="max-w-md mx-auto flex justify-around">
        {tabs.map((tab) => {
          const badge = getBadge(tab.id);
          const isActive = active === tab.id;
          return (
            <a
              key={tab.id}
              href={tab.path ? `${baseUrl}/${tab.path}` : baseUrl}
              className={`flex-1 flex flex-col items-center justify-center py-2.5 px-2 transition-colors relative ${
                isActive ? "text-[#1A1A2E]" : "text-[#8B8489]"
              }`}
            >
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#1A1A2E] rounded-full" />
              )}
              <div className="relative mb-0.5">
                <tab.Icon active={isActive} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-[#8B1A2B] text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </div>
              <div className={`text-[10px] font-medium ${isActive ? "text-[#1A1A2E]" : "text-[#8B8489]"}`}>
                {tab.label}
              </div>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
