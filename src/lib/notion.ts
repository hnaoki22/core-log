// ===== Notion API Client =====
// Connects to the CORE Log database in Notion
// Replace mock data with real Notion queries

import { Client } from "@notionhq/client";

const notion = new Client({
  auth: process.env.NOTION_API_TOKEN,
});

// Database IDs from the existing Notion workspace
const CORE_LOG_DB_ID = process.env.NOTION_CORELOG_DB_ID || "";
const MISSION_DB_ID = process.env.NOTION_MISSION_DB_ID || "";
// const PARTICIPANTS_DB_ID = process.env.NOTION_PARTICIPANTS_DB_ID || "";

// ===== Types =====
export type NotionLogEntry = {
  id: string;
  date: string;
  dayOfWeek: string;
  dayNum: number;
  participantName: string;
  morningIntent: string;
  eveningInsight: string | null;
  energy: "excellent" | "good" | "okay" | "low" | null;
  status: "complete" | "morning_only" | "empty" | "fb_done";
  hasFeedback: boolean;
  hmFeedback: string | null;
  managerComment: string | null;
  dojoPhase: string;
  weekNum: number;
};

// ===== Helper: Parse Notion properties =====
function getRichText(prop: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prop as any;
  if (!p?.rich_text?.length) return "";
  return p.rich_text.map((t: { plain_text: string }) => t.plain_text).join("");
}

function getTitle(prop: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prop as any;
  if (!p?.title?.length) return "";
  return p.title.map((t: { plain_text: string }) => t.plain_text).join("");
}

function getSelect(prop: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prop as any;
  return p?.select?.name || "";
}

function getDate(prop: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prop as any;
  return p?.date?.start || "";
}

function getNumber(prop: unknown): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prop as any;
  return p?.number || 0;
}

// Day of week mapping
const DOW_MAP: Record<number, string> = {
  0: "日", 1: "月", 2: "火", 3: "水", 4: "木", 5: "金", 6: "土",
};

// Energy mapping from Notion select values
// Actual Notion options: "◎ 絶好調", "○ 良い", "△ まあまあ", "× 低調"
function parseEnergy(val: string): "excellent" | "good" | "okay" | "low" | null {
  if (!val) return null;
  if (val.includes("◎") || val.includes("絶好調")) return "excellent";
  if (val.includes("○") || val.includes("良い")) return "good";
  if (val.includes("△") || val.includes("まあまあ")) return "okay";
  if (val.includes("×") || val.includes("低調")) return "low";
  return null;
}

// Reverse energy mapping: app value → Notion select name
function energyToNotion(energy: string): string {
  const map: Record<string, string> = {
    "excellent": "◎ 絶好調",
    "good": "○ 良い",
    "okay": "△ まあまあ",
    "low": "× 低調",
  };
  return map[energy] || energy;
}

// Status mapping from Notion select or computed from content
// Notion options: "未記入", "朝のみ", "完了", "FB済"
function parseStatus(notionStatus: string, morningIntent: string, eveningInsight: string | null, hmFeedback: string | null): "complete" | "morning_only" | "empty" | "fb_done" {
  // Use Notion status if available
  if (notionStatus) {
    const map: Record<string, "complete" | "morning_only" | "empty" | "fb_done"> = {
      "完了": "complete",
      "朝のみ": "morning_only",
      "未記入": "empty",
      "FB済": "fb_done",
    };
    if (map[notionStatus]) return map[notionStatus];
  }
  // Fallback: compute from content
  if (hmFeedback) return "fb_done";
  if (morningIntent && eveningInsight) return "complete";
  if (morningIntent) return "morning_only";
  return "empty";
}

// ===== Query Functions =====

/**
 * Get all CORE Log entries for a specific participant
 */
export async function getLogsByParticipant(participantName: string): Promise<NotionLogEntry[]> {
  if (!CORE_LOG_DB_ID) return [];

  try {
    const response = await notion.databases.query({
      database_id: CORE_LOG_DB_ID,
      filter: {
        property: "参加者名",
        select: { equals: participantName },
      },
      sorts: [{ property: "日付", direction: "descending" }],
    });

    return response.results.map((page) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const props = (page as any).properties;
      const dateStr = getDate(props["日付"]);
      const d = new Date(dateStr);
      const morningIntent = getRichText(props["【朝】今日の意図"]);
      const eveningInsight = getRichText(props["【夕】今日の気づき"]) || null;
      const hmFeedback = getRichText(props["HMフィードバック"]) || null;
      const managerComment = getRichText(props["上司コメント"]) || null;
      const energyVal = getSelect(props["エネルギーレベル"]);
      const notionStatus = getSelect(props["ステータス"]);

      return {
        id: page.id,
        date: dateStr,
        dayOfWeek: DOW_MAP[d.getDay()] || "",
        dayNum: d.getDate(),
        participantName: getSelect(props["参加者名"]),
        morningIntent,
        eveningInsight,
        energy: parseEnergy(energyVal),
        status: parseStatus(notionStatus, morningIntent, eveningInsight, hmFeedback),
        hasFeedback: !!hmFeedback,
        hmFeedback,
        managerComment,
        dojoPhase: getSelect(props["道場フェーズ"]),
        weekNum: getNumber(props["週番号"]),
      };
    });
  } catch (error) {
    console.error("Error fetching logs:", error);
    return [];
  }
}

/**
 * Create a new CORE Log entry (morning)
 */
export async function createMorningEntry(
  participantName: string,
  date: string,
  morningIntent: string,
  energy: string | null,
  dojoPhase: string,
  weekNum: number
) {
  if (!CORE_LOG_DB_ID) return null;

  try {
    const d = new Date(date);
    const title = `${d.getMonth() + 1}/${d.getDate()}（${DOW_MAP[d.getDay()]}）`;

    // JST timestamp for 記入時刻（朝）
    const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();

    const properties: Record<string, unknown> = {
      "タイトル": { title: [{ text: { content: title } }] },
      "日付": { date: { start: date } },
      "参加者名": { select: { name: participantName } },
      "【朝】今日の意図": { rich_text: [{ text: { content: morningIntent } }] },
      "道場フェーズ": { select: { name: dojoPhase } },
      "週番号": { number: weekNum },
      "記入時刻（朝）": { date: { start: nowJST } },
    };

    if (energy) {
      properties["エネルギーレベル"] = { select: { name: energyToNotion(energy) } };
    }

    // Set initial status
    properties["ステータス"] = { select: { name: "朝のみ" } };

    const response = await notion.pages.create({
      parent: { database_id: CORE_LOG_DB_ID },
      properties: properties as Parameters<typeof notion.pages.create>[0]["properties"],
    });

    return response.id;
  } catch (error) {
    console.error("Error creating morning entry:", error);
    return null;
  }
}

/**
 * Update an existing entry with evening data
 */
export async function updateEveningEntry(
  pageId: string,
  eveningInsight: string,
  energy: string | null
) {
  try {
    // JST timestamp for 記入時刻（夕）
    const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();

    const properties: Record<string, unknown> = {
      "【夕】今日の気づき": { rich_text: [{ text: { content: eveningInsight } }] },
      "ステータス": { select: { name: "完了" } },
      "記入時刻（夕）": { date: { start: nowJST } },
    };

    if (energy) {
      properties["エネルギーレベル"] = { select: { name: energyToNotion(energy) } };
    }

    await notion.pages.update({
      page_id: pageId,
      properties: properties as Parameters<typeof notion.pages.update>[0]["properties"],
    });

    return true;
  } catch (error) {
    console.error("Error updating evening entry:", error);
    return false;
  }
}

/**
 * Add manager comment to an entry
 */
export async function addManagerComment(
  pageId: string,
  comment: string
) {
  try {
    await notion.pages.update({
      page_id: pageId,
      properties: {
        "上司コメント": { rich_text: [{ text: { content: comment } }] },
      } as Parameters<typeof notion.pages.update>[0]["properties"],
    });
    return true;
  } catch (error) {
    console.error("Error adding manager comment:", error);
    return false;
  }
}

/**
 * Check if a participant has logged today
 */
export async function hasLoggedToday(participantName: string, todayStr: string): Promise<{ hasMorning: boolean; hasEvening: boolean }> {
  if (!CORE_LOG_DB_ID) return { hasMorning: false, hasEvening: false };

  try {
    const response = await notion.databases.query({
      database_id: CORE_LOG_DB_ID,
      filter: {
        and: [
          { property: "参加者名", select: { equals: participantName } },
          { property: "日付", date: { equals: todayStr } },
        ],
      },
    });

    if (response.results.length === 0) return { hasMorning: false, hasEvening: false };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = (response.results[0] as any).properties;
    const morning = getRichText(props["【朝】今日の意図"]);
    const evening = getRichText(props["【夕】今日の気づき"]);

    return { hasMorning: !!morning, hasEvening: !!evening };
  } catch (error) {
    console.error("Error checking today's log:", error);
    return { hasMorning: false, hasEvening: false };
  }
}

/**
 * Get missions for a participant
 */
export async function getMissionsByParticipant(participantName: string) {
  if (!MISSION_DB_ID) return [];

  try {
    const response = await notion.databases.query({
      database_id: MISSION_DB_ID,
      filter: {
        property: "参加者名",
        select: { equals: participantName },
      },
    });

    return response.results.map((page) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const props = (page as any).properties;
      return {
        id: page.id,
        title: getTitle(props["ミッション名"]),
        participantName: getSelect(props["参加者名"]),
        setDate: getDate(props["設定日"]),
        deadline: getDate(props["達成期限"]),
        status: getSelect(props["ステータス"]),
        purpose: getRichText(props["背景・目的"]) || null,
        reviewMemo: getRichText(props["中間レビューメモ"]) || null,
        finalReview: getRichText(props["最終振り返り"]) || null,
      };
    });
  } catch (error) {
    console.error("Error fetching missions:", error);
    return [];
  }
}
