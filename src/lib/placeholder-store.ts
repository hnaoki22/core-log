/**
 * テナント別プレースホルダー例示の保存・取得。
 * ai_settings テーブルに key="placeholder_examples" で JSON 保存する。
 *
 * データ構造:
 * {
 *   phase: number | "universal",
 *   type: "morning" | "evening",
 *   examples: [{ text: string, source: string }]
 * }[]
 *
 * 生成日時・承認状態も併せて管理する。
 */

import { getClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import type { PlaceholderType, PhaseKey, PlaceholderExample } from "./placeholder-examples";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StoredExampleSet = {
  phase: PhaseKey;
  type: PlaceholderType;
  examples: PlaceholderExample[];
};

export type PlaceholderStoreData = {
  /** 承認済みの例示セット */
  approved: StoredExampleSet[];
  /** AI生成済み・未承認（レビュー待ち）の例示セット */
  draft: StoredExampleSet[];
  /** 最終更新日時 (ISO string) */
  updatedAt: string;
  /** AI生成時に使用した入力情報のサマリー */
  generationContext?: string;
};

const AI_SETTINGS_KEY = "placeholder_examples";

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * テナントの承認済みプレースホルダー例示を取得する。
 * 未設定の場合は null を返す（呼び出し元がハードコードにフォールバック）。
 */
export async function getApprovedExamples(
  tenantId: string
): Promise<StoredExampleSet[] | null> {
  try {
    const { data, error } = await getClient()
      .from("ai_settings")
      .select("value")
      .eq("tenant_id", tenantId)
      .eq("key", AI_SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      logger.error("Failed to read placeholder examples", {
        error: error.message,
        tenantId,
      });
      return null;
    }
    if (!data?.value) return null;

    try {
      const parsed: PlaceholderStoreData = JSON.parse(data.value);
      if (!parsed.approved || parsed.approved.length === 0) return null;
      return parsed.approved;
    } catch {
      logger.error("Failed to parse placeholder examples JSON", { tenantId });
      return null;
    }
  } catch (err) {
    logger.error("Unexpected error reading placeholder examples", {
      tenantId,
      error: String(err),
    });
    return null;
  }
}

/**
 * テナントの全データ（approved + draft）を取得する。管理画面用。
 */
export async function getPlaceholderStoreData(
  tenantId: string
): Promise<PlaceholderStoreData | null> {
  try {
    const { data, error } = await getClient()
      .from("ai_settings")
      .select("value")
      .eq("tenant_id", tenantId)
      .eq("key", AI_SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      logger.error("Failed to read placeholder store", {
        error: error.message,
        tenantId,
      });
      return null;
    }
    if (!data?.value) return null;

    try {
      return JSON.parse(data.value) as PlaceholderStoreData;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * テナントのプレースホルダーデータを保存（upsert）する。
 */
export async function savePlaceholderStoreData(
  tenantId: string,
  storeData: PlaceholderStoreData
): Promise<boolean> {
  try {
    const { error, data: updated } = await getClient()
      .from("ai_settings")
      .upsert(
        {
          tenant_id: tenantId,
          key: AI_SETTINGS_KEY,
          value: JSON.stringify(storeData),
        },
        { onConflict: "tenant_id,key" }
      )
      .select("tenant_id");

    if (error) {
      logger.error("Failed to save placeholder store", {
        error: error.message,
        tenantId,
      });
      return false;
    }
    if (!updated || updated.length === 0) {
      logger.warn("Placeholder store upsert matched 0 rows", { tenantId });
      return false;
    }
    return true;
  } catch (err) {
    logger.error("Unexpected error saving placeholder store", {
      tenantId,
      error: String(err),
    });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Convenience: approve drafts → move to approved
// ---------------------------------------------------------------------------

/**
 * ドラフトを承認済みに昇格する。
 * 既存の approved は上書きされる（全入れ替え）。
 */
export async function approveDrafts(tenantId: string): Promise<boolean> {
  const store = await getPlaceholderStoreData(tenantId);
  if (!store || !store.draft || store.draft.length === 0) {
    logger.warn("No drafts to approve", { tenantId });
    return false;
  }

  const updated: PlaceholderStoreData = {
    approved: store.draft,
    draft: [],
    updatedAt: new Date().toISOString(),
    generationContext: store.generationContext,
  };

  return savePlaceholderStoreData(tenantId, updated);
}

/**
 * ドラフトに AI 生成結果を保存する（既存ドラフトは上書き）。
 */
export async function saveDraftExamples(
  tenantId: string,
  drafts: StoredExampleSet[],
  generationContext?: string
): Promise<boolean> {
  const existing = await getPlaceholderStoreData(tenantId);

  const store: PlaceholderStoreData = {
    approved: existing?.approved ?? [],
    draft: drafts,
    updatedAt: new Date().toISOString(),
    generationContext: generationContext ?? existing?.generationContext,
  };

  return savePlaceholderStoreData(tenantId, store);
}
