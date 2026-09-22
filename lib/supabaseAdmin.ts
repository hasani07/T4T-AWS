import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * PERINGATAN: client ini memakai service_role key, yang MELEWATI SEMUA
 * Row Level Security. Siapa pun yang memegang instance ini bisa membaca DAN
 * menulis apa saja di seluruh database Supabase, tanpa batasan.
 *
 * ATURAN KETAT:
 * - JANGAN PERNAH import file ini dari komponen client ("use client").
 * - JANGAN PERNAH mengembalikan/meneruskan client ini (atau key-nya) ke browser.
 * - HANYA dipakai di route handler server (app/api/admin/**), dan HANYA
 *   dipanggil setelah password admin diverifikasi.
 *
 * Ini SATU-SATUNYA tempat di seluruh proyek yang menulis ke Supabase.
 * Di semua tempat lain (lib/supabase.ts) dashboard murni pembaca data,
 * lihat komentar di file itu.
 *
 * Dibuat lazy (bukan langsung saat file di-import) supaya bagian dashboard
 * lain TIDAK ikut error kalau env var admin ini belum diisi di deployment.
 */
export function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi di .env.local " +
        "untuk fitur admin firmware. Ambil service_role key dari Supabase Dashboard -> " +
        "Project Settings -> API -> Project API keys (JANGAN disebar atau di-commit ke git)."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
