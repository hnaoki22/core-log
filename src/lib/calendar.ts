// ===== Japanese Calendar Utilities =====
// Handles holidays, weekends, and JST date helpers

// JST helper: get current date in JST
export function getJSTDate(): Date {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

// Format as YYYY-MM-DD in JST
export function getJSTDateString(): string {
  return getJSTDate().toISOString().split("T")[0];
}

// Get JST hour (0-23)
export function getJSTHour(): number {
  return getJSTDate().getUTCHours();
}

// Get JST day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
export function getJSTDayOfWeek(): number {
  return getJSTDate().getUTCDay();
}

// Check if a date is weekend (Saturday or Sunday)
export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

// Japanese national holidays for 2026-2027
// These are fixed dates + calculated dates (振替休日 included)
function getJapaneseHolidays(year: number): Set<string> {
  const holidays = new Set<string>();

  const add = (m: number, d: number) => {
    holidays.add(`${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  };

  // 固定祝日
  add(1, 1);   // 元日
  add(2, 11);  // 建国記念の日
  add(2, 23);  // 天皇誕生日
  add(4, 29);  // 昭和の日
  add(5, 3);   // 憲法記念日
  add(5, 4);   // みどりの日
  add(5, 5);   // こどもの日
  add(8, 11);  // 山の日
  add(11, 3);  // 文化の日
  add(11, 23); // 勤労感謝の日

  // ハッピーマンデー制度
  // 成人の日: 1月第2月曜
  add(1, getNthMonday(year, 1, 2));
  // 海の日: 7月第3月曜
  add(7, getNthMonday(year, 7, 3));
  // スポーツの日: 10月第2月曜
  add(10, getNthMonday(year, 10, 2));
  // 敬老の日: 9月第3月曜
  add(9, getNthMonday(year, 9, 3));

  // 春分の日・秋分の日 — National Astronomical Observatory of Japan formula.
  // Previously hardcoded both branches of the year%4 ternary to the same
  // value, so the date never moved. The formula below is accurate for
  // 1980-2099 per the NAO's reference table.
  // Reference: https://www.nao.ac.jp/en/news/yearly-events.html
  const shunbun = Math.floor(20.8431 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
  add(3, shunbun);
  const shubun = Math.floor(23.2488 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
  add(9, shubun);

  // 振替休日: 祝日が日曜の場合、次の非祝日（平日）が休日になる。
  // Loop forward until we hit a day that is neither a holiday nor a weekend.
  // Previously the code only advanced one day, which fails when the next
  // day is itself a holiday (e.g., 5/3 日曜の年 → 5/4 みどりの日 もすでに祝日 → 5/5 →
  // 5/6 平日に振替)。
  const allHolidays = Array.from(holidays);
  for (const h of allHolidays) {
    const d = new Date(h + "T00:00:00Z");
    if (d.getUTCDay() !== 0) continue;
    const candidate = new Date(d);
    for (let attempts = 0; attempts < 7; attempts++) {
      candidate.setUTCDate(candidate.getUTCDate() + 1);
      const key = candidate.toISOString().split("T")[0];
      if (!holidays.has(key) && candidate.getUTCDay() !== 0 && candidate.getUTCDay() !== 6) {
        holidays.add(key);
        break;
      }
    }
  }

  return holidays;
}

// Get the day of month for the Nth Monday in a given month
function getNthMonday(year: number, month: number, n: number): number {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const firstMonday = firstDay.getUTCDay() <= 1
    ? 1 + (1 - firstDay.getUTCDay() + 7) % 7
    : 1 + (8 - firstDay.getUTCDay());
  return firstMonday + (n - 1) * 7;
}

// Cache for holidays — keyed by year. Capped because long-lived dev servers
// would otherwise accumulate entries when callers pass synthetic future years.
// 200 entries is well over what any deployment would ever touch (one entry per
// year, and we only ever care about ~3 years of data) but cheap insurance.
const HOLIDAY_CACHE_MAX = 200;
const holidayCache: Map<number, Set<string>> = new Map();

export function isJapaneseHoliday(dateStr: string): boolean {
  const year = parseInt(dateStr.substring(0, 4));
  let set = holidayCache.get(year);
  if (!set) {
    set = getJapaneseHolidays(year);
    if (holidayCache.size >= HOLIDAY_CACHE_MAX) {
      const oldest = holidayCache.keys().next().value;
      if (oldest !== undefined) holidayCache.delete(oldest);
    }
    holidayCache.set(year, set);
  }
  return set.has(dateStr);
}

// Check if a date is a business day (not weekend, not holiday)
export function isBusinessDay(dateOrStr?: Date | string): boolean {
  let date: Date;
  let dateStr: string;

  if (!dateOrStr) {
    date = getJSTDate();
    dateStr = getJSTDateString();
  } else if (typeof dateOrStr === "string") {
    date = new Date(dateOrStr + "T00:00:00Z");
    dateStr = dateOrStr;
  } else {
    date = dateOrStr;
    dateStr = date.toISOString().split("T")[0];
  }

  return !isWeekend(date) && !isJapaneseHoliday(dateStr);
}

// Day of week label in Japanese
const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export function getDayOfWeekJP(date: Date): string {
  // Compute weekday in JST (Asia/Tokyo) to avoid UTC-server mismatch.
  return DOW_LABELS[new Date(date.getTime() + 9 * 60 * 60 * 1000).getUTCDay()];
}
