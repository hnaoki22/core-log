// ===== CORE Log Mock Data =====
// This will be replaced with Notion API calls later

export type LogEntry = {
  id: string;
  date: string;       // "2026-06-10"
  dayOfWeek: string;  // "水"
  dayNum: number;     // 10
  morningIntent: string;
  eveningInsight: string | null;
  energy: "excellent" | "good" | "okay" | "low" | null;
  status: "complete" | "morning_only" | "empty" | "fb_done";
  hasFeedback: boolean;
};

export type Feedback = {
  id: string;
  weekLabel: string;      // "Week 4（6/2〜6/6）"
  weekNum: number;
  body: string;
  feedforward: string;
  isNew: boolean;
};

export type ManagerComment = {
  id: string;
  date: string;
  managerName: string;
  body: string;
};

export type Mission = {
  id: string;
  title: string;
  setDate: string;
  deadline: string;
  status: "in_progress" | "not_started" | "completed";
  progress: number;  // 0-100
  reviewMemo: string | null;
};

export type Participant = {
  id: string;
  token: string;
  name: string;
  email: string;
  department: string;
  dojoPhase: string;
  weekNum: number;
  startDate: string;
  totalDays: number;
  entryRate: number;   // 0-100
  streak: number;
  fbCount: number;
  averageEnergy: string;
  logs: LogEntry[];
  feedbacks: Feedback[];
  managerComments: ManagerComment[];
  missions: Mission[];
  managerId: string;
  emailEnabled: boolean;  // メール通知ON/OFF（Notion参加者DBのチェックボックスに対応）
};

export type Manager = {
  id: string;
  token: string;
  name: string;
  email: string;
  department: string;
  participantIds: string[];
};

// Energy helpers
export const energyEmoji: Record<string, string> = {
  excellent: "🔥",
  good: "😊",
  okay: "😐",
  low: "😞",
};

export const energyLabel: Record<string, string> = {
  excellent: "絶好調",
  good: "良い",
  okay: "まあまあ",
  low: "低調",
};

// ===== 大幸薬品 第二期参加者 =====
const participantFujiiM: Participant = {
  id: "p-fujii-m", token: "7GHValljeoUrYh0j",
  name: "藤井 真弓", email: "mayumi.fujii@seirogan.co.jp",
  department: "国内営業部 営業推進グループ",
  dojoPhase: "道場1 覚醒", weekNum: 1, startDate: "", totalDays: 0,
  entryRate: 0, streak: 0, fbCount: 0, averageEnergy: "",
  managerId: "", emailEnabled: false, logs: [], feedbacks: [], managerComments: [], missions: [],
};

const participantMouri: Participant = {
  id: "p-mouri", token: "w54l2YYyVL2-ILej",
  name: "毛利 友義", email: "tomoyoshi.mouri@seirogan.co.jp",
  department: "マーケティング部",
  dojoPhase: "道場1 覚醒", weekNum: 1, startDate: "", totalDays: 0,
  entryRate: 0, streak: 0, fbCount: 0, averageEnergy: "",
  managerId: "", emailEnabled: false, logs: [], feedbacks: [], managerComments: [], missions: [],
};

const participantFujiiR: Participant = {
  id: "p-fujii-r", token: "A9gerTklb95ZWFWr",
  name: "藤井 良", email: "ryou.fujii@seirogan.co.jp",
  department: "製造部 京都製造グループ",
  dojoPhase: "道場1 覚醒", weekNum: 1, startDate: "", totalDays: 0,
  entryRate: 0, streak: 0, fbCount: 0, averageEnergy: "",
  managerId: "", emailEnabled: false, logs: [], feedbacks: [], managerComments: [], missions: [],
};

const participantAsano: Participant = {
  id: "p-asano", token: "4xLwOnBzVIiGR6TM",
  name: "浅野 知史", email: "tomofumi.asano@seirogan.co.jp",
  department: "経理部",
  dojoPhase: "道場1 覚醒", weekNum: 1, startDate: "", totalDays: 0,
  entryRate: 0, streak: 0, fbCount: 0, averageEnergy: "",
  managerId: "", emailEnabled: false, logs: [], feedbacks: [], managerComments: [], missions: [],
};

const participantTakeda: Participant = {
  id: "p-takeda", token: "cNgJ_oBhWHcK8Z7e",
  name: "竹田 和馬", email: "kazuma.takeda@seirogan.co.jp",
  department: "製造部 吹田工場総務グループ",
  dojoPhase: "道場1 覚醒", weekNum: 1, startDate: "", totalDays: 0,
  entryRate: 0, streak: 0, fbCount: 0, averageEnergy: "",
  managerId: "", emailEnabled: false, logs: [], feedbacks: [], managerComments: [], missions: [],
};

const participantChiba: Participant = {
  id: "p-chiba", token: "40E9fOqPHn0nRj-Q",
  name: "千葉 亮介", email: "ryosuke.chiba@seirogan.co.jp",
  department: "マーケティング部",
  dojoPhase: "道場1 覚醒", weekNum: 1, startDate: "", totalDays: 0,
  entryRate: 0, streak: 0, fbCount: 0, averageEnergy: "",
  managerId: "", emailEnabled: false, logs: [], feedbacks: [], managerComments: [], missions: [],
};

const participantShimoji: Participant = {
  id: "p-shimoji", token: "S0Nh_5HasNCf4UNf",
  name: "下地 範明", email: "noriaki.shimoji@seirogan.co.jp",
  department: "製造部 購買グループ",
  dojoPhase: "道場1 覚醒", weekNum: 1, startDate: "", totalDays: 0,
  entryRate: 0, streak: 0, fbCount: 0, averageEnergy: "",
  managerId: "", emailEnabled: false, logs: [], feedbacks: [], managerComments: [], missions: [],
};

const participantHayashi: Participant = {
  id: "p-hayashi", token: "JNQtG6uCbRTOpbtx",
  name: "林 宏行", email: "hiroyuki.hayashi@seirogan.co.jp",
  department: "研究開発部 開発グループ",
  dojoPhase: "道場1 覚醒", weekNum: 1, startDate: "", totalDays: 0,
  entryRate: 0, streak: 0, fbCount: 0, averageEnergy: "",
  managerId: "", emailEnabled: false, logs: [], feedbacks: [], managerComments: [], missions: [],
};

// ===== Human Mature 社内アカウント =====
const participantDoi: Participant = {
  id: "p-doi",
  token: "FAe9diVTAxUR8gRv",
  name: "土居 由奈",
  email: "yuna.doi@humanmature.com",
  department: "Human Mature",
  dojoPhase: "道場1 覚醒",
  weekNum: 1,
  startDate: "",
  totalDays: 0,
  entryRate: 0,
  streak: 0,
  fbCount: 0,
  averageEnergy: "",
  managerId: "m-hondo",
  emailEnabled: true,
  logs: [],
  feedbacks: [],
  managerComments: [],
  missions: [],
};

// ===== Managers =====
// Human Mature 社内: 本藤さん（上司アカウント）
const managerHondo: Manager = {
  id: "m-hondo",
  token: "pn_Oc1ykCMXUQZpZ",
  name: "本藤 直樹",
  email: "naoki.hondo@humanmature.com",
  department: "Human Mature",
  participantIds: ["p-doi"],
};

// ===== Data Access Functions =====
const participants: Participant[] = [
  participantDoi,
  participantFujiiM, participantMouri, participantFujiiR, participantAsano,
  participantTakeda, participantChiba, participantShimoji, participantHayashi,
];
const managers: Manager[] = [managerHondo];

export function getParticipantByToken(token: string): Participant | null {
  return participants.find((p) => p.token === token) ?? null;
}

export function getParticipantById(id: string): Participant | null {
  return participants.find((p) => p.id === id) ?? null;
}

export function getParticipantByName(name: string): Participant | null {
  return participants.find((p) => p.name === name || p.name.replace(/\s/g, "") === name.replace(/\s/g, "")) ?? null;
}

export function getParticipantByEmail(email: string): Participant | null {
  return participants.find((p) => p.email === email) ?? null;
}

export function getManagerById(id: string): Manager | null {
  return managers.find((m) => m.id === id) ?? null;
}

export function getManagerByToken(token: string): Manager | null {
  return managers.find((m) => m.token === token) ?? null;
}

export function getParticipantsForManager(managerId: string): Participant[] {
  const manager = managers.find((m) => m.id === managerId);
  if (!manager) return [];
  return manager.participantIds
    .map((pid) => participants.find((p) => p.id === pid))
    .filter(Boolean) as Participant[];
}

// For demo landing page
export function getAllParticipants(): Participant[] {
  return participants;
}

export function getAllManagers(): Manager[] {
  return managers;
}
