import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Client Supabase (anon key, read-only) KHUSUS untuk halaman server yang
// datanya tidak boleh basi -- mis. app/kuota/page.tsx.
//
// Kenapa terpisah dari lib/supabase.ts: Next.js menyimpan hasil fetch() di
// server ("Data Cache") dengan kunci berupa URL permintaannya, BUKAN URL
// halaman. Akibatnya hasil query yang sama bisa tersangkut lama (berhari-hari)
// walau tabelnya sudah berubah, dan membuka halaman dengan ?x=1 atau jendela
// incognito tidak membantu. Di sini setiap permintaan ke Supabase dipaksa
// `cache: "no-store"`, jadi selalu membaca isi tabel yang sekarang.
//
// Hanya untuk dipakai di kode server (server component / API route).

let cachedClient: SupabaseClient | null = null;

export function getSupabaseFresh(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY wajib diisi di environment variable."
    );
  }

  cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return cachedClient;
}
