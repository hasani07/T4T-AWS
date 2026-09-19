import { supabase } from "./supabase";
import { getSupabaseServer } from "./supabaseServer";

export async function getSetting<T = unknown>(key: string, defaultValue: T): Promise<T> {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error || !data) return defaultValue;
  return (data.value as T) ?? defaultValue;
}

/**
 * PENTING: hanya boleh dipanggil dari kode server (API routes) — memakai
 * service_role key karena tabel `settings` sengaja tidak punya policy
 * insert/update untuk anon.
 */
export async function setSetting(key: string, value: unknown): Promise<void> {
  const { error } = await getSupabaseServer()
    .from("settings")
    .upsert({ key, value });

  if (error) {
    throw new Error(`Gagal menyimpan setting "${key}": ${error.message}`);
  }
}
