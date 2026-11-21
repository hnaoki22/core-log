/**
 * 管理画面の「環境とユーザー」の一覧の読み取り（サーバー側だけで使う）。
 *
 * 返す値にはログイン用のパス（トークン入り）が含まれる。呼び出し側は、
 * 管理者（is_admin）であることを確かめてから呼ぶこと。記入（logs）は読まない。
 */

import { getClient } from "@/lib/supabase";
import { getFlagsForTenant } from "@/lib/feature-flags";
import { DAIKO_TENANT_ID } from "@/lib/tenants";
import { logger } from "@/lib/logger";
import {
  buildLoginPath,
  managerKind,
  resolveEnvironmentPurpose,
  type DirectoryEnvironment,
  type DirectoryUser,
} from "@/lib/admin-directory";

/** PostgREST が 1 回に返す行数の上限に合わせる。これ以上は「一部だけ」として伝える */
const MAX_ROWS = 1000;

export type AdminDirectory = {
  environments: DirectoryEnvironment[];
  users: DirectoryUser[];
  /** 行数の上限に当たり、一部だけを返しているとき true */
  truncated: boolean;
};

type TenantRow = {
  id: string;
  name: string | null;
  slug: string | null;
  company_name: string | null;
  plan: string | null;
  config: unknown;
};
type ParticipantRow = {
  id: string;
  name: string | null;
  department: string | null;
  tenant_id: string | null;
  token: string | null;
  created_at: string | null;
};
type ManagerRow = ParticipantRow & { role: string | null; is_admin: boolean | null };

function configPurpose(config: unknown): unknown {
  if (config === null || typeof config !== "object") return undefined;
  return (config as Record<string, unknown>).purpose;
}

/**
 * 全環境と全ユーザーを読む。読み取りに失敗したら例外を投げる
 * （空の一覧を返すと「だれもいない」ように見えてしまうため）。
 */
export async function loadAdminDirectory(): Promise<AdminDirectory> {
  const client = getClient();
  const [tenantsRes, participantsRes, managersRes] = await Promise.all([
    client
      .from("tenants")
      .select("id, name, slug, company_name, plan, config")
      .order("created_at", { ascending: true })
      .limit(MAX_ROWS),
    client
      .from("participants")
      .select("id, name, department, tenant_id, token, created_at")
      .order("created_at", { ascending: true })
      .limit(MAX_ROWS),
    client
      .from("managers")
      .select("id, name, department, role, is_admin, tenant_id, token, created_at")
      .order("created_at", { ascending: true })
      .limit(MAX_ROWS),
  ]);

  for (const [label, res] of [
    ["tenants", tenantsRes],
    ["participants", participantsRes],
    ["managers", managersRes],
  ] as const) {
    if (res.error) {
      logger.error("Query failed (loadAdminDirectory)", { table: label, error: res.error.message });
      throw new Error(`admin directory: ${label} query failed`);
    }
  }

  const tenantRows = (tenantsRes.data ?? []) as TenantRow[];
  const participantRows = (participantsRes.data ?? []) as ParticipantRow[];
  const managerRows = (managersRes.data ?? []) as ManagerRow[];

  const environments: DirectoryEnvironment[] = await Promise.all(
    tenantRows.map(async (t) => {
      const flags = await getFlagsForTenant(t.id);
      return {
        id: t.id,
        slug: t.slug ?? "",
        name: t.name ?? "",
        companyName: t.company_name ?? "",
        purpose: resolveEnvironmentPurpose({
          isProtectedProduction: t.id === DAIKO_TENANT_ID,
          configPurpose: configPurpose(t.config),
          plan: t.plan,
        }),
        inputMode: flags["standalone_mode"] === true ? ("standalone" as const) : ("standard" as const),
        otpEnabled: flags["feature.otpAuth"] === true,
      };
    })
  );

  const users: DirectoryUser[] = [];
  for (const p of participantRows) {
    // トークンか所属が欠けた行は、開く先を作れないので出さない
    if (!p.token || !p.tenant_id) continue;
    users.push({
      id: p.id,
      kind: "participant",
      name: p.name ?? "",
      department: p.department ?? "",
      environmentId: p.tenant_id,
      createdAt: p.created_at,
      loginPath: buildLoginPath("participant", p.token),
    });
  }
  for (const m of managerRows) {
    if (!m.token || !m.tenant_id) continue;
    const kind = managerKind(m.role, m.is_admin);
    users.push({
      id: m.id,
      kind,
      name: m.name ?? "",
      department: m.department ?? "",
      environmentId: m.tenant_id,
      createdAt: m.created_at,
      loginPath: buildLoginPath(kind, m.token),
    });
  }

  const truncated = participantRows.length >= MAX_ROWS || managerRows.length >= MAX_ROWS;
  if (truncated) {
    logger.warn("loadAdminDirectory hit the row limit — the list is partial", {
      participants: participantRows.length,
      managers: managerRows.length,
    });
  }

  return { environments, users, truncated };
}
