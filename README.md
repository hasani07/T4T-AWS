# AWS T4T — Dashboard Monitoring Mikroklimat (Fase 1 + Fase 2)

Dashboard web untuk memonitor data sensor mikroklimat (suhu, kelembaban,
kecepatan & arah angin, curah hujan) dari 2 device AWS (`CISANGKUY`,
`CIMINYAK`), dibaca langsung dari Supabase.

**Referensi lengkap fitur & keputusan desain**: lihat file PRD
(`PRD_Dashboard_Monitoring_AWS_T4T.md`) yang menyertai project ini.

## Lingkup Fase 1 (Fondasi)

✅ Koneksi ke Supabase (read-only)
✅ Kartu dashboard per device: suhu, kelembaban, kecepatan angin, arah angin,
   curah hujan
✅ Status Online/Offline (threshold 90 menit, sesuai PRD)
✅ Update kartu real-time (Supabase Realtime — otomatis refresh saat ada
   data baru masuk, tanpa perlu reload halaman)

## Lingkup Fase 2 (Analitik & Perbandingan Periode) — halaman `/analytics`

✅ Pilih device (`CISANGKUY` / `CIMINYAK`)
✅ Filter periode: 7 hari terakhir, 1 bulan terakhir (rolling 30 hari), atau
   custom range (pilih tanggal dari–sampai)
✅ Statistik per parameter: rata-rata, min, max (suhu, kelembaban, kecepatan
   angin), serta total curah hujan pada periode tersebut
✅ **Perbandingan otomatis** dengan periode sebelumnya yang durasinya sama
   (ditampilkan sebagai delta persentase ▲/▼)
✅ Arah angin dominan (dihitung sebagai modus/frekuensi kategori kompas,
   mengecualikan kategori `"U"`/calm)
✅ Grafik tren garis untuk suhu, kelembaban, dan kecepatan angin sepanjang
   periode yang dipilih
✅ **Filter sanity-check otomatis**: baris data dengan nilai di luar rentang
   wajar (lihat `lib/config.ts` → `SANITY_RANGES`) dikecualikan dari
   perhitungan statistik, dengan notifikasi berapa baris yang dikecualikan.
   Data mentahnya tetap ada di database, tidak dihapus/diubah.

Belum termasuk (menyusul di fase berikutnya sesuai roadmap PRD): download
CSV, AI recommendation (Groq), laporan mingguan Telegram, backup otomatis.

## ⚠️ PENTING — Prinsip Keamanan Data

Project ini **hanya membaca (SELECT)** data dari tabel `devices` dan
`sensors` yang sudah berjalan. **Tidak ada satupun kode di sini yang
menulis (insert/update/delete)** ke tabel tersebut. Pipeline device →
Supabase yang sudah ada **tidak disentuh sama sekali** oleh project ini.

Gunakan **anon/public key** Supabase (bukan `service_role` key) di
`.env.local` — anon key ini cukup untuk operasi baca dan lebih aman
dipakai di sisi browser.

Jangan mengubah Row Level Security (RLS) di Supabase sebagai bagian dari
setup fase ini. Kalau nanti perlu mengaktifkan/mengubah RLS untuk alasan
keamanan, itu didiskusikan terpisah supaya tidak berisiko mengganggu jalur
tulis data dari device.

## Setup Lokal

1. Install dependencies:
   ```bash
   npm install
   ```

2. Salin `.env.example` menjadi `.env.local`, lalu isi dengan kredensial
   Supabase Anda:
   ```bash
   cp .env.example .env.local
   ```
   Isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (bisa dilihat di Supabase Dashboard → Project Settings → API).

3. Jalankan dev server:
   ```bash
   npm run dev
   ```
   Buka [http://localhost:3000](http://localhost:3000) — seharusnya
   langsung tampil kartu untuk device `CISANGKUY` dan `CIMINYAK` dengan
   data terbaru dari Supabase.

## Deploy ke GitHub + Vercel

1. Buat repo baru di GitHub bernama **AWS T4T** (atau nama lain sesuai
   preferensi Anda), lalu push project ini ke sana:
   ```bash
   git init
   git add .
   git commit -m "Fase 1: fondasi dashboard + koneksi Supabase read-only"
   git branch -M main
   git remote add origin <url-repo-github-anda>
   git push -u origin main
   ```
   *(`.env.local` tidak akan ikut ter-push karena sudah ada di `.gitignore`
   — kredensial Anda aman.)*

2. Buka [vercel.com](https://vercel.com), login/daftar, lalu klik
   **"Add New Project"** → import repo GitHub **AWS T4T** yang baru dibuat.

3. Di halaman konfigurasi project Vercel, buka bagian **Environment
   Variables**, tambahkan:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   (nilainya sama seperti di `.env.local` Anda)

4. Klik **Deploy**. Setelah selesai, Vercel akan kasih URL live (misal
   `aws-t4t.vercel.app`) yang bisa langsung diakses.

## Troubleshooting Cepat

- **Kartu kosong / "Tidak ada device ditemukan"**: cek environment
  variable sudah benar, dan cek juga apakah RLS di tabel `devices`/
  `sensors` mengizinkan role `anon` untuk SELECT (kalau RLS belum aktif
  sama sekali di tabel tersebut, seharusnya tidak masalah — anon key
  otomatis bisa baca).
- **Error saat build terkait environment variable**: pastikan sudah
  set `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` baik
  di `.env.local` (lokal) maupun di Environment Variables Vercel (saat
  deploy).

## Roadmap Fase Berikutnya

Lihat Bagian "Rencana Mulai" di percakapan / PRD untuk detail fase 3–7:
Download CSV → AI Recommendation (Groq) → Laporan Mingguan Telegram →
Backup & Notifikasi.
