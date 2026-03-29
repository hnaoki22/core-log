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
};

export type Manager = {
  id: string;
  token: string;
  name: string;
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

// ===== Mock Participants =====
const participantA: Participant = {
  id: "p1",
  token: "tanaka-abc123",
  name: "田中 太郎",
  department: "営業企画部",
  dojoPhase: "道場2 探索",
  weekNum: 4,
  startDate: "2026-05-12",
  totalDays: 23,
  entryRate: 92,
  streak: 6,
  fbCount: 4,
  averageEnergy: "good",
  managerId: "m1",
  logs: [
    {
      id: "l1",
      date: "2026-06-10",
      dayOfWeek: "水",
      dayNum: 10,
      morningIntent: "午後のプレゼンで「結論から先に言う」を意識する",
      eveningInsight: null,
      energy: null,
      status: "morning_only",
      hasFeedback: false,
    },
    {
      id: "l2",
      date: "2026-06-09",
      dayOfWeek: "火",
      dayNum: 9,
      morningIntent: "朝礼で自分から改善案を1つ出す",
      eveningInsight: "提案したら部長が「いいね」と言ってくれた。小さいが手応え。",
      energy: "good",
      status: "complete",
      hasFeedback: false,
    },
    {
      id: "l3",
      date: "2026-06-08",
      dayOfWeek: "月",
      dayNum: 8,
      morningIntent: "先週のFBを意識して「聞いた後に相手の表情を見る」",
      eveningInsight: "後輩と話したとき、自分が話しすぎていたことに気づいた。",
      energy: "excellent",
      status: "fb_done",
      hasFeedback: true,
    },
    {
      id: "l4",
      date: "2026-06-06",
      dayOfWeek: "金",
      dayNum: 6,
      morningIntent: "週末の振り返りで来週のテーマを決める",
      eveningInsight: "「発言する」から「聞く」へテーマを変えてみる。",
      energy: "good",
      status: "complete",
      hasFeedback: false,
    },
    {
      id: "l5",
      date: "2026-06-05",
      dayOfWeek: "木",
      dayNum: 5,
      morningIntent: "1on1で上司に率直に悩みを相談する",
      eveningInsight: "上司が「そういう話をしてくれてよかった」と。距離が縮んだ感覚。",
      energy: "good",
      status: "complete",
      hasFeedback: false,
    },
    {
      id: "l6",
      date: "2026-06-04",
      dayOfWeek: "水",
      dayNum: 4,
      morningIntent: "会議のファシリテーションに挑戦する",
      eveningInsight: "準備不足で仕切れなかった。次は事前にアジェンダを作る。",
      energy: "okay",
      status: "complete",
      hasFeedback: false,
    },
    {
      id: "l7",
      date: "2026-06-03",
      dayOfWeek: "火",
      dayNum: 3,
      morningIntent: "報告書を提出前に自分でダブルチェックする",
      eveningInsight: "ミスを2箇所発見。チェックリスト化が有効と実感。",
      energy: "good",
      status: "complete",
      hasFeedback: false,
    },
    {
      id: "l8",
      date: "2026-06-02",
      dayOfWeek: "月",
      dayNum: 2,
      morningIntent: "先週のFBを踏まえて新しいテーマで1週間始める",
      eveningInsight: "FBを読んで、無意識だった癖に気づけた。",
      energy: "good",
      status: "fb_done",
      hasFeedback: true,
    },
  ],
  feedbacks: [
    {
      id: "f1",
      weekLabel: "Week 4（6/2〜6/6）",
      weekNum: 4,
      body: "今週は「聞く」にテーマを変えたのが大きな一歩。後輩との会話で「自分が話しすぎ」に気づけたのは、觳察力が上がっている証拠です。木曜の1on1で司に率直に悩みを伝えたのも素晴らしい。",
      feedforward: "来週は「相手が話し終わるまで待つ」を1日1回やってみて。何が変わりますか？",
      isNew: true,
    },
    {
      id: "f2",
      weekLabel: "Week 3（5/26〜5/30）",
      weekNum: 3,
      body: "1on1で上司に率直に悩みを伝えた場面。「話してくれてよかった」という反応を引き出せたのは、田中さんの誠実さの成果です。",
      feedforward: "「聞いた後に相手がどんな表情をしたか」を来週は意識的に観察してみてください。",
      isNew: false,
    },
    {
      id: "f3",
      weekLabel: "Week 2（5/19〜5/23）",
      weekNum: 2,
      body: "会議での発言が定着してきました。「数字の根拠は？」という問いかけは、場に健全な緊張感を生んでいます。",
      feedforward: "来週は質問の後に「自分はこう思う」と意見も添えてみてください。",
      isNew: false,
    },
  ],
  managerComments: [
    {
      id: "mc1",
      date: "2026-06-06",
      managerName: "鈴木部長",
      body: "最近のミーティングでの発言が増えていて頼もしい。特に数字に基づいた質問ができるようになったのは成長を感じる。次はチーム全体を巻き込む場面も期待しています。",
    },
  ],
  missions: [
    {
      id: "ms1",
      title: "Q2営業戦略の提案書を自力で完成させる",
      setDate: "2026-05-15",
      deadline: "2026-07-31",
      status: "in_progress",
      progress: 40,
      reviewMemo: "方向性は良い。競合分析の部分をもう少し深掘りしてほしい。来週の1on1で一緒に見直そう。",
    },
    {
      id: "ms2",
      title: "部門横断プロジェクトのリーダーを経験する",
      setDate: "2026-05-15",
      deadline: "2026-10-31",
      status: "not_started",
      progress: 0,
      reviewMemo: null,
    },
  ],
};

const participantB: Participant = {
  id: "p2",
  token: "suzuki-def456",
  name: "鈴木 花子",
  department: "人事総務部",
  dojoPhase: "道場2 探索",
  weekNum: 4,
  startDate: "2026-05-12",
  totalDays: 20,
  entryRate: 80,
  streak: 3,
  fbCount: 4,
  averageEnergy: "good",
  managerId: "m1",
  logs: [
    {
      id: "l20",
      date: "2026-06-10",
      dayOfWeek: "水",
      dayNum: 10,
      morningIntent: "部下との面談で相手の話を最後まで聞く",
      eveningInsight: "途中で口を挟みそうになったが我慣できた。相手が安心した表情をしていた。",
      energy: "good",
      status: "complete",
      hasFeedback: false,
    },
    {
      id: "l21",
      date: "2026-06-09",
      dayOfWeek: "火",
      dayNum: 9,
      morningIntent: "チームMTGで全員に発言機会を作る",
      eveningInsight: "普段黙っている佐藤さんが意見を出してくれた。場作りの力を感じた。",
      energy: "excellent",
      status: "complete",
      hasFeedback: false,
    },
    {
      id: "l22",
      date: "2026-06-08",
      dayOfWeek: "月",
      dayNum: 8,
      morningIntent: "先週のFBを読んで今週のテーマを設定する",
      eveningInsight: "「問いかけで場を動かす」をテーマにすると決めた。",
      energy: "good",
      status: "fb_done",
      hasFeedback: true,
    },
  ],
  feedbacks: [
    {
      id: "f10",
      weekLabel: "Week 4（6/2〜6/6）",
      weekNum: 4,
      body: "チーム内で「場を作る」役割を自然に引き受けている姿が印象的です。特に普段発言しないメンバーに声をかけた場面は、リーダーとしての意識の変化を感じます。",
      feedforward: "来週は「自分が話さない時間」を意識的に作ってみてください。沈黙が何を生むか観察してみて。",
      isNew: true,
    },
  ],
  managerComments: [
    {
      id: "mc10",
      date: "2026-06-06",
      managerName: "屰田課長",
      body: "チームの雰囲気が明らかに良くなっている。鈴木さんの面談スキルが向上しているのが大きい。",
    },
  ],
  missions: [
    {
      id: "ms10",
      title: "新入社員研修プログラムの改訂案を作成する",
      setDate: "2026-05-20",
      deadline: "2026-08-31",
      status: "in_progress",
      progress: 25,
      reviewMemo: null,
    },
  ],
};

const participantC: Participant = {
  id: "p3",
  token: "sato-ghi789",
  name: "佐藤 健一",
  department: "製造部",
  dojoPhase: "道場2 探索",
  weekNum: 4,
  startDate: "2026-05-12",
  totalDays: 15,
  entryRate: 60,
  streak: 0,
  fbCount: 3,
  averageEnergy: "okay",
  managerId: "m2",
  logs: [
    {
      id: "l30",
      date: "2026-06-10",
      dayOfWeek: "水",
      dayNum: 10,
      morningIntent: "",
      eveningInsight: null,
      energy: null,
      status: "empty",
      hasFeedback: false,
    },
    {
      id: "l31",
      date: "2026-06-09",
      dayOfWeek: "火",
      dayNum: 9,
      morningIntent: "ラインの改善提案を班長に話す",
      eveningInsight: "話したが「今は忙しい」と流された。タイミングが悪かった。",
      energy: "low",
      status: "complete",
      hasFeedback: false,
    },
  ],
  feedbacks: [
    {
      id: "f20",
      weekLabel: "Week 4（6/2〜6/6）",
      weekNum: 4,
      body: "提案を出すこと自体が大きな一歩c��「タイミングが悪かった」と分析できているのも良い。流されても折れなかった粘り強さを認めたい。",
      feedforward: "来週、もう一度同じ提案をするなら、いつ・どう切り出しますか？",
      isNew: true,
    },
  ],
  managerComments: [],
  missions: [],
};

// ===== 宗友さん Trial: Participant Account =====
const participantMunetomo: Participant = {
  id: "p-munetomo",
  token: "munetomo-participant",
  name: "宗友 試用太郎",
  department: "人事部（試用アカウント）",
  dojoPhase: "道場2 探索",
  weekNum: 3,
  startDate: "2026-05-19",
  totalDays: 18,
  entryRate: 85,
  streak: 4,
  fbCount: 3,
  averageEnergy: "good",
  managerId: "m-munetomo-mgr",
  logs: [
    {
      id: "lm1",
      date: "2026-06-10",
      dayOfWeek: "水",
      dayNum: 10,
      morningIntent: "部門会議で各チームの進捗を整理し、優先順位を明確にする",
      eveningInsight: null,
      energy: null,
      status: "morning_only",
      hasFeedback: false,
    },
    {
      id: "lm2",
      date: "2026-06-09",
      dayOfWeek: "火",
      dayNum: 9,
      morningIntent: "1on1で部下の本音を引き出すために「問い」に集中する",
      eveningInsight: "いつもより沈黙を長く待てた。部下が自分から課題を話してくれた。",
      energy: "excellent",
      status: "complete",
      hasFeedback: false,
    },
    {
      id: "lm3",
      date: "2026-06-08",
      dayOfWeek: "月",
      dayNum: 8,
      morningIntent: "先週のFBを踏まえ「指示ではなく問いかけ」を意識する",
      eveningInsight: "つい指示を出しそうになったが、踏みとどまれた。相手の表情が明るくなった。",
      energy: "good",
      status: "fb_done",
      hasFeedback: true,
    },
    {
      id: "lm4",
      date: "2026-06-06",
      dayOfWeek: "金",
      dayNum: 6,
      morningIntent: "今週の振り返りを全体に共有し、来週の方向性を提示する",
      eveningInsight: "共有したことで「見えていなかった」という声があった。透明性の大切さを再認識。",
      energy: "good",
      status: "complete",
      hasFeedback: false,
    },
    {
      id: "lm5",
      date: "2026-06-05",
      dayOfWeek: "木",
      dayNum: 5,
      morningIntent: "経営会議で組織開発の中間報告をデータとストーリーで伝える",
      eveningInsight: "社長から「具体的でわかりやすい」と言われた。数字と物語の両立が効いた。",
      energy: "excellent",
      status: "complete",
      hasFeedback: false,
    },
    {
      id: "lm6",
      date: "2026-06-04",
      dayOfWeek: "水",
      dayNum: 4,
      morningIntent: "新人との面談で「傾聴」を実践する",
      eveningInsight: "自分の話が長くなってしまった。次回は3分以内に抑える。",
      energy: "okay",
      status: "complete",
      hasFeedback: false,
    },
    {
      id: "lm7",
      date: "2026-06-03",
      dayOfWeek: "火",
      dayNum: 3,
      morningIntent: "チーム横断の課題について関係者と対話する",
      eveningInsight: "対立する意見があったが、共通のゴールを確認できた。対話の力を実感。",
      energy: "good",
      status: "complete",
      hasFeedback: false,
    },
  ],
  feedbacks: [
    {
      id: "fm1",
      weekLabel: "Week 3（6/2〜6/6）",
      weekNum: 3,
      body: "今週は「指示→問いかけ」への転換に挑戦されました。つい指示を出しそうになった場面で踏みとどまれたことは大きな成長です。経営会議での中間報告も「数字と物語の両立」という視点が素晴らしい。",
      feedforward: "来週は「自分が話さない1on1」を1回やってみてください。相手だけが話す30分間で何が起きますか？",
      isNew: true,
    },
    {
      id: "fm2",
      weekLabel: "Week 2（5/26〜5/30）",
      weekNum: 2,
      body: "新人面談での傾聴の意識が見えてきました。「自分の話が長い」という自覚は改善の第一歩。組織全体の透明性を高める動きも評価できます。",
      feedforward: "相手の話を聞いた後、「今の話で一番大事なことは何？」と問いかけてみてください。",
      isNew: false,
    },
  ],
  managerComments: [
    {
      id: "mcm1",
      date: "2026-06-06",
      managerName: "プロジェクトCORE事務局",
      body: "組織開発の推進役として、ご自身が率先してCORE Logに取り組んでいただいていることが、全体の模範になっています。引き続きよろしくお願いします。",
    },
  ],
  missions: [
    {
      id: "msm1",
      title: "組織開発プロジェクト2年目の全社展開プランを完成させる",
      setDate: "2026-05-20",
      deadline: "2026-09-30",
      status: "in_progress",
      progress: 35,
      reviewMemo: "方向性は良い。各部門のキーパーソンの巻き込み方を具体化してほしい。",
    },
    {
      id: "msm2",
      title: "マネジメント層向けの「対話型1on1」研修を設計する",
      setDate: "2026-05-20",
      deadline: "2026-08-31",
      status: "in_progress",
      progress: 20,
      reviewMemo: null,
    },
  ],
};

// ===== Mock Managers =====
const managerA: Manager = {
  id: "m1",
  token: "mgr-suzuki-xyz",
  name: "鈴木部長",
  department: "営業企画部・人事総務部",
  participantIds: ["p1", "p2"],
};

const managerB: Manager = {
  id: "m2",
  token: "mgr-yamamoto-xyz",
  name: "山本課長",
  department: "製造部",
  participantIds: ["p3"],
};

// 宗友さん Trial: Manager Account (manages all participants)
const managerMunetomo: Manager = {
  id: "m-munetomo-mgr",
  token: "munetomo-manager",
  name: "宗友（試用マネージャー）",
  department: "人事部（全体管理）",
  participantIds: ["p1", "p2", "p3", "p-munetomo"],
};

// ===== Data Access Functions =====
const participants: Participant[] = [participantA, participantB, participantC, participantMunetomo];
const managers: Manager[] = [managerA, managerB, managerMunetomo];

export function getParticipantByToken(token: string): Participant | null {
  return participants.find((p) => p.token === token) ?? null;
}

export function getParticipantById(id: string): Participant | null {
  return participants.find((p) => p.id === id) ?? null;
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
