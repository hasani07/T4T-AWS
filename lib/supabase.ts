import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY wajib diisi di file .env.local. " +
      "Lihat .env.example untuk contohnya."
  );
}

// Satu client dipakai untuk server component (fetch awal) maupun client
// component (realtime subscription). Dashboard ini TIDAK PERNAH menulis
// (insert/update/delete) ke tabel devices/sensors — murni pembaca data,
// sesuai prinsip non-destructive di PRD Bagian 4.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
