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
✅ **Perbandingan antar lokasi**: tabel yang membandingkan `CISANGKUY` vs
   `CIMINYAK` untuk periode yang sama (bukan periode sebelumnya) — suhu,
   kelembaban, kecepatan angin, curah hujan, dan arah angin dominan,
   lengkap dengan kolom selisih
✅ **Filter sanity-check otomatis**: baris data dengan nilai di luar rentang
   wajar (lihat `lib/config.ts` → `SANITY_RANGES`) dikecualikan dari
   perhitungan statistik, dengan notifikasi berapa baris yang dikecualikan.
   Data mentahnya tetap ada di database, tidak dihapus/diubah.

Belum termasuk (menyusul di fase berikutnya sesuai roadmap PRD): laporan
mingguan Telegram, backup otomatis.

## Lingkup Fase 4 (AI Recommendation) — halaman `/recommendations`

✅ **Rule engine deterministik** (`lib/rules/ruleEngine.ts`) — hitung VPD,
   klasifikasi risiko (aman/waspada/kritis) dari data sensor terbaru,
   berbasis ambang batas materi Workshop T4T. Ini murni matematika/logika,
   BUKAN dari LLM, supaya angka & klasifikasi konsisten.
✅ **Groq** (`lib/groq.ts`) hanya menyusun narasi rekomendasi dari hasil
   rule engine — tidak menghitung ulang angka.
✅ **Generate manual**: tombol di halaman, langsung pakai data real-time
   terbaru, hasil untuk 2 device sekaligus.
✅ **Generate otomatis**: tiap pagi ±06:00 WIB lewat **Vercel Cron**
   (`vercel.json`), pakai data 24 jam terakhir untuk konteks curah hujan.
✅ Riwayat rekomendasi tersimpan di tabel baru `ai_recommendations` (lihat
   `supabase/sql/001_create_ai_recommendations.sql`) — tabel ini **baru**,
   tidak menyentuh `devices`/`sensors`/`system_logs`.

### ⚠️ Setup Tambahan yang WAJIB Sebelum Fase 4 Ini Jalan

1. **Jalankan SQL migrasi**: buka Supabase Dashboard → SQL Editor, copy-paste
   isi file `supabase/sql/001_create_ai_recommendations.sql`, jalankan.
   Ini membuat tabel baru, tidak mengubah tabel yang sudah ada.

2. **Dapatkan Groq API key**: daftar/login di
   [console.groq.com](https://console.groq.com), buat API key baru.

3. **Dapatkan Supabase service_role key**: Supabase Dashboard → Project
   Settings → API → bagian "Project API keys" → copy key **`service_role`**
   (BUKAN yang `anon`). Key ini sangat rahasia — bisa akses penuh ke semua
   tabel, jangan pernah ditaruh di kode frontend atau di-commit ke Git.

4. **Buat CRON_SECRET**: string acak bebas untuk mengamankan endpoint cron
   (boleh generate dari [randomkeygen.com](https://randomkeygen.com) atau
   sejenisnya).

5. **Tambahkan ke Environment Variables di Vercel** (Project Settings →
   Environment Variables), selain 2 yang sudah ada sebelumnya:
   - `GROQ_API_KEY`
   - `GROQ_MODEL` (opsional, default `openai/gpt-oss-120b` — cek model
     yang tersedia di console Groq kalau mau ganti)
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`

   **PENTING**: jangan beri prefix `NEXT_PUBLIC_` pada 4 variable di atas —
   itu akan membuatnya ter-expose ke browser.

6. Redeploy project di Vercel setelah environment variables ditambahkan
   (Vercel akan otomatis mendeteksi `vercel.json` dan mendaftarkan jadwal
   cron-nya saat deploy).

## Lingkup Fase 5 (Laporan Mingguan Telegram) — halaman `/reports`

✅ Isi laporan: **teks ringkasan** (suhu, kelembaban, angin, curah hujan,
   arah angin dominan, delta vs periode sebelumnya) + **grafik** (tren
   suhu harian, dibuat via QuickChart.io) + **rekomendasi AI terakhir**
   per device.
✅ Dikirim ke **1 channel Telegram** (foto grafik dulu, lalu pesan teks
   detail terpisah karena caption foto Telegram terbatas panjangnya).
✅ **Generate manual**: tombol di halaman, langsung generate & kirim.
✅ **Generate otomatis**: dicek setiap pagi (via Vercel Cron, 5 menit
   setelah cron AI Recommendation), tapi baru benar-benar mengirim kalau
   sudah lewat interval yang dikonfigurasi sejak laporan terakhir —
   **interval bisa diatur dari dashboard** (disimpan di tabel `settings`,
   default 7 hari) tanpa perlu ubah jadwal cron.
✅ Riwayat laporan (`weekly_reports`) — tabel baru, tidak menyentuh yang
   sudah ada.

### ⚠️ Setup Tambahan untuk Fase 5

1. **Jalankan SQL migrasi kedua**: `supabase/sql/002_create_weekly_reports.sql`
   di Supabase SQL Editor (bikin tabel `settings` & `weekly_reports`).

2. **Buat Bot Telegram**:
   - Chat ke [@BotFather](https://t.me/BotFather) di Telegram
   - Kirim `/newbot`, ikuti instruksinya (kasih nama & username bot)
   - Simpan **token** yang diberikan (formatnya seperti
     `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`)

3. **Buat/siapkan channel Telegram**, lalu **tambahkan bot tadi sebagai
   admin** channel itu (Settings channel → Administrators → Add Admin →
   cari username bot Anda).

4. **Dapatkan Chat ID channel**:
   - Kirim 1 pesan apa saja ke channel-nya dulu
   - Buka di browser:
     `https://api.telegram.org/bot<TOKEN_BOT_ANDA>/getUpdates`
     (ganti `<TOKEN_BOT_ANDA>` dengan token dari langkah 2)
   - Cari bagian `"chat":{"id":-100xxxxxxxxxx, ...}` di hasil JSON-nya —
     angka itu (termasuk tanda minusnya) adalah Chat ID Anda

5. **Tambahkan ke Environment Variables Vercel**:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`

6. Redeploy, lalu coba klik "Generate & Kirim Sekarang" di halaman
   `/reports` — cek apakah pesannya muncul di channel Telegram Anda.

## Lingkup Fase 3 (Download Data Sensor) — halaman `/download`

✅ Pilih device (`CISANGKUY` / `CIMINYAK` / "Semua Device" gabungan)
✅ Filter periode: 7 hari terakhir, 1 bulan terakhir, atau custom range
✅ Export ke **CSV** dengan kolom: `created_at, device_id, device_type,
   temperature, humidity, wind_speed, wind_direction, rainfall`
✅ **Pagination otomatis** — kalau data pada rentang tanggal lebih dari 1000
   baris (batas default per-query Supabase), sistem otomatis mengambil
   semua halaman data supaya tidak ada yang terpotong diam-diam
✅ File CSV berisi data **mentah apa adanya** (tidak difilter sanity-check
   seperti di halaman Analitik) — cocok untuk audit/investigasi

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

Lihat Bagian "Rencana Mulai" di percakapan / PRD untuk detail fase 6:
Backup & Notifikasi.

## Catatan Arsitektur: Scheduler

**Update**: Semua cron job (AI Recommendation & Laporan Mingguan) sudah
**dipindahkan ke Supabase Edge Functions + pg_cron**, bukan lagi Vercel
Cron. Lihat bagian "Migrasi Scheduler ke Supabase" di bawah.

Endpoint `/api/cron/generate-recommendation` dan `/api/cron/weekly-report`
di Next.js **masih ada** di kode (tidak dihapus, tidak berbahaya kalau
dibiarkan — dilindungi `CRON_SECRET`), tapi **tidak lagi dipanggil
otomatis** karena `vercel.json` sudah tidak punya konfigurasi cron.
Tombol **manual** ("Generate Rekomendasi Sekarang", "Generate & Kirim
Sekarang") tetap jalan seperti biasa lewat Next.js/Vercel — yang pindah
cuma bagian **terjadwal/otomatisnya**.

## Migrasi Scheduler ke Supabase Edge Functions + pg_cron

### Kenapa Pindah
- Presisi jadwal lebih baik (tidak "kira-kira dalam 1 jam" seperti Vercel
  Hobby)
- Tidak dibatasi 1x/hari kalau nanti butuh frekuensi lebih tinggi
- Konsisten dengan Fase 6 (Backup & Notifikasi) yang memang harus pakai
  infrastruktur ini

### File yang Terlibat
- `supabase/functions/generate-recommendation/index.ts` — versi Deno dari
  logic AI Recommendation
- `supabase/functions/weekly-report/index.ts` — versi Deno dari logic
  Laporan Mingguan
- `supabase/sql/003_setup_pg_cron.sql` — SQL untuk menjadwalkan keduanya

### Langkah Deploy (Semua Lewat Browser, TIDAK Perlu Install CLI/Docker)

1. **Buka Supabase Dashboard → Edge Functions** (menu di sidebar kiri).
2. Klik **"Deploy a new function"** → pilih **"Via Editor"**.
3. Beri nama function: **`generate-recommendation`** (harus persis ini).
4. Hapus kode template bawaan, **paste seluruh isi**
   `supabase/functions/generate-recommendation/index.ts` dari project ini.
5. Klik **Deploy**.
6. Ulangi langkah 2-5 untuk function kedua, nama: **`weekly-report`**,
   isinya dari `supabase/functions/weekly-report/index.ts`.

### Set Secrets untuk Edge Functions

Masuk ke **Project Settings → Edge Functions → Secrets** (atau menu
serupa tergantung versi dashboard), tambahkan:
- `GROQ_API_KEY`
- `GROQ_MODEL` (opsional, default `openai/gpt-oss-120b`)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

*(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` OTOMATIS
tersedia di semua Edge Function — tidak perlu diisi manual.)*

### Jadwalkan dengan pg_cron

1. Buka **Supabase SQL Editor**.
2. Buka file `supabase/sql/003_setup_pg_cron.sql`, **ganti**
   `<PROJECT_REF>` dan `<SERVICE_ROLE_KEY>` dengan punya Anda (project
   ref terlihat di URL dashboard atau Project Settings → General).
3. Jalankan SQL-nya.
4. Cek jadwal aktif: `select * from cron.job;`

### Tes Manual (Sebelum Menunggu Jadwal)

Bisa test langsung dari SQL Editor atau browser dengan memanggil URL
function-nya pakai service_role key sebagai Bearer token (pakai tool
seperti Postman, atau `curl` kalau familiar terminal) — atau paling
gampang, tunggu jadwalnya jalan besok pagi, lalu cek:
```sql
select * from cron.job_run_details order by start_time desc limit 10;
```

## ⚠️ Catatan Penting: Bug Timestamp di Sumber Data

Ditemukan bahwa kolom `sensors.created_at` diberi label UTC (`+00`) oleh
Supabase, **padahal angka jam yang tersimpan sebenarnya sudah WIB**
(device/pipeline pengirim data salah label — bukan benar-benar UTC). Ini
bug di sisi sumber data, di luar kendali dashboard, dan **tidak diubah**
(sesuai prinsip non-destructive) — kompensasinya dilakukan di sisi
dashboard:

- `lib/deviceStatus.ts` — jam ditampilkan apa adanya (tidak dikonversi
  timezone lagi), dan perhitungan online/offline & "X menit lalu"
  dikonversi balik dengan MENGURANGI 7 jam untuk dapat instant UTC yang
  benar.
- `lib/sensorTimeOffset.ts` — helper baru untuk menggeser rentang tanggal
  query (dipakai di Analitik, Download CSV, dan window 24 jam AI
  Recommendation) supaya cocok dengan cara data tersimpan.
- `components/analytics/TrendChart.tsx` — label sumbu waktu grafik ambil
  angka jam langsung dari data, tanpa `toLocaleString` yang bisa
  menggandakan konversi.

**Catatan ini HANYA berlaku untuk tabel `sensors`** (asalnya dari device).
Timestamp yang dibuat sendiri oleh server kita (`ai_recommendations`,
nanti `weekly_reports`/`backup_logs`) tidak kena masalah ini, karena
berasal dari jam server Vercel/Postgres yang benar.
