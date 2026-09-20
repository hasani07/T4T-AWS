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

## Fitur Tambahan (di luar PRD awal): Laporan Excel dengan Grafik

Ditambahkan berdasarkan masukan pengguna — halaman `/download` sekarang
juga punya **Export ke Excel** yang menghasilkan file `.xlsx` berisi:
- Tabel ringkasan (min/max/rata-rata suhu & kelembaban, rata-rata
  kecepatan angin, total curah hujan) per periode
- **Grafik tren suhu tertanam langsung di dalam file Excel-nya** (bukan
  cuma link/gambar terpisah)

3 pilihan granularitas:
- **Harian (per Jam)** — pilih 1 tanggal, breakdown per jam
- **Mingguan (per Hari)** — 7 hari terakhir, breakdown per hari
- **Bulanan (per Hari)** — 30 hari terakhir, breakdown per hari

Dibangun pakai library `exceljs` (server-side, di API route
`/api/reports/export-excel`) dan QuickChart.io untuk render gambar
grafiknya (sama seperti yang dipakai di Laporan Mingguan Telegram).

## Fitur Tambahan: Generate Laporan Lewat Command Chat Telegram

Selain generate dari dashboard, sekarang bisa juga minta laporan langsung
dari Telegram dengan mengetik command:
- `/laporan` — 7 hari terakhir (default)
- `/laporan minggu` — 7 hari terakhir
- `/laporan bulan` — 30 hari terakhir
- `/laporan 14` — 14 hari terakhir (bisa ganti angka lain)
- `/laporan 2026-09-01 2026-09-19` — custom range tanggal (format YYYY-MM-DD)

Balasannya dikirim ke **chat yang sama** tempat command diketik (channel,
grup, atau chat pribadi ke bot).

**⚠️ Batasan Telegram (bukan dari kode ini)**: kalau dipakai di
**Channel** (bukan Grup), **hanya admin channel** yang bisa mengirim
pesan/command sama sekali — itu memang cara kerja Channel di Telegram.
Subscriber biasa tidak akan punya kotak ketik. Kalau mau semua orang bisa
pakai command ini bebas, gunakan **Grup** Telegram, bukan Channel (laporan
otomatis terjadwal tetap bisa dikirim ke Channel seperti biasa).

### Setup Tambahan

1. **Jalankan migrasi**: `supabase/sql/006_allow_chat_trigger.sql` (izinkan
   nilai `trigger_type = 'chat'` di tabel `weekly_reports`, tabel milik
   kita sendiri jadi aman diubah).

2. **Buat `TELEGRAM_WEBHOOK_SECRET`**: string acak bebas, mis. dari
   `openssl rand -hex 24`.

3. **Deploy Edge Function `telegram-webhook`**: Supabase Dashboard → Edge
   Functions → Deploy a new function → Via Editor → nama persis
   `telegram-webhook` → paste isi
   `supabase/functions/telegram-webhook/index.ts` → Deploy.

4. **PENTING — matikan verifikasi JWT untuk function ini**: cari
   pengaturan function `telegram-webhook` (biasanya toggle "Enforce JWT
   Verification" / "Verify JWT" di halaman detail function), **matikan**.
   Telegram tidak bisa mengirim token autentikasi Supabase kita, jadi kalau
   verifikasi JWT masih aktif, semua request dari Telegram akan ditolak
   duluan sebelum sampai ke kode kita. Keamanannya digantikan oleh
   pengecekan `TELEGRAM_WEBHOOK_SECRET` di dalam kode function-nya sendiri.

5. **Tambahkan secret** `TELEGRAM_WEBHOOK_SECRET` di Edge Function
   Secrets (selain `TELEGRAM_BOT_TOKEN` yang sudah ada dari Fase 5).

6. **Daftarkan webhook ke Telegram** — buka URL ini di browser (ganti
   placeholder-nya):
   ```
   https://api.telegram.org/bot<TOKEN_BOT_ANDA>/setWebhook?url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
   ```
   Harus muncul respons `{"ok":true,"result":true,"description":"Webhook was set"}`.

7. **Tes**: ketik `/laporan` di channel (kalau Anda admin) atau chat
   pribadi ke bot. Tunggu beberapa detik, harusnya muncul balasan grafik +
   teks laporan + **file Excel** (ringkasan harian per device, 1 sheet per
   device).

### Fitur Tombol (Klik, Tidak Perlu Ngetik)

Ketik `/start` atau `/menu` sekali (boleh siapa saja di channel, tidak
harus admin) — bot akan balas dengan **3 tombol**: "📅 Hari Ini",
"📆 Minggu Ini", "🗓️ Bulan Ini". Tinggal klik salah satu, laporan langsung
digenerate tanpa perlu ketik command sama sekali.

**Kenapa tombol ini bisa dipakai semua orang, sedangkan command teks
cuma admin?** Karena klik tombol (Inline Keyboard) itu jenis interaksi
Telegram yang berbeda dari mengirim pesan — namanya "callback query",
dan itu tidak kena batasan "cuma admin yang bisa kirim pesan di channel".

**Opsional**: supaya command `/laporan` juga muncul di menu "/" bawaan
Telegram (autocomplete saat mulai ngetik "/"), jalankan sekali di browser
(ganti TOKEN-nya):
```
https://api.telegram.org/bot<TOKEN>/setMyCommands?commands=[{"command":"menu","description":"Tampilkan tombol pilihan laporan"},{"command":"laporan","description":"Generate laporan (contoh: /laporan minggu)"}]
```

### Catatan: File Excel di Telegram Pakai Library Berbeda

Karena Edge Function jalan di Deno (bukan Node.js seperti Next.js/Vercel),
library `exceljs` yang dipakai di `lib/excelReport.ts` **tidak dipakai** di
sini — sebagai gantinya dipakai `xlsx` (SheetJS) yang lebih ringan dan
terbukti kompatibel dengan Deno. Fungsinya sama (bikin file Excel), tapi
Excel dari Telegram ini **berisi ringkasan harian saja** (tanpa grafik
tertanam di dalam file-nya, karena grafiknya sudah dikirim terpisah
sebagai foto) — beda dengan Excel dari halaman `/download` yang grafiknya
memang ditempel langsung di dalam file.

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

Semua 6 fase dari PRD sudah selesai diimplementasikan. 🎉

## Lingkup Fase 6 (Backup Otomatis & Notifikasi) — halaman `/backups`

✅ **Backup otomatis**: dicek tiap 15 menit (Supabase Edge Function +
   pg_cron), trigger saat kapasitas database >= 50% dari kuota yang
   dikonfigurasi.
✅ Backup berupa **export data seluruh tabel ke JSON** (bukan pg_dump
   fisik — Edge Function tidak bisa jalankan pg_dump), disimpan di
   Supabase Storage bucket `backups` (private).
✅ **Retensi 60 hari** — otomatis dihapus dari Storage kalau lewat batas
   itu dan belum pernah didownload.
✅ **Notifikasi Telegram bertingkat**:
   - Normal: 1x/24 jam
   - H-1 (sisa ≤24 jam sebelum terhapus): tiap 30 menit
   - Berhenti total begitu backup didownload lewat dashboard
✅ Halaman `/backups`: lihat kapasitas real-time, atur kuota (MB), daftar
   backup dengan tombol download (generate signed URL + tandai
   `downloaded` otomatis saat diklik).

### ⚠️ Setup Tambahan untuk Fase 6

1. **Jalankan SQL migrasi**: `supabase/sql/004_create_backup_system.sql`
   di Supabase SQL Editor. Ini membuat tabel `backup_logs`, function
   `get_database_size_mb()`, dan default kuota 500 MB di `settings`.

2. **Buat Storage bucket manual**: Supabase Dashboard → Storage → **New
   bucket** → nama **`backups`** → **Private** (jangan dicentang Public).

3. **Sesuaikan kuota database**: buka halaman `/backups` di dashboard
   Anda, cek plan Supabase yang sedang dipakai (Dashboard → Settings →
   Usage → lihat batas "Database size"), lalu update angka kuota (MB) di
   halaman itu kalau beda dari default 500 MB.

4. **Deploy Edge Function `backup-monitor`**: Supabase Dashboard → Edge
   Functions → Deploy a new function → Via Editor → nama persis
   `backup-monitor` → paste isi `supabase/functions/backup-monitor/index.ts`
   → Deploy. **Tidak perlu secrets baru** — `TELEGRAM_BOT_TOKEN` dan
   `TELEGRAM_CHAT_ID` dari Fase 5 dipakai lagi di sini.

5. **Jadwalkan lewat pg_cron**: buka `supabase/sql/005_setup_backup_cron.sql`,
   ganti `<PROJECT_REF>` dan `<SERVICE_ROLE_KEY>`, jalankan di SQL Editor.

6. Verifikasi: `select * from cron.job;` harus menampilkan 3 jadwal
   sekarang (generate-recommendation, weekly-report, backup-monitor).

### Catatan Jujur soal Keterbatasan

- Backup ini **export data**, bukan backup database fisik lengkap
  (schema, index, RLS policy tidak ikut ter-backup — itu bisa direplikasi
  ulang dari file SQL migrasi di `supabase/sql/` kalau perlu restore total).
- Kuota database **tidak otomatis terdeteksi** dari plan Supabase Anda —
  harus diisi manual dan disesuaikan sendiri kalau upgrade/downgrade plan.

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

## Fitur Tambahan: Perbandingan dengan BMKG

Halaman `/bmkg` membandingkan data sensor Anda dengan prakiraan resmi
[BMKG](https://data.bmkg.go.id/prakiraan-cuaca/) (gratis, tanpa API key)
untuk wilayah yang sama.

**Cara pakai:**
1. Buka halaman `/bmkg`
2. Isi **kode wilayah adm4** (format `32.04.19.2003`) untuk masing-masing
   device — kode ini kode kelurahan/desa dari Kemendagri, BUKAN nama
   lokasi biasa
3. Setelah disimpan, halaman otomatis ambil data BMKG dan tampilkan
   perbandingan: Suhu, Kelembaban, Kecepatan Angin, Kondisi Cuaca

**Cara dapat kode wilayah**: buka
[data.bmkg.go.id/prakiraan-cuaca](https://data.bmkg.go.id/prakiraan-cuaca/),
cari lokasi Anda lewat form pilih wilayah, lalu buka Developer Tools (F12)
→ tab Network → cari request `prakiraan-cuaca?adm4=...` → itu kodenya.

**Catatan satuan**: BMKG melaporkan kecepatan angin dalam **km/jam**,
otomatis dikonversi ke **m/s** di `lib/bmkg.ts` biar bisa dibandingkan
langsung dengan sensor kita.

**Catatan pembaruan data**: BMKG update prakiraan ~2x/hari, jadi wajar
kalau tidak 100% sama dengan pembacaan sensor real-time — ini
perbandingan skala besar (prakiraan wilayah vs pembacaan titik lokasi
presisi), bukan validasi akurasi sensor.

**Isi cepat kode wilayah**: kalau tidak mau input manual lewat UI, jalankan
`supabase/sql/007_bmkg_adm4_defaults.sql` di SQL Editor — sudah terisi
kode resmi untuk CISANGKUY (Kiangroke) dan CIMINYAK (Baranangsiang).

## Fitur Tambahan: Peta Lokasi Device

Kartu "Lokasi Device" di Dashboard utama menampilkan peta (OpenStreetMap
lewat library `leaflet`, gratis tanpa API key) dengan marker per device —
hijau kalau online, merah kalau offline. Klik marker untuk lihat nama
device & statusnya. Koordinat GPS device disimpan di
`lib/config.ts` → `DEVICE_COORDINATES` (bukan di database, karena ini
data statis lokasi fisik alat).

## Catatan: Auto-Refresh

- **Dashboard (kartu sensor)**: otomatis update via Supabase Realtime,
  tidak perlu reload sama sekali.
- **Analitik (grafik & statistik)**: auto-refresh tiap **2 menit** di
  background (tanpa mengganggu tampilan/spinner), plus tombol
  "🔄 Refresh" untuk update instan kapan saja + label "update terakhir".
- Halaman lain (BMKG, Backup, Rekomendasi AI, Laporan) masih ambil data
  fresh setiap kali halaman itu **dibuka/dinavigasi ulang** (server-side,
  `revalidate = 0`), tapi belum auto-refresh berkala kalau dibiarkan
  terbuka lama tanpa berpindah halaman.

## Fitur Tambahan: PWA (Add to Home Screen)

Sekarang dashboard bisa "di-install" ke home screen HP seperti aplikasi
native — lewat `app/manifest.ts` (konvensi Next.js, otomatis di-link) +
icon di `public/icon-192.png`, `public/icon-512.png`,
`public/apple-touch-icon.png`. Di Android/Chrome biasanya muncul prompt
"Add to Home Screen" otomatis; di iOS/Safari, buka menu Share → "Add to
Home Screen".

## Fitur Tambahan: SEO / Preview Link (Open Graph)

Link dashboard sekarang punya preview yang layak kalau di-share ke
Telegram/WhatsApp — gambar preview di `app/opengraph-image.png` (dideteksi
otomatis oleh Next.js), plus metadata title/description lengkap di
`app/layout.tsx`.

## Fitur Tambahan: Kartu VPD

Tiap kartu sensor di Dashboard sekarang juga menampilkan **VPD (Vapor
Pressure Deficit)** — dihitung dari suhu & kelembaban real-time
(`lib/rules/ruleEngine.ts` → `calcVPD`/`classifyVPD`, sama seperti yang
dipakai AI Recommendation), dengan warna berbeda tergantung kelasnya
(hijau=rendah, kuning=sedang, merah=tinggi).

## Fitur Tambahan: Alert Real-time (Kritis)

Selain AI Recommendation yang jalan 1x/hari, sekarang ada lapisan kedua:
begitu ada data sensor BARU masuk dan kondisinya masuk kategori
**KRITIS** (suhu tinggi + kelembaban rendah), **langsung** kirim alert ke
Telegram saat itu juga — tidak perlu nunggu sampai laporan harian.

### Setup

1. **Deploy Edge Function** `realtime-alert-check` (Supabase Dashboard →
   Edge Functions → Deploy a new function → Via Editor → nama persis
   `realtime-alert-check` → paste isi
   `supabase/functions/realtime-alert-check/index.ts`).
2. **Matikan "Enforce JWT Verification"** untuk function ini (sama seperti
   `telegram-webhook`).
3. **Tambahkan secret** `REALTIME_ALERT_SECRET` di Edge Function Secrets.
4. **Buat Database Webhook**: Supabase Dashboard → Database → Webhooks →
   Create a new webhook:
   - Name: `realtime-critical-alert`
   - Table: `sensors`
   - Events: **Insert** saja
   - Type: HTTP Request
   - URL: `https://<PROJECT_REF>.supabase.co/functions/v1/realtime-alert-check`
   - HTTP Headers: tambahkan `x-realtime-alert-secret: <isi sesuai REALTIME_ALERT_SECRET>`
5. Tidak perlu jadwal cron apapun — ini murni event-driven, jalan
   otomatis setiap ada INSERT baru ke `sensors`.

## Perubahan Besar: Interval Akuisisi Data Sesuai Standar WMO

Firmware device sekarang mengirim hasil **rata-rata tiap 5 menit**
langsung (BUKAN data mentah tiap 1 menit — sempat ada asumsi salah soal
ini di iterasi sebelumnya, sudah dikoreksi). Jadi web/dashboard TIDAK
perlu menghitung ulang rata-rata apapun — tinggal ambil apa adanya,
persis seperti pendekatan sebelumnya waktu interval masih 1 jam, cuma
sekarang datanya jauh lebih rapat (tiap 5 menit, bukan tiap jam).

Window 5 menit ini sudah sesuai standar WMO (rentang rata-rata 1-10
menit untuk suhu/kelembaban/curah hujan). Perhitungan cara averaging
untuk masing-masing parameter (arah angin pakai modus/vector, curah
hujan diakumulasi, dsb) jadi tanggung jawab firmware — pastikan tim
firmware sudah menerapkan itu di sisi alat.

### File yang Berubah

- `lib/config.ts` — `OFFLINE_THRESHOLD_MINUTES` diperpendek dari 90 ke
  **15 menit** (3x interval kirim baru 5 menit, kasih buffer wajar)
- `app/page.tsx`, `components/SensorCardGrid.tsx` — tetap ambil 1 baris
  terakhir apa adanya (tidak berubah logic-nya, cuma datanya lebih rapat)
- `lib/statsEngine.ts` — **paginasi diperbaiki** (kritis!): sebelumnya
  limit tetap 5000 baris. Dengan interval 5 menit, 30 hari = ~8.640
  baris/device — sudah melebihi limit lama, jadi tanpa perbaikan ini
  Analitik & Export Excel bisa kepotong diam-diam untuk rentang panjang.
- `lib/recommendationEngine.ts` — limit query curah hujan 24 jam
  dinaikkan (jaga-jaga, 288 baris/hari dengan interval 5 menit)
- `supabase/functions/weekly-report/index.ts`,
  `supabase/functions/telegram-webhook/index.ts` — paginasi diperbaiki
  (laporan mingguan/bulanan & command `/laporan` custom range bisa minta
  rentang yang totalnya melebihi limit lama)
- `supabase/functions/realtime-alert-check/index.ts` — TETAP cek 1 baris
  langsung (karena sudah representatif dari firmware), tapi ditambah
  **cooldown 30 menit** per device supaya tidak spam kalau kondisi kritis
  berlangsung lama (tanpa ini, interval kirim 5 menit bisa berarti alert
  baru tiap 5 menit terus-menerus selama kondisi masih kritis)

### Yang TIDAK Perlu Diubah

`generate-recommendation` (rekomendasi AI harian) sudah lebih dulu
dirombak jadi berbasis agregat 24 jam — otomatis tetap benar dengan
volume data yang lebih rapat, tidak perlu disentuh lagi.
