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
const PARTICIPANTS_DB_ID = process.env.NOTION_PARTICIPANTS_DB_ID || "";
const MANAGERS_DB_ID = process.env.NOTION_MANAGERS_DB_ID || "";

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
function getEmail(prop: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prop as any;
  return p?.email || "";
}

function getCheckbox(prop: unknown): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prop as any;
  return p?.checkbox || false;
}

function getRelationIds(prop: unknown): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prop as any;
  if (!p?.relation?.length) return [];
  return p.relation.map((r: { id: string }) => r.id);
}

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

// ===== Mission Types =====
export type MissionEntry = {
  id: string;
  title: string;
  participantName: string;
  setDate: string;
  deadline: string;
  status: string;
  purpose: string | null;
  reviewMemo: string | null;
  finalReview: string | null;
};

export type MissionComment = {
  id: string;
  authorName: string;
  authorRole: "manager" | "participant";
  body: string;
  createdAt: string;
};

/**
 * Get missions for a participant
 */
/**
 * Get a single mission by ID (for notification lookups)
 */
export async function getMissionById(missionId: string): Promise<MissionEntry | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await notion.pages.retrieve({ page_id: missionId }) as any;
    const props = page.properties;
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
  } catch (error) {
    console.error("Error fetching mission by ID:", error);
    return null;
  }
}

export async function getMissionsByParticipant(participantName: string): Promise<MissionEntry[]> {
  if (!MISSION_DB_ID) return [];

  try {
    const response = await notion.databases.query({
      database_id: MISSION_DB_ID,
      filter: {
        property: "参加者名",
        select: { equals: participantName },
      },
      sorts: [{ property: "設定日", direction: "descending" }],
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

/**
 * Create a new mission (manager action)
 */
export async function createMission(
  participantName: string,
  title: string,
  purpose: string,
  deadline: string,
  setDate: string
): Promise<string | null> {
  if (!MISSION_DB_ID) return null;

  try {
    const properties: Record<string, unknown> = {
      "ミッション名": { title: [{ text: { content: title } }] },
      "参加者名": { select: { name: participantName } },
      "設定日": { date: { start: setDate } },
      "達成期限": { date: { start: deadline } },
      "ステータス": { select: { name: "進行中" } },
    };

    if (purpose) {
      properties["背景・目的"] = { rich_text: [{ text: { content: purpose } }] };
    }

    const response = await notion.pages.create({
      parent: { database_id: MISSION_DB_ID },
      properties: properties as Parameters<typeof notion.pages.create>[0]["properties"],
    });

    return response.id;
  } catch (error) {
    console.error("Error creating mission:", error);
    return null;
  }
}

/**
 * Update mission status (manager action: close/reopen)
 */
export async function updateMissionStatus(
  missionId: string,
  status: string,
  finalReview?: string
): Promise<boolean> {
  try {
    const properties: Record<string, unknown> = {
      "ステータス": { select: { name: status } },
    };

    if (finalReview) {
      properties["最終振り返り"] = { rich_text: [{ text: { content: finalReview } }] };
    }

    await notion.pages.update({
      page_id: missionId,
      properties: properties as Parameters<typeof notion.pages.update>[0]["properties"],
    });

    return true;
  } catch (error) {
    console.error("Error updating mission status:", error);
    return false;
  }
}

/**
 * Add a comment to a mission page using Notion Comments API
 * Author info is embedded in the comment text since the API always uses the integration as author
 */
export async function addMissionComment(
  missionId: string,
  authorName: string,
  authorRole: "manager" | "participant",
  commentText: string
): Promise<boolean> {
  try {
    const roleLabel = authorRole === "manager" ? "上司" : "部下";
    const formattedText = `[${roleLabel}] ${authorName}: ${commentText}`;

    await notion.comments.create({
      parent: { page_id: missionId },
      rich_text: [{ text: { content: formattedText } }],
    });

    return true;
  } catch (error) {
    console.error("Error adding mission comment:", error);
    return false;
  }
}

// ===== Participant & Manager Types (Notion DB) =====
export type NotionParticipant = {
  id: string;          // Notion page ID
  token: string;
  name: string;
  email: string;
  department: string;
  dojoPhase: string;
  emailEnabled: boolean;
  startDate: string;
  role: string;        // "参加者" | "HM社内"
  managerId: string;   // Notion page ID of related manager (from relation)
};

export type NotionManager = {
  id: string;          // Notion page ID
  token: string;
  name: string;
  email: string;
  department: string;
  isAdmin: boolean;    // 管理者権限 checkbox
  participantIds: string[]; // Notion page IDs from relation
};

// ===== Participant DB Functions =====

/**
 * Get all participants from Notion DB
 */
export async function getAllParticipantsFromNotion(): Promise<NotionParticipant[]> {
  if (!PARTICIPANTS_DB_ID) return [];

  try {
    const response = await notion.databases.query({
      database_id: PARTICIPANTS_DB_ID,
      sorts: [{ property: "名前", direction: "ascending" }],
    });

    return response.results.map((page) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const props = (page as any).properties;
      return {
        id: page.id,
        token: getRichText(props["トークン"]),
        name: getTitle(props["名前"]),
        email: getEmail(props["メール"]),
        department: getRichText(props["部署"]),
        dojoPhase: getSelect(props["道場フェーズ"]),
        emailEnabled: getCheckbox(props["メール通知"]),
        startDate: getDate(props["開始日"]),
        role: getSelect(props["役割"]),
        managerId: getRelationIds(props["担当上司"])[0] || "",
      };
    });
  } catch (error) {
    console.error("Error fetching participants from Notion:", error);
    return [];
  }
}

/**
 * Get a single participant by token from Notion DB
 */
export async function getParticipantByTokenFromNotion(token: string): Promise<NotionParticipant | null> {
  if (!PARTICIPANTS_DB_ID || !token) return null;

  try {
    const response = await notion.databases.query({
      database_id: PARTICIPANTS_DB_ID,
      filter: {
        property: "トークン",
        rich_text: { equals: token },
      },
    });

    if (response.results.length === 0) return null;

    const page = response.results[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = (page as any).properties;
    return {
      id: page.id,
      token: getRichText(props["トークン"]),
      name: getTitle(props["名前"]),
      email: getEmail(props["メール"]),
      department: getRichText(props["部署"]),
      dojoPhase: getSelect(props["道場フェーズ"]),
      emailEnabled: getCheckbox(props["メール通知"]),
      startDate: getDate(props["開始日"]),
      role: getSelect(props["役割"]),
      managerId: getRelationIds(props["担当上司"])[0] || "",
    };
  } catch (error) {
    console.error("Error fetching participant by token:", error);
    return null;
  }
}

/**
 * Get a participant by name from Notion DB
 */
export async function getParticipantByNameFromNotion(name: string): Promise<NotionParticipant | null> {
  if (!PARTICIPANTS_DB_ID || !name) return null;

  try {
    const response = await notion.databases.query({
      database_id: PARTICIPANTS_DB_ID,
      filter: {
        property: "名前",
        title: { equals: name },
      },
    });

    if (response.results.length === 0) {
      // Try without spaces (e.g. "藤井真弓" vs "藤井 真弓")
      const noSpaceName = name.replace(/\s/g, "");
      const all = await getAllParticipantsFromNotion();
      return all.find((p) => p.name.replace(/\s/g, "") === noSpaceName) || null;
    }

    const page = response.results[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = (page as any).properties;
    return {
      id: page.id,
      token: getRichText(props["トークン"]),
      name: getTitle(props["名前"]),
      email: getEmail(props["メール"]),
      department: getRichText(props["部署"]),
      dojoPhase: getSelect(props["道場フェーズ"]),
      emailEnabled: getCheckbox(props["メール通知"]),
      startDate: getDate(props["開始日"]),
      role: getSelect(props["役割"]),
      managerId: getRelationIds(props["担当上司"])[0] || "",
    };
  } catch (error) {
    console.error("Error fetching participant by name:", error);
    return null;
  }
}

/**
 * Get a participant by email from Notion DB
 */
export async function getParticipantByEmailFromNotion(email: string): Promise<NotionParticipant | null> {
  if (!PARTICIPANTS_DB_ID || !email) return null;

  try {
    const response = await notion.databases.query({
      database_id: PARTICIPANTS_DB_ID,
      filter: {
        property: "メール",
        email: { equals: email },
      },
    });

    if (response.results.length === 0) return null;

    const page = response.results[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = (page as any).properties;
    return {
      id: page.id,
      token: getRichText(props["トークン"]),
      name: getTitle(props["名前"]),
      email: getEmail(props["メール"]),
      department: getRichText(props["部署"]),
      dojoPhase: getSelect(props["道場フェーズ"]),
      emailEnabled: getCheckbox(props["メール通知"]),
      startDate: getDate(props["開始日"]),
      role: getSelect(props["役割"]),
      managerId: getRelationIds(props["担当上司"])[0] || "",
    };
  } catch (error) {
    console.error("Error fetching participant by email:", error);
    return null;
  }
}

// ===== Manager DB Functions =====

/**
 * Get all managers from Notion DB
 */
export async function getAllManagersFromNotion(): Promise<NotionManager[]> {
  if (!MANAGERS_DB_ID) return [];

  try {
    const response = await notion.databases.query({
      database_id: MANAGERS_DB_ID,
      sorts: [{ property: "名前", direction: "ascending" }],
    });

    return response.results.map((page) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const props = (page as any).properties;
      return {
        id: page.id,
        token: getRichText(props["トークン"]),
        name: getTitle(props["名前"]),
        email: getEmail(props["メール"]),
        department: getRichText(props["部署"]),
        isAdmin: getCheckbox(props["管理者権限"]),
        participantIds: getRelationIds(props["担当参加者"]),
      };
    });
  } catch (error) {
    console.error("Error fetching managers from Notion:", error);
    return [];
  }
}

/**
 * Get a manager by token from Notion DB
 */
export async function getManagerByTokenFromNotion(token: string): Promise<NotionManager | null> {
  if (!MANAGERS_DB_ID || !token) return null;

  try {
    const response = await notion.databases.query({
      database_id: MANAGERS_DB_ID,
      filter: {
        property: "トークン",
        rich_text: { equals: token },
      },
    });

    if (response.results.length === 0) return null;

    const page = response.results[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = (page as any).properties;
    return {
      id: page.id,
      token: getRichText(props["トークン"]),
      name: getTitle(props["名前"]),
      email: getEmail(props["メール"]),
      department: getRichText(props["部署"]),
      isAdmin: getCheckbox(props["管理者権限"]),
      participantIds: getRelationIds(props["担当参加者"]),
    };
  } catch (error) {
    console.error("Error fetching manager by token:", error);
    return null;
  }
}

/**
 * Get a manager by Notion page ID
 */
export async function getManagerByIdFromNotion(managerId: string): Promise<NotionManager | null> {
  if (!managerId) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await notion.pages.retrieve({ page_id: managerId }) as any;
    const props = page.properties;
    return {
      id: page.id,
      token: getRichText(props["トークン"]),
      name: getTitle(props["名前"]),
      email: getEmail(props["メール"]),
      department: getRichText(props["部署"]),
      isAdmin: getCheckbox(props["管理者権限"]),
      participantIds: getRelationIds(props["担当参加者"]),
    };
  } catch (error) {
    console.error("Error fetching manager by ID:", error);
    return null;
  }
}

/**
 * Check if a token belongs to an admin (manager with 管理者権限=true)
 */
export async function isAdminTokenFromNotion(token: string): Promise<boolean> {
  if (!MANAGERS_DB_ID || !token) return false;

  try {
    const response = await notion.databases.query({
      database_id: MANAGERS_DB_ID,
      filter: {
        and: [
          { property: "トークン", rich_text: { equals: token } },
          { property: "管理者権限", checkbox: { equals: true } },
        ],
      },
    });

    return response.results.length > 0;
  } catch (error) {
    console.error("Error checking admin token:", error);
    return false;
  }
}

/**
 * Get participants managed by a specific manager (from relation)
 */
export async function getParticipantsForManagerFromNotion(managerId: string): Promise<NotionParticipant[]> {
  if (!PARTICIPANTS_DB_ID || !managerId) return [];

  try {
    const response = await notion.databases.query({
      database_id: PARTICIPANTS_DB_ID,
      filter: {
        property: "担当上司",
        relation: { contains: managerId },
      },
    });

    return response.results.map((page) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const props = (page as any).properties;
      return {
        id: page.id,
        token: getRichText(props["トークン"]),
        name: getTitle(props["名前"]),
        email: getEmail(props["メール"]),
        department: getRichText(props["部署"]),
        dojoPhase: getSelect(props["道場フェーズ"]),
        emailEnabled: getCheckbox(props["メール通知"]),
        startDate: getDate(props["開始日"]),
        role: getSelect(props["役割"]),
        managerId: managerId,
      };
    });
  } catch (error) {
    console.error("Error fetching participants for manager:", error);
    return [];
  }
}

/**
 * Get all comments for a mission page
 */
export async function getMissionComments(missionId: string): Promise<MissionComment[]> {
  try {
    const response = await notion.comments.list({
      block_id: missionId,
    });

    return response.results.map((comment) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const richText = (comment as any).rich_text || [];
      const fullText = richText.map((t: { plain_text: string }) => t.plain_text).join("");

      // Parse embedded author info: "[上司] 本藤直樹: actual comment"
      let authorName = "";
      let authorRole: "manager" | "participant" = "participant";
      let body = fullText;

      const match = fullText.match(/^\[(上司|部下)\]\s*(.+?):\s*([\s\S]*)$/);
      if (match) {
        authorRole = match[1] === "上司" ? "manager" : "participant";
        authorName = match[2];
        body = match[3];
      }

      return {
        id: comment.id,
        authorName,
        authorRole,
        body,
        createdAt: comment.created_time,
      };
    });
  } catch (error) {
    console.error("Error fetching mission comments:", error);
    return [];
  }
}

// ===== Create Functions =====

/**
 * Generate a secure random token for URL authentication
 */
function generateToken(prefix: string = ""): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789";
  // Exclude easily confused characters: l, I, O, 0 are kept but 'l' is removed from chars above
  let token = prefix;
  for (let i = 0; i < 16; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Check if a token already exists in the Participants or Managers DB
 */
async function isTokenUnique(token: string): Promise<boolean> {
  try {
    if (PARTICIPANTS_DB_ID) {
      const pRes = await notion.databases.query({
        database_id: PARTICIPANTS_DB_ID,
        filter: { property: "トークン", rich_text: { equals: token } },
      });
      if (pRes.results.length > 0) return false;
    }
    if (MANAGERS_DB_ID) {
      const mRes = await notion.databases.query({
        database_id: MANAGERS_DB_ID,
        filter: { property: "トークン", rich_text: { equals: token } },
      });
      if (mRes.results.length > 0) return false;
    }
    return true;
  } catch {
    return true; // On error, assume unique and let Notion handle duplicates
  }
}

/**
 * Generate a unique token with retry
 */
export async function generateUniqueToken(prefix: string = ""): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const token = generateToken(prefix);
    if (await isTokenUnique(token)) return token;
  }
  // Fallback: add timestamp
  return generateToken(prefix) + Date.now().toString(36).slice(-4);
}

/**
 * Create a new participant in the Notion Participants DB
 */
export async function createParticipantInNotion(data: {
  name: string;
  email: string;
  department: string;
  dojoPhase: string;
  role: string;
  managerId?: string;
  emailEnabled?: boolean;
}): Promise<{ id: string; token: string; url: string } | null> {
  if (!PARTICIPANTS_DB_ID) return null;

  try {
    const token = await generateUniqueToken("");

    const properties: Record<string, unknown> = {
      "名前": { title: [{ text: { content: data.name } }] },
      "トークン": { rich_text: [{ text: { content: token } }] },
      "メール": { email: data.email },
      "部署": { rich_text: [{ text: { content: data.department } }] },
      "道場フェーズ": { select: { name: data.dojoPhase } },
      "役割": { select: { name: data.role } },
      "メール通知": { checkbox: data.emailEnabled ?? false },
    };

    if (data.managerId) {
      properties["担当上司"] = { relation: [{ id: data.managerId }] };
    }

    const response = await notion.pages.create({
      parent: { database_id: PARTICIPANTS_DB_ID },
      properties: properties as Parameters<typeof notion.pages.create>[0]["properties"],
    });

    return {
      id: response.id,
      token,
      url: `/p/${token}`,
    };
  } catch (error) {
    console.error("Error creating participant:", error);
    return null;
  }
}

/**
 * Create a new manager in the Notion Managers DB
 */
export async function createManagerInNotion(data: {
  name: string;
  email: string;
  department: string;
  isAdmin?: boolean;
}): Promise<{ id: string; token: string; url: string } | null> {
  if (!MANAGERS_DB_ID) return null;

  try {
    const token = await generateUniqueToken("mgr_");

    const properties: Record<string, unknown> = {
      "名前": { title: [{ text: { content: data.name } }] },
      "トークン": { rich_text: [{ text: { content: token } }] },
      "メール": { email: data.email },
      "部署": { rich_text: [{ text: { content: data.department } }] },
      "管理者権限": { checkbox: data.isAdmin ?? false },
    };

    const response = await notion.pages.create({
      parent: { database_id: MANAGERS_DB_ID },
      properties: properties as Parameters<typeof notion.pages.create>[0]["properties"],
    });

    return {
      id: response.id,
      token,
      url: `/m/${token}`,
    };
  } catch (error) {
    console.error("Error creating manager:", error);
    return null;
  }
}
