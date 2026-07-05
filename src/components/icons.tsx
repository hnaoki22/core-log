/**
 * CORE Log icon set — thin-stroke line icons, brand-consistent.
 *
 * Replaces OS emoji in UI chrome (feature menus, section markers, stat
 * cards). All icons are 24×24 viewBox, stroke-based, and inherit color
 * via `currentColor` so the caller controls tone with text-* classes.
 */

type IconProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
};

function base(props: IconProps) {
  return {
    width: props.size ?? 20,
    height: props.size ?? 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: props.strokeWidth ?? 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: props.className,
    "aria-hidden": true as const,
  };
}

/** 反芻分析 — repeating thought loop */
export const IconRepeat = (p: IconProps) => (
  <svg {...base(p)}>
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

/** アンラーン — rewind / let go */
export const IconRotateCcw = (p: IconProps) => (
  <svg {...base(p)}>
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </svg>
);

/** 週次コンセプト — idea */
export const IconBulb = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 18h6" />
    <path d="M10 22h4" />
    <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3v1h6v-1c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z" />
  </svg>
);

/** 自分の変化 — upward trend */
export const IconTrendingUp = (p: IconProps) => (
  <svg {...base(p)}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

/** 効力感 — gauge */
export const IconGauge = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 15a8 8 0 1 1 16 0" />
    <line x1="12" y1="15" x2="16" y2="9" />
    <circle cx="12" cy="15" r="1" fill="currentColor" />
    <path d="M2 19h20" />
  </svg>
);

/** 希望設計 — compass */
export const IconCompass = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="10" />
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  </svg>
);

/** ピア振り返り — two people */
export const IconUsers = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

/** AAR — clipboard */
export const IconClipboard = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <line x1="9" y1="12" x2="15" y2="12" />
    <line x1="9" y1="16" x2="13" y2="16" />
  </svg>
);

/** アウトサイト / 検索 */
export const IconSearch = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

/** 観の期 — window */
export const IconWindow = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4" y="3" width="16" height="18" rx="1.5" />
    <line x1="12" y1="3" x2="12" y2="21" />
    <line x1="4" y1="12" x2="20" y2="12" />
  </svg>
);

/** AI分析 / レポート — line chart in frame */
export const IconChartLine = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <polyline points="7 15 10.5 11 13.5 13.5 17 9" />
  </svg>
);

/** 連続記入 — flame */
export const IconFlame = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 22c4 0 7-2.9 7-6.8 0-2.9-1.6-5.1-3.2-6.9-.9-1-1.8-2.1-2.4-3.4a13 13 0 0 1-.9-2.9 9.7 9.7 0 0 0-3.2 4.3c-.5 1.4-.6 2.7-.4 3.9-.8-.4-1.5-1.1-2-2.1-1.2 1.5-1.9 3.2-1.9 5.1 0 3.9 3 6.8 7 6.8z" />
  </svg>
);

/** 記入 — pen */
export const IconPen = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

/** フィードバック — message */
export const IconMessage = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

/** 完了 — check */
export const IconCheck = (p: IconProps) => (
  <svg {...base(p)}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/** 追加 — plus */
export const IconPlus = (p: IconProps) => (
  <svg {...base(p)}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

/** ナビゲーション — chevron */
export const IconChevronRight = (p: IconProps) => (
  <svg {...base(p)}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

/** カレンダー */
export const IconCalendar = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

/** CSVダウンロード */
export const IconDownload = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

/** ミッション — target */
export const IconTarget = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

/** 統計 — bar chart */
export const IconChartBar = (p: IconProps) => (
  <svg {...base(p)}>
    <line x1="12" y1="20" x2="12" y2="10" />
    <line x1="18" y1="20" x2="18" y2="4" />
    <line x1="6" y1="20" x2="6" y2="16" />
  </svg>
);

/** レポート — document */
export const IconFile = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

/** マルチテナント — building */
export const IconBuilding = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4" y="2" width="16" height="20" rx="1.5" />
    <line x1="9" y1="6.5" x2="10.5" y2="6.5" />
    <line x1="13.5" y1="6.5" x2="15" y2="6.5" />
    <line x1="9" y1="10.5" x2="10.5" y2="10.5" />
    <line x1="13.5" y1="10.5" x2="15" y2="10.5" />
    <line x1="9" y1="14.5" x2="10.5" y2="14.5" />
    <line x1="13.5" y1="14.5" x2="15" y2="14.5" />
    <path d="M10 22v-3.5h4V22" />
  </svg>
);

/** ナレッジ — book */
export const IconBook = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);
