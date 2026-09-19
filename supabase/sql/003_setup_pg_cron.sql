-- =====================================================================
-- Setup pg_cron: jadwalkan Edge Functions generate-recommendation &
-- weekly-report. Jalankan SETELAH kedua Edge Function berhasil di-deploy
-- (lihat supabase/functions/generate-recommendation/index.ts dan
-- supabase/functions/weekly-report/index.ts).
-- =====================================================================
-- GANTI DULU sebelum run:
--   <PROJECT_REF>       -> project ref Anda (lihat di URL dashboard atau
--                          Project Settings -> General)
--   <SERVICE_ROLE_KEY>  -> service_role key Anda (Project Settings -> API)
-- =====================================================================

-- Aktifkan extension yang dibutuhkan (aman dijalankan berkali-kali)
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Jadwal: generate rekomendasi AI tiap hari jam 06:00 WIB (= 23:00 UTC)
select cron.schedule(
  'generate-recommendation-daily',
  '0 23 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/generate-recommendation',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Jadwal: cek & kirim laporan mingguan tiap hari jam 06:05 WIB (= 23:05 UTC)
-- (function-nya sendiri yang menentukan apakah SUDAH WAKTUNYA kirim,
-- berdasarkan interval_days_config di tabel settings)
select cron.schedule(
  'weekly-report-check-daily',
  '5 23 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/weekly-report',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- =====================================================================
-- Cara cek jadwal yang aktif:
--   select * from cron.job;
--
-- Cara lihat riwayat eksekusi:
--   select * from cron.job_run_details order by start_time desc limit 20;
--
-- Cara hapus/batalkan jadwal (kalau perlu revisi):
--   select cron.unschedule('generate-recommendation-daily');
--   select cron.unschedule('weekly-report-check-daily');
-- =====================================================================
