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

  // 春分の日（概算）: 3月20日 or 21日
  const shunbun = year % 4 === 0 ? 20 : 20; // 2026は3/20
  add(3, shunbun);

  // 秋分の日（概算）: 9月22日 or 23日
  const shubun = year % 4 === 0 ? 22 : 23; // 2026は9/23
  add(9, shubun);

  // 振替休日: 祝日が日曜の場合、翌月曜が休日
  const allHolidays = Array.from(holidays);
  for (const h of allHolidays) {
    const d = new Date(h + "T00:00:00Z");
    if (d.getUTCDay() === 0) { // Sunday
      const next = new Date(d);
      next.setUTCDate(next.getUTCDate() + 1);
      holidays.add(next.toISOString().split("T")[0]);
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

// Cache for holidays
const holidayCache: Record<number, Set<string>> = {};

export function isJapaneseHoliday(dateStr: string): boolean {
  const year = parseInt(dateStr.substring(0, 4));
  if (!holidayCache[year]) {
    holidayCache[year] = getJapaneseHolidays(year);
  }
  return holidayCache[year].has(dateStr);
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
  return DOW_LABELS[date.getUTCDay()];
}
