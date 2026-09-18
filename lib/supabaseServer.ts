import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi di environment variable server untuk fitur AI Recommendation."
  );
}

// PENTING: client ini memakai service_role key, yang BISA BYPASS Row Level
// Security. HANYA boleh diimport dari kode server (API routes) — TIDAK
// PERNAH dari komponen 'use client' atau dikirim ke browser. Dipakai
// khusus untuk menulis ke tabel BARU `ai_recommendations`, tidak pernah
// menyentuh tabel `devices`/`sensors`/`system_logs` yang sudah berjalan.
export const supabaseServer = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
