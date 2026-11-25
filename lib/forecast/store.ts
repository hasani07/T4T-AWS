import type { SupabaseClient } from "@supabase/supabase-js";
import type { ForecastPayload } from "./train";

const MAX_AGE_HOURS = 36; // lebih tua dari ini = cron latih malam kemungkinan tidak jalan

export interface StoredPayload {
  payload: ForecastPayload;
  fresh: boolean; // false = sudah lebih dari 36 jam tidak dilatih ulang
}

/** Model terbaru dari tabel forecast_models (null kalau tabel kosong/belum dibuat). */
export async function loadLatestPayload(client: SupabaseClient): Promise<StoredPayload | null> {
  const { data, error } = await client
    .from("forecast_models")
    .select("trained_at, payload")
    .order("trained_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("Gagal membaca model prediksi:", error.message);
    return null;
  }
  const payload = data.payload as ForecastPayload;
  if (!payload || payload.version !== 1) return null;
  const ageH = (Date.now() - Date.parse(String(data.trained_at))) / 3600_000;
  return { payload, fresh: ageH <= MAX_AGE_HOURS };
}
