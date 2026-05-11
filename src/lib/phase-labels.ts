// Shared helper: read per-tenant phase labels from ai_settings
import { getClient } from "@/lib/supabase";

export async function getPhaseLabels(tenantId: string): Promise<string[]> {
  try {
    const { data, error } = await getClient()
      .from("ai_settings")
      .select("value")
      .eq("tenant_id", tenantId)
      .eq("key", "phase_labels")
      .maybeSingle();
    if (error || !data?.value) return [];
    try {
      const parsed = JSON.parse(data.value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  } catch {
    return [];
  }
}

export async function savePhaseLabels(tenantId: string, labels: string[]): Promise<boolean> {
  try {
    const { error } = await getClient()
      .from("ai_settings")
      .upsert(
        {
          tenant_id: tenantId,
          key: "phase_labels",
          value: JSON.stringify(labels),
        },
        { onConflict: "tenant_id,key" }
      );
    return !error;
  } catch {
    return false;
  }
}
