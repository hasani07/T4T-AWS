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
//
// PENTING -- `cache: "no-store"` di fetch di bawah ini disengaja. Next.js
// menyimpan hasil fetch() di server ("Data Cache") dengan kunci URL
// permintaannya dan, di deployment ini, `export const dynamic = "force-dynamic"`
// saja TIDAK cukup mencegahnya: hasil query bisa tersangkut berhari-hari
// (pernah terjadi di halaman kuota: tanggal isi ulang sudah diubah tapi halaman
// dan pengingat Telegram tetap memakai tanggal lama). Dashboard ini
// monitoring langsung, jadi semua pembacaan dipaksa mengambil data terbaru.
// Di browser opsi ini tidak berpengaruh apa-apa.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, { ...init, cache: "no-store" }),
  },
});
