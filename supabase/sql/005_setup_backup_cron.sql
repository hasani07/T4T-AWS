-- =====================================================================
-- Setup pg_cron untuk backup-monitor. Jalankan SETELAH Edge Function
-- backup-monitor berhasil di-deploy.
-- =====================================================================
-- GANTI DULU sebelum run:
--   <PROJECT_REF>       -> project ref Anda
--   <SERVICE_ROLE_KEY>  -> service_role key Anda
-- =====================================================================

-- Dijalankan tiap 15 menit — ini yang TIDAK BISA dilakukan di Vercel
-- Cron plan gratis (maks 1x/hari), makanya backup-monitor wajib di
-- Supabase Edge Functions.
select cron.schedule(
  'backup-monitor-every-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/backup-monitor',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Cek jadwal aktif:
--   select * from cron.job;
-- Cek riwayat eksekusi:
--   select * from cron.job_run_details order by start_time desc limit 20;
