import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

/**
 * Lazy-init: env var baru DICEK saat fungsi ini dipanggil (runtime),
 * BUKAN saat modul di-import. Ini supaya proses build Next.js/Vercel
 * ("collecting page data") tidak gagal total hanya karena env var ini
 * belum sempat ditambahkan — error baru muncul saat endpoint yang
 * benar-benar butuh (generate rekomendasi) dipanggil.
 *
 * PENTING: client ini memakai service_role key, yang BISA BYPASS Row
 * Level Security. HANYA boleh dipanggil dari kode server (API routes) —
 * TIDAK PERNAH dari komponen 'use client' atau dikirim ke browser.
 */
export function getSupabaseServer(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi di environment variable server untuk fitur AI Recommendation."
    );
  }

  cachedClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return cachedClient;
}
