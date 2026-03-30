"use client";

interface BadgeCounts {
  feedback?: number;
  mission?: number;
}

interface BottomNavProps {
  active: "home" | "logs" | "feedback" | "mission";
  baseUrl: string;
  badges?: BadgeCounts;
}

export function BottomNav({ active, baseUrl, badges }: BottomNavProps) {
  const tabs = [
    { id: "home", label: "ホーム", emoji: "🏠", path: "" },
    { id: "logs", label: "ログ", emoji: "📋", path: "logs" },
    { id: "feedback", label: "FB", emoji: "🎓", path: "feedback" },
    { id: "mission", label: "ミッション", emoji: "🎯", path: "mission" },
  ] as const;

  const getBadge = (tabId: string): number => {
    if (!badges) return 0;
    if (tabId === "feedback") return badges.feedback ?? 0;
    if (tabId === "mission") return badges.mission ?? 0;
    return 0;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E8E5F0] safe-area-bottom">
      <div className="max-w-md mx-auto flex justify-around">
        {tabs.map((tab) => {
          const badge = getBadge(tab.id);
          return (
            <a
              key={tab.id}
              href={tab.path ? `${baseUrl}/${tab.path}` : baseUrl}
              className={`flex-1 flex flex-col items-center justify-center py-3 px-2 transition-colors ${
                active === tab.id
                  ? "text-[#5B4FD6] border-t-2 border-[#5B4FD6]"
                  : "text-[#8B85A8] hover:text-[#5B4FD6]"
              }`}
            >
              <div className="relative text-2xl mb-1">
                {tab.emoji}
                {badge > 0 && (
                  <span className="absolute -top-1 -right-3 bg-[#FF4444] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow-sm">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </div>
              <div className="text-xs font-medium text-center">{tab.label}</div>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
