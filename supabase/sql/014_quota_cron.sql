-- =====================================================================
-- Jadwalkan pengecekan pengingat kuota tiap jam lewat pg_cron.
-- Jalankan SETELAH 013_device_quota.sql, DAN setelah kode website
-- (route /api/cron/quota-check) ter-deploy di Vercel.
--
-- MEMAKAI ULANG CRON_SECRET yang sama dengan pengingat BMKG (010).
-- Kalau Anda sudah mengisi <CRON_SECRET> di file 010 sebelumnya, salin
-- nilai yang SAMA ke sini — tidak perlu membuat secret baru di Vercel.
-- =====================================================================
-- GANTI DULU sebelum run:
--   <CRON_SECRET>  -> nilai environment variable CRON_SECRET di Vercel
--                     (yang sama dipakai untuk /api/cron/bmkg-snapshot).
-- =====================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'quota-check-hourly';

-- Tiap jam, di menit ke-10 (bukan menit ke-0) supaya tidak berebut slot
-- yang sama persis dengan cron BMKG yang jalan tiap 5 menit dari menit ke-0.
select cron.schedule(
  'quota-check-hourly',
  '10 * * * *',
  $$
  select net.http_get(
    url := 'https://atmosx.t4t.hasani.life/api/cron/quota-check',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
    timeout_milliseconds := 20000
  );
  $$
);

-- Cek jadwal aktif:
--   select jobid, jobname, schedule from cron.job where jobname = 'quota-check-hourly';
-- Cek hasil panggilan terakhir (kode 200 = sukses, 401 = CRON_SECRET salah):
--   select id, status_code, content, created
--   from net._http_response order by created desc limit 5;
-- Coba jalankan sekarang tanpa menunggu jadwal:
--   select net.http_get(
--     url := 'https://atmosx.t4t.hasani.life/api/cron/quota-check',
--     headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
--     timeout_milliseconds := 20000);
-- Hapus jadwal (kalau perlu revisi):
--   select cron.unschedule('quota-check-hourly');
