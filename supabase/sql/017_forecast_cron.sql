-- =====================================================================
-- Latih ulang model prediksi tiap malam lewat pg_cron.
-- Jalankan SETELAH 016_forecast.sql DAN setelah kode website (route
-- /api/cron/forecast-train) ter-deploy di Vercel.
--
-- MEMAKAI ULANG CRON_SECRET yang sama dengan cron BMKG (010) dan kuota
-- (014) -- salin nilai yang SAMA, tidak perlu secret baru di Vercel.
-- =====================================================================
-- GANTI DULU sebelum run:
--   <CRON_SECRET>  -> nilai environment variable CRON_SECRET di Vercel
-- =====================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'forecast-train-nightly';

-- Jadwal pg_cron memakai UTC: '20 18 * * *' = 01:20 WIB tiap malam, saat
-- data hari kemarin sudah lengkap dan tidak berebut dengan cron lain.
select cron.schedule(
  'forecast-train-nightly',
  '20 18 * * *',
  $$
  select net.http_get(
    url := 'https://atmosx.t4t.hasani.life/api/cron/forecast-train',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
    timeout_milliseconds := 55000
  );
  $$
);

-- Latih sekali sekarang juga (tidak perlu menunggu nanti malam):
select net.http_get(
  url := 'https://atmosx.t4t.hasani.life/api/cron/forecast-train',
  headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
  timeout_milliseconds := 55000
);
