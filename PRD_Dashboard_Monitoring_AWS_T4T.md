# Product Requirements Document (PRD)
## Dashboard Monitoring Mikroklimat — AWS T4T

**Versi:** 1.0
**Tanggal:** 19 September 2026
**Status:** Draft — menunggu konfirmasi item pada bagian "Open Questions"

---

## 1. Latar Belakang & Tujuan

Proyek ini membangun dashboard web untuk memonitor kondisi mikroklimat persemaian/lapangan secara real-time dari 2 unit Automatic Weather Station (AWS), memberikan analitik historis, rekomendasi tindakan berbasis AI (mengacu pada materi "Strategi Cerdas Membaca Cuaca" — Workshop T4T: Manajemen Persemaian), serta laporan otomatis ke Telegram dan mekanisme backup database yang aman.

**Tujuan utama:**
1. Memberi visibilitas kondisi cuaca mikro secara real-time.
2. Membantu pengambilan keputusan operasional (naungan, irigasi, windbreak) berbasis data + rule ilmiah.
3. Mengotomatiskan pelaporan dan mitigasi risiko kehilangan data (backup).

---

## 2. Stakeholder

| Peran | Kebutuhan |
|---|---|
| Pengelola persemaian/lapangan (user utama) | Melihat kondisi terkini, rekomendasi tindakan, laporan mingguan |
| Admin sistem | Mengatur jadwal generate, memantau kapasitas database, download backup |

---

## 3. Arsitektur Sistem

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│  2x Device AWS   │────▶│  Supabase         │────▶│  Dashboard Web  │
│  (Suhu, RH,      │     │  (Postgres +      │     │  (Next.js di    │
│   Wind Dir/Speed,│     │   Realtime +      │     │   Vercel)       │
│   Signal RSSI)   │     │   Storage)        │     │                 │
└─────────────────┘     └────────┬─────────┘     └────────┬────────┘
                                  │                         │
                         ┌────────▼─────────┐      ┌────────▼────────┐
                         │ Supabase Edge     │      │  Groq API        │
                         │ Functions +       │─────▶│  (AI Recommend)  │
                         │ pg_cron (jadwal)  │      └──────────────────┘
                         └────────┬─────────┘
                                  │
                         ┌────────▼─────────┐
                         │  Telegram Bot API │
                         │  (1 channel)      │
                         └───────────────────┘
```

**Stack:**
- **Frontend/Dashboard:** Next.js (framework bebas ditentukan tim, Next.js jadi default rekomendasi karena native support di Vercel) — repo: **AWS T4T** di GitHub.
- **Database & Realtime:** Supabase (Postgres, Realtime subscription, Storage untuk backup).
- **Scheduler/Cron:** Supabase Edge Functions + `pg_cron` (**bukan Vercel Cron**, karena kebutuhan interval 30 menit tidak didukung Vercel Hobby plan).
- **AI Recommendation Engine:** Groq API, dengan konteks rule/knowledge base dari materi pelatihan (lihat Bagian 7).
- **Notifikasi & Laporan:** Telegram Bot API (1 channel).
- **Hosting:** Vercel (deploy langsung dari GitHub repo).

---

## 4. Prinsip Integrasi: Non-Destructive / Read-Only terhadap Data Existing

**Pipeline device → Supabase yang sedang berjalan saat ini TIDAK BOLEH diubah.** Ini prinsip mengikat untuk seluruh pengembangan dashboard:

- Dashboard & backend baru **hanya membaca (read-only)** dari tabel sensor yang sudah ada dan sudah berjalan menerima data dari alat.
- **Tidak ada** `ALTER TABLE`, rename kolom, ubah tipe data, atau perubahan apapun pada tabel/struktur yang dipakai firmware device untuk menulis data.
- Kebutuhan komputasi tambahan (status online/offline, agregasi, dsb.) diimplementasikan lewat:
  1. **SQL View** yang membaca dari tabel asli tanpa memodifikasinya, atau
  2. **Tabel baru terpisah** khusus untuk fitur baru (`ai_recommendations`, `weekly_reports`, `backup_logs`, `settings`) yang tidak berkaitan/tidak bersinggungan dengan tabel sensor asli, atau
  3. Logic di layer aplikasi (dihitung saat query/tampil, tanpa menulis balik ke tabel sumber).
- Direkomendasikan menggunakan **Supabase API key/role dengan akses read-only** khusus untuk dashboard terhadap tabel sensor, sebagai lapisan pengaman tambahan agar tidak ada operasi tulis yang tidak disengaja ke data alat.
- Skema pada Bagian 5 di bawah ini bersifat **draf/asumsi** dan perlu disesuaikan dengan struktur tabel real yang sudah berjalan (nama tabel & kolom aktual) sebelum development dimulai.

---

## 5. Data Model (Supabase) — Struktur Real (Existing, Read-Only)

> Skema di bawah ini adalah **struktur tabel yang sudah berjalan** di Supabase (bukan draf/usulan). Tabel `devices`, `sensors`, dan `system_logs` **tidak diubah** — hanya dibaca. Tabel baru untuk fitur (AI recommendation, weekly report, backup log, settings) dibuat terpisah di Bagian 5.4.

### 5.1 `devices` (existing)
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | int8 (PK) | |
| type | text | Nama lokasi/site device — **dikonfirmasi**: `CISANGKUY` dan `CIMINYAK` adalah 2 lokasi berbeda |

> Tidak ada kolom `last_seen`/`status`. Status online/offline **dihitung** dari `sensors.created_at` terbaru per `device_id` (lihat Bagian 6), bukan disimpan sebagai kolom di tabel ini.

### 5.2 `sensors` (existing)
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | int8 (PK) | |
| device_id | int8 (FK → devices.id) | |
| temperature | float4 | °C |
| humidity | float4 | % |
| wind_speed | float4 | Satuan perlu dikonfirmasi (m/s atau km/h) |
| wind_direction | **text** | Kategori kompas (N, NE, E, SE, S, SW, W, NW) + **"U"** — **dikonfirmasi**: nilai ini memang muncul sebagai hasil pembacaan device, diperlakukan sebagai "Calm/Tidak Terdeteksi" |
| rainfall | float4 | Curah hujan — **sensor ke-5**, belum tercakup di draf PRD sebelumnya, perlu ditambahkan ke seluruh fitur (kartu dashboard, analitik, download CSV, dan sebagai pertimbangan tambahan di AI recommendation terkait timing tanam sesuai materi PPT) |
| created_at | timestamptz | |
| ~~signal_strength~~ | *(direncanakan)* | Kolom baru akan ditambahkan (lihat Bagian 13, poin 8) — nullable, `ADD COLUMN`, tidak mengubah data existing, menunggu update firmware untuk mulai mengirim nilainya |

**✅ Dikonfirmasi soal pola pengiriman data:**
- **Interval normal device: 1 jam sekali.** Gap ~2 hari yang teramati di data sample **bukan** kondisi normal — itu terjadi karena alat mati/restart saat itu (down-time), bukan representasi pola kirim yang seharusnya.
- **Dampak ke desain**: threshold offline **direvisi dari 5 menit menjadi 90 menit** (1.5× interval normal, memberi buffer keterlambatan wajar sebelum device ditandai offline). Nilai ini disimpan di `settings.offline_threshold_minutes` dan dapat diubah dari dashboard.
- Baris dengan interval sangat rapat (~10–30 detik) dan nilai di luar batas wajar pada sample data (suhu 75.6°C, wind_speed 403, dsb.) kemungkinan terjadi **saat device baru menyala kembali setelah restart** (bisa jadi bagian dari proses inisialisasi/kalibrasi ulang sensor) — perlu tetap difilter dengan sanity-check range di layer aplikasi (lihat validasi di bawah) agar tidak mencemari analitik & AI recommendation.

**⚠️ Observasi data yang masih perlu perhatian:**
- Perlu validasi/sanity-check range nilai (mis. suhu wajar 15–45°C, RH 0–100%) di layer aplikasi untuk memfilter/menandai baris yang kemungkinan glitch sensor/masa transisi restart (seperti baris dengan wind_speed=403) agar tidak mencemari analitik & AI recommendation.

### 5.3 `system_logs` (existing)
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | int8 (PK) | |
| device_id | int8 (FK → devices.id) | |
| free_heap | int (approx.) | Diagnostik memori device (khas board ESP32-style) |
| largest_free_block | int8 | |
| min_free_heap | int (approx.) | |
| reset_reason | text | Alasan device restart |
| created_at | timestamptz | |
| ~~signal_strength~~ | *(direncanakan)* | **Dikonfirmasi**: kolom baru untuk RSSI/kekuatan sinyal ditambahkan di tabel ini (bukan di `sensors`), sesuai rekomendasi — penambahan bersifat non-destruktif (`ADD COLUMN` nullable), tidak memengaruhi sistem yang sedang berjalan. Menunggu update firmware untuk mulai mengirim nilainya. |

> **Di luar scope v1**: pemanfaatan `free_heap`/`reset_reason` untuk fitur device health monitoring **dilewati dulu** — bisa jadi fitur fase berikutnya.

### 5.4 Tabel Baru (Fitur, terpisah dari data existing)
Tabel-tabel berikut **baru dibuat untuk fitur dashboard**, tidak bersinggungan dengan `devices`/`sensors`/`system_logs`.

#### `ai_recommendations`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid (PK) | |
| generated_at | timestamptz | |
| trigger_type | text | `manual` / `scheduled` |
| period_covered | tstzrange | Data yang dipakai sebagai input |
| input_summary | jsonb | Snapshot data + VPD + status risiko saat generate |
| recommendation_text | text | Output dari Groq |

#### `weekly_reports`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid (PK) | |
| generated_at | timestamptz | |
| trigger_type | text | `manual` / `scheduled` |
| period_start / period_end | date | |
| interval_days_config | int | Interval yang diatur user (default 7) |
| telegram_message_id | text | Referensi pesan terkirim |
| status | text | `sent` / `failed` |

#### `backup_logs`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid (PK) | |
| created_at | timestamptz | |
| storage_path | text | Lokasi file di Supabase Storage |
| db_size_at_backup | numeric | % kapasitas saat trigger |
| retention_expires_at | timestamptz | `created_at + 60 hari` |
| downloaded | boolean | default false |
| downloaded_at | timestamptz (nullable) | |

#### `settings`
| Kolom | Tipe | Keterangan |
|---|---|---|
| key | text (PK) | mis. `offline_threshold_minutes`, `weekly_report_interval_days`, `calm_wind_threshold_ms` |
| value | jsonb | |

---

## 6. Fitur — Dashboard Utama (Kartu Sensor & Status)

- Kartu real-time per device (via Supabase Realtime subscription pada tabel `sensors`, bukan polling), untuk device `CISANGKUY` dan `CIMINYAK`:
  - Suhu (°C), Kelembaban (%), Kecepatan Angin, Arah Angin (kompas — tampilkan **"Tidak Terdeteksi/Calm"** jika nilainya `"U"`), **Curah Hujan** (mm)
  - Status **Online/Offline** — dihitung dari `sensors.created_at` terbaru per `device_id` (bukan kolom tersimpan). Offline jika tidak ada data baru **> 90 menit** (default, dapat diubah di `settings.offline_threshold_minutes`), disesuaikan dari interval normal kirim data 1 jam sekali.
  - **Kekuatan sinyal internet** — *direncanakan*, akan diambil dari kolom baru di `system_logs` (`signal_strength`), menunggu update firmware. Sampai saat itu, kartu menampilkan "Data belum tersedia" untuk metrik ini.
- Update kartu mengikuti kecepatan data masuk ke Supabase (event-driven) — dengan interval normal 1 jam, kartu akan ter-update setiap kali data jam berikutnya masuk.
- **Tidak ada login/autentikasi** — dashboard untuk pemakaian internal, akses terbuka.

---

## 7. Fitur — Analitik & Perbandingan Periode

- Filter periode: 7 hari terakhir, 1 bulan terakhir, custom range (date picker dari–sampai).
- Perbandingan otomatis terhadap **periode sebelumnya dengan durasi sama** (mis. minggu ini vs minggu lalu) → ditampilkan sebagai delta/persentase per parameter.
- Statistik per parameter (suhu, RH, kecepatan angin, curah hujan): rata-rata, min, max, tren grafik (line chart).
- Arah angin dominan dihitung **hanya dari data yang bukan `"U"`** (lihat Bagian 9.4). Karena `wind_direction` tersimpan sebagai kategori kompas (bukan derajat), perhitungan "dominan" dilakukan lewat **modus/frekuensi** kategori, bukan circular mean numerik.
- Sebaiknya ada filter/flag untuk **mengecualikan baris dengan nilai di luar rentang wajar** (lihat catatan data quality di Bagian 5.2) dari perhitungan statistik, supaya tidak bias oleh glitch sensor.

---

## 8. Fitur — Download Data Sensor

- Pilih rentang tanggal → export **CSV**.
- Kolom: `created_at, device_id, device_type, temperature, humidity, wind_speed, wind_direction, rainfall`.

---

## 9. Fitur — AI Recommendation (Groq)

### 9.1 Knowledge Base (diringkas dari materi Workshop T4T)

**Ambang batas per parameter:**

| Parameter | Kondisi Aman | Waspada | Kritis |
|---|---|---|---|
| Suhu | 28–32°C | >32–35°C | >33–35°C (siang tropis) |
| RH | 60–80% (ideal) | <50–60% | <50% + suhu tinggi |
| Kecepatan Angin (**m/s**) | Lemah–sedang | Sedang | Sedang–kuat |

> Satuan `wind_speed` **dikonfirmasi: m/s**. Ambang batas numerik kecepatan angin per kelas (lemah/sedang/kuat) belum didefinisikan angka pastinya di materi PPT — disarankan memakai skala umum meteorologi (Beaufort disederhanakan), misal: Lemah <3 m/s, Sedang 3–8 m/s, Kuat >8 m/s, dan ini bisa disesuaikan lagi setelah observasi data lapangan lebih banyak.

**Kombinasi risiko:**
- **Risiko sedang**: Suhu 28–32°C, RH 60–75%, angin lemah–sedang → status "cukup baik"; tindakan: pantau media & gejala layu sore hari.
- **Risiko kritis**: Suhu siang >33–35°C, RH <50–60%, angin sedang–kuat → media kering cepat, bibit layu, mortalitas naik; tindakan: pasang naungan/paranet, kurangi paparan angin kering, perketat jadwal irigasi.

**Arah angin dominan** menentukan sisi mana perlu dipasang windbreak (angin dari area terbuka/kering = risiko tinggi terhadap pengeringan; dari area bervegetasi = risiko rendah). **Diabaikan saat kategori `"U"` (calm/tidak terdeteksi).**

**Curah hujan** — dipakai sebagai konteks tambahan (belum ada di materi PPT sebagai parameter utama, tapi relevan dengan panduan "jadwalkan tanam di awal musim hujan" & "hindari musim kering dengan curah hujan rendah"): curah hujan tinggi dalam periode terakhir bisa menurunkan urgensi irigasi tambahan meski suhu/RH menunjukkan status waspada.

**Perhitungan VPD (Vapor Pressure Deficit)** — dihitung otomatis oleh sistem dari data suhu & RH:
```
es = 0.6108 × exp(17.27 × T / (T + 237.3))     // Tekanan uap jenuh
ea = es × RH / 100                              // Tekanan uap aktual
VPD = es − ea
```
Kelas VPD: **< 0.8 kPa** = rendah (lembap, transpirasi rendah) · **0.8–1.5 kPa** = sedang (seimbang) · **> 1.5 kPa** = tinggi (kering, risiko stres air).

**Aturan praktis Evapotranspirasi (ET):** kombinasi Panas + Kering + Berangin = proksi "hari ber-ETo tinggi" → indikasi kebutuhan penyiraman ekstra, tanpa perlu hitung ETo matematis harian.

### 9.2 Alur Teknis
1. Sistem ambil data sensor terbaru (real-time / rentang 24 jam untuk mode otomatis), dengan filter sanity-check nilai wajar (lihat Bagian 5.2).
2. Hitung VPD & klasifikasi risiko (rule-based, dilakukan di backend/Edge Function — bukan oleh LLM, supaya konsisten & tidak halusinasi angka).
3. Kirim ke Groq: data mentah (termasuk curah hujan) + hasil kalkulasi VPD + status klasifikasi risiko + ringkasan knowledge base di atas sebagai system prompt.
4. Groq mengembalikan rekomendasi tindakan dalam bahasa natural (actionable), disimpan ke tabel `ai_recommendations`.

### 9.3 Trigger
- **Manual**: tombol "Generate Rekomendasi" di dashboard, kapan saja, pakai data real-time terbaru.
- **Otomatis (terjadwal)**: setiap **pagi ±06:00 WIB**, menggunakan data 24 jam terakhir — dipilih pagi supaya rekomendasi bisa langsung dieksekusi di hari yang sama (siram, pasang naungan, dsb).

### 9.4 Penanganan Kondisi "Calm" (Tidak Ada Angin)
- Anemometer dan wind vane adalah sensor terpisah secara fisik: anemometer berhenti berputar saat tidak ada angin (speed = 0, valid), sedangkan wind vane pasif mengikuti dorongan angin — saat calm, posisinya diam di posisi terakhir (bukan indikasi arah sebenarnya).
- **Dikonfirmasi**: kategori `"U"` pada kolom `wind_direction` memang muncul sebagai hasil pembacaan device dan diperlakukan sebagai **"Calm/Tidak Terdeteksi"**. Sistem menampilkan `"U"` sebagai "Calm/Tidak Terdeteksi" di UI, dan **exclude** dari perhitungan arah dominan & logic rekomendasi terkait windbreak — tanpa perlu logic threshold tambahan (`calm_wind_threshold`) di layer dashboard, karena penentuan calm sudah dilakukan di sisi device/ingestion.

---

## 10. Fitur — Laporan Mingguan Otomatis (Telegram)

- Isi laporan: ringkasan teks statistik periode + grafik (chart di-render sebagai image) + rekomendasi/keputusan dari AI untuk periode tersebut.
- Channel: **1 channel Telegram** (via Telegram Bot API — `sendPhoto`/`sendMediaGroup` + caption teks). Bot & channel akan disiapkan **paralel** saat development berjalan (bukan blocker untuk mulai coding).
- **Pendekatan render grafik**: karena Supabase Edge Functions berjalan di runtime Deno (bukan Node.js), library canvas/chart native seperti `chartjs-node-canvas` sulit dipakai langsung. Direkomendasikan pakai **QuickChart.io API** (layanan generate chart image dari konfigurasi Chart.js via HTTP request) — Edge Function tinggal `fetch()` dengan config chart, dapat URL/binary image PNG, lalu kirim ke Telegram. Alternatif kalau tidak mau bergantung ke layanan pihak ketiga: pindahkan proses render grafik ke Vercel (Node.js runtime) sebagai API route terpisah yang dipanggil dari Edge Function.
- Trigger:
  - **Manual**: tombol di dashboard, generate kapan saja.
  - **Otomatis**: interval dapat diatur user dari dashboard (disimpan di `settings.weekly_report_interval_days`, default 7 hari), dijalankan via `pg_cron`.

---

## 11. Fitur — Backup Otomatis & Notifikasi Telegram

- **Trigger backup**: otomatis saat kapasitas database mencapai **50%** dari kuota → snapshot disimpan ke Supabase Storage, dicatat di `backup_logs`.
  - **Cara cek kapasitas**: dihitung dinamis terhadap limit plan Supabase yang aktif saat itu (query ukuran database aktual vs. limit project), bukan angka hardcoded — supaya kalau plan/kuota berubah di kemudian hari, logic tidak perlu diubah manual.
- **Retensi**: file backup disimpan **60 hari**.
- **Notifikasi (via Telegram, bukan in-app):**
  - Kondisi normal (hari 1–59 sejak backup dibuat): minimal **1x/hari** reminder untuk download.
  - **H-1** menjelang batas 60 hari: frekuensi naik jadi **setiap 30 menit**.
  - Begitu `backup_logs.downloaded = true` (user klik download di dashboard) → seluruh notifikasi untuk file tersebut **berhenti**.
- Dijalankan via Supabase Edge Function + `pg_cron` (cek tiap interval pendek, mis. tiap 15–30 menit, untuk evaluasi kondisi H-1).

---

## 12. Non-Functional Requirements

- **Realtime latency**: update kartu sensor idealnya < beberapa detik dari data masuk (pakai Supabase Realtime, bukan polling).
- **Scheduler reliability**: semua cron job (rekomendasi harian, laporan mingguan, cek backup) dijalankan lewat Supabase Edge Functions + `pg_cron`, bukan Vercel Cron (karena keterbatasan interval di plan gratis).
- **Data integrity**: kalkulasi VPD & klasifikasi risiko dilakukan di backend (deterministik), Groq hanya menyusun narasi rekomendasi — bukan menghitung ulang angka.

---

## 13. Status Open Questions — Semua Terjawab ✅

Seluruh item pertanyaan sudah dikonfirmasi. Ringkasan keputusan final:

1. **Chart rendering**: pakai QuickChart.io API (lihat Bagian 10).
2. **Kuota Supabase**: dihitung dinamis dari limit plan aktif, tidak hardcode angka (lihat Bagian 11).
3. **Auth/login**: **tidak perlu** — dashboard untuk penggunaan internal, akses terbuka.
4. **Telegram bot & channel**: disiapkan paralel selama development, bukan blocker mulai coding.
5. **Satuan wind_speed**: **m/s** (dikonfirmasi).
6. **Pemanfaatan `system_logs` untuk device health monitoring**: dilewati untuk v1, jadi kandidat fase berikutnya.
7. **Penempatan kolom `signal_strength`**: di tabel `system_logs`, dengan syarat penambahan tidak mengganggu sistem yang sedang berjalan (non-destructive `ADD COLUMN`).
8. **Threshold offline 90 menit**: diterima sebagai default v1.

Tidak ada lagi item blocking untuk mulai development.

---

## 14. Ringkasan Keputusan yang Sudah Dikonfirmasi

| Item | Keputusan |
|---|---|
| Jumlah device | 2 — mewakili 2 lokasi (`CISANGKUY`, `CIMINYAK`) |
| Sensor (existing) | Suhu, Kelembaban (RH), Kecepatan Angin (m/s), Arah Angin (kategori kompas, termasuk `"U"` = calm), **Curah Hujan** |
| Signal Strength | Kolom baru di `system_logs`, non-destruktif, menunggu update firmware |
| Threshold offline | **90 menit** (final) |
| Auth/Login | **Tidak diperlukan** — internal only |
| Update kartu | Real-time mengikuti data Supabase |
| Analitik | 7 hari / 1 bulan / custom range + perbandingan periode sebelumnya |
| Format download | CSV |
| AI Engine | Groq, dengan knowledge base dari materi Workshop T4T + curah hujan sebagai konteks tambahan |
| Generate rekomendasi otomatis | Pagi (±06:00) |
| Laporan mingguan | Teks + grafik (QuickChart.io) + rekomendasi AI, 1 channel Telegram, interval dapat diatur |
| Notifikasi backup | Telegram saja, normal 1x/hari → H-1 tiap 30 menit → stop setelah download; kapasitas dihitung dinamis dari limit plan aktif |
| Scheduler | Supabase Edge Functions + pg_cron (bukan Vercel Cron) |
| Repo & hosting | GitHub (nama: AWS T4T) + Vercel |
| Framework | Bebas (rekomendasi: Next.js) |
| Sumber data sensor | **Tidak diubah** — tabel `devices`, `sensors`, `system_logs` yang sudah berjalan bersifat read-only; sistem hanya konsumsi data apa adanya |
| Out of scope v1 | Device health monitoring dari `system_logs` (heap/reset_reason) |

**PRD status: FINAL — siap masuk fase development.**
