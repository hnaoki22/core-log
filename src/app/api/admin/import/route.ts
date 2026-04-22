// POST /api/admin/import
// CSV一括インポート: 参加者・マネージャーを一括登録
// CSV形式: name,email,department,role,dojoPhase,managerName
//   role: "参加者" | "マネージャー" | "管理者" | "閲覧者"
//   dojoPhase: 参加者のみ（省略時は "道場1 覚醒"）
//   managerName: 参加者のみ。上司の名前（先にマネージャー行を書くこと）

import { NextRequest, NextResponse } from "next/server";
import { getManagerByToken, isAdminToken } from "@/lib/participant-db";
import { resolveManagerTenantStrict } from "@/lib/tenant-context";
import {
  createParticipantInSupabase as createParticipant,
  createManagerInSupabase as createManager,
  getAllManagersFromSupabase as getAllManagers,
  getAllParticipantsFromSupabase as getAllParticipants,
} from "@/lib/supabase";

export const dynamic = "force-dynamic";

const VALID_DOJO_PHASES = [
  "道場1 覚醒",
  "道場2 探究",
  "道場3 挑戦",
  "道場4 変容",
  "道場5 統合",
  "道場6 共創",
  "道場7 卒業",
];

type ImportRow = {
  line: number;
  name: string;
  email: string;
  department: string;
  role: string;
  dojoPhase: string;
  managerName: string;
};

type ImportResult = {
  line: number;
  name: string;
  email: string;
  role: string;
  status: "success" | "error" | "skipped";
  token?: string;
  url?: string;
  message: string;
};

function parseCSV(csvText: string): ImportRow[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // ヘッダー行を解析
  const headerLine = lines[0].toLowerCase().replace(/\s/g, "");
  const headers = headerLine.split(",").map((h) => h.trim());

  // ヘッダーマッピング（日本語・英語対応）
  const nameIdx = headers.findIndex((h) =>
    ["name", "名前", "氏名"].includes(h)
  );
  const emailIdx = headers.findIndex((h) =>
    ["email", "メール", "メールアドレス", "mail"].includes(h)
  );
  const deptIdx = headers.findIndex((h) =>
    ["department", "部署", "所属", "部門"].includes(h)
  );
  const roleIdx = headers.findIndex((h) =>
    ["role", "役割", "種別", "区分"].includes(h)
  );
  const phaseIdx = headers.findIndex((h) =>
    ["dojophase", "道場", "フェーズ", "phase"].includes(h)
  );
  const mgrIdx = headers.findIndex((h) =>
    ["managername", "manager", "上司", "上司名", "マネージャー"].includes(h)
  );

  if (nameIdx === -1 || emailIdx === -1) {
    throw new Error(
      "CSVに「name」と「email」列が必要です。ヘッダー例: name,email,department,role,dojoPhase,managerName"
    );
  }

  const rows: ImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);
    const name = cols[nameIdx]?.trim() || "";
    const email = cols[emailIdx]?.trim() || "";

    if (!name || !email) continue; // 空行スキップ

    rows.push({
      line: i + 1,
      name,
      email,
      department: deptIdx >= 0 ? cols[deptIdx]?.trim() || "" : "",
      role: roleIdx >= 0 ? cols[roleIdx]?.trim() || "参加者" : "参加者",
      dojoPhase: phaseIdx >= 0 ? cols[phaseIdx]?.trim() || "" : "",
      managerName: mgrIdx >= 0 ? cols[mgrIdx]?.trim() || "" : "",
    });
  }

  return rows;
}

// CSV行をパース（引用符対応）
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, csv, dryRun } = body;

    // 認証
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const manager = await getManagerByToken(token);
    if (!manager || !manager.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const tenantResult = resolveManagerTenantStrict(manager);
    if (!tenantResult.ok) {
      return NextResponse.json(tenantResult.errorBody, { status: tenantResult.status });
    }
    const tenantId = tenantResult.tenantId;

    if (!csv || typeof csv !== "string") {
      return NextResponse.json(
        { error: "CSVデータが必要です" },
        { status: 400 }
      );
    }

    // CSVパース
    let rows: ImportRow[];
    try {
      rows = parseCSV(csv);
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "インポート可能なデータがありません" },
        { status: 400 }
      );
    }

    // 既存データ取得（重複チェック用）
    const [existingParticipants, existingManagers] = await Promise.all([
      getAllParticipants(tenantId),
      getAllManagers(tenantId),
    ]);

    const existingEmails = new Set([
      ...existingParticipants.map((p) => p.email?.toLowerCase()),
      ...existingManagers.map((m) => m.email?.toLowerCase()),
    ]);

    // マネージャー名→IDマッピング（既存 + 今回インポート分）
    const managerMap = new Map<string, string>();
    for (const m of existingManagers) {
      managerMap.set(m.name, m.id);
    }

    // バリデーション
    const errors: string[] = [];
    const managerRows = rows.filter((r) =>
      ["マネージャー", "管理者", "閲覧者"].includes(r.role)
    );
    const participantRows = rows.filter(
      (r) => !["マネージャー", "管理者", "閲覧者"].includes(r.role)
    );

    // メール重複チェック（CSV内）
    const csvEmails = new Map<string, number>();
    for (const row of rows) {
      const lower = row.email.toLowerCase();
      if (csvEmails.has(lower)) {
        errors.push(
          `行${row.line}: ${row.email} はCSV内で重複しています（行${csvEmails.get(lower)}）`
        );
      }
      csvEmails.set(lower, row.line);
    }

    // メール形式チェック
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const row of rows) {
      if (!emailRegex.test(row.email)) {
        errors.push(`行${row.line}: ${row.email} はメールアドレスの形式が不正です`);
      }
    }

    // dojoPhaseバリデーション
    for (const row of participantRows) {
      if (row.dojoPhase && !VALID_DOJO_PHASES.includes(row.dojoPhase)) {
        errors.push(
          `行${row.line}: 道場フェーズ「${row.dojoPhase}」は無効です。選択肢: ${VALID_DOJO_PHASES.join(", ")}`
        );
      }
    }

    // マネージャー参照チェック（参加者行で指定されている上司が存在するか）
    const willCreateManagers = new Set(managerRows.map((r) => r.name));
    for (const row of participantRows) {
      if (
        row.managerName &&
        !managerMap.has(row.managerName) &&
        !willCreateManagers.has(row.managerName)
      ) {
        errors.push(
          `行${row.line}: 上司「${row.managerName}」が見つかりません。先にマネージャーとして登録するか、CSVのマネージャー行を参加者行より上に配置してください`
        );
      }
    }

    // 既存メール重複チェック
    const duplicates: string[] = [];
    for (const row of rows) {
      if (existingEmails.has(row.email.toLowerCase())) {
        duplicates.push(`行${row.line}: ${row.name} (${row.email}) は既に登録済みです`);
      }
    }

    if (errors.length > 0) {
      return NextResponse.json(
        {
          error: "バリデーションエラー",
          details: errors,
          duplicates,
          summary: {
            total: rows.length,
            managers: managerRows.length,
            participants: participantRows.length,
            errors: errors.length,
            duplicates: duplicates.length,
          },
        },
        { status: 400 }
      );
    }

    // ドライラン: バリデーション結果のみ返す
    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        summary: {
          total: rows.length,
          managers: managerRows.length,
          participants: participantRows.length,
          duplicates: duplicates.length,
          newRegistrations: rows.length - duplicates.length,
        },
        duplicates,
        rows: rows.map((r) => ({
          line: r.line,
          name: r.name,
          email: r.email,
          role: r.role,
          department: r.department,
          dojoPhase: r.dojoPhase || "道場1 覚醒",
          managerName: r.managerName,
          isDuplicate: existingEmails.has(r.email.toLowerCase()),
        })),
      });
    }

    // 本番登録: マネージャー → 参加者の順で処理
    const results: ImportResult[] = [];
    const baseUrl = request.nextUrl.origin;

    // 1. マネージャー登録
    for (const row of managerRows) {
      if (existingEmails.has(row.email.toLowerCase())) {
        results.push({
          line: row.line,
          name: row.name,
          email: row.email,
          role: row.role,
          status: "skipped",
          message: "既に登録済みのためスキップ",
        });
        continue;
      }

      const isAdmin = row.role === "管理者";
      const result = await createManager(
        {
          name: row.name,
          email: row.email,
          department: row.department,
          isAdmin,
        },
        tenantId
      );

      if (result) {
        managerMap.set(row.name, result.id);
        const url = `${baseUrl}/m/${result.token}`;
        results.push({
          line: row.line,
          name: row.name,
          email: row.email,
          role: row.role,
          status: "success",
          token: result.token,
          url,
          message: "登録完了",
        });
      } else {
        results.push({
          line: row.line,
          name: row.name,
          email: row.email,
          role: row.role,
          status: "error",
          message: "登録に失敗しました",
        });
      }
    }

    // 2. 参加者登録
    for (const row of participantRows) {
      if (existingEmails.has(row.email.toLowerCase())) {
        results.push({
          line: row.line,
          name: row.name,
          email: row.email,
          role: row.role,
          status: "skipped",
          message: "既に登録済みのためスキップ",
        });
        continue;
      }

      const managerId = row.managerName
        ? managerMap.get(row.managerName) || undefined
        : undefined;

      const result = await createParticipant(
        {
          name: row.name,
          email: row.email,
          department: row.department,
          dojoPhase: row.dojoPhase || "道場1 覚醒",
          managerId,
          fbPolicy: "",
        },
        tenantId
      );

      if (result) {
        const url = `${baseUrl}/p/${result.token}`;
        results.push({
          line: row.line,
          name: row.name,
          email: row.email,
          role: row.role,
          status: "success",
          token: result.token,
          url,
          message: "登録完了",
        });
      } else {
        results.push({
          line: row.line,
          name: row.name,
          email: row.email,
          role: row.role,
          status: "error",
          message: "登録に失敗しました",
        });
      }
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const skipCount = results.filter((r) => r.status === "skipped").length;
    const errorCount = results.filter((r) => r.status === "error").length;

    return NextResponse.json({
      success: true,
      summary: {
        total: rows.length,
        success: successCount,
        skipped: skipCount,
        errors: errorCount,
      },
      results,
    });
  } catch (error) {
    console.error("Error in POST /api/admin/import:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/admin/import?token=xxx
// CSVテンプレートをダウンロード
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token || !(await isAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const template = `name,email,department,role,dojoPhase,managerName
田中太郎,tanaka@example.com,営業部,マネージャー,,
佐藤花子,sato@example.com,営業部,参加者,道場1 覚醒,田中太郎
鈴木一郎,suzuki@example.com,人事部,参加者,道場1 覚醒,田中太郎`;

  return new NextResponse(template, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="corelog_import_template.csv"',
    },
  });
}
