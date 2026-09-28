-- =====================================================================
-- Jadwalkan pencatatan BMKG tiap 5 menit lewat pg_cron.
-- Jalankan SETELAH 009_bmkg_snapshots.sql dan 011_bmkg_releases.sql, DAN
-- setelah kode website (route /api/cron/bmkg-snapshot) ter-deploy di Vercel.
-- (Urutan jalan: 009 -> 011 -> deploy -> 010.)
-- =====================================================================
-- GANTI DULU sebelum run:
--   <CRON_SECRET>  -> nilai environment variable CRON_SECRET di Vercel.
--                     Kalau lupa nilainya (Vercel tidak menampilkan ulang
--                     Secret), buat yang baru: isi string acak panjang di
--                     Vercel (hapus & buat ulang CRON_SECRET), REDEPLOY,
--                     lalu pakai string yang sama di sini.
-- Alamat website di bawah sudah diisi sesuai domain dashboard Anda;
-- ganti kalau domainnya berubah.
-- =====================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Bersihkan jadwal lama kalau ada (versi 30 menit dari panduan sebelumnya,
-- atau menjalankan file ini dua kali). Aman: kalau tidak ada, tidak terjadi apa-apa.
select cron.unschedule(jobid)
from cron.job
where jobname in ('bmkg-snapshot-every-30-min', 'bmkg-snapshot-every-5-min');

-- Tiap 5 menit. BMKG cuma merilis ~2x sehari, jadi 5 menit sudah cukup untuk
-- mendeteksi rilis baru dengan ketelitian ±5 menit, dan tiap slot 3 jam
-- tercatat sebelum lewat. Hanya 2 request ke BMKG tiap kali jalan (~576/hari).
select cron.schedule(
  'bmkg-snapshot-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://atmosx.t4t.hasani.life/api/cron/bmkg-snapshot',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
    timeout_milliseconds := 20000
  );
  $$
);

-- Cek jadwal aktif:
--   select jobid, jobname, schedule from cron.job where jobname like 'bmkg-snapshot%';
-- Cek hasil panggilan terakhir (kode 200 = sukses, 401 = CRON_SECRET salah):
--   select id, status_code, content, created
--   from net._http_response order by created desc limit 5;
-- Coba jalankan sekarang tanpa menunggu 5 menit:
--   select net.http_get(
--     url := 'https://atmosx.t4t.hasani.life/api/cron/bmkg-snapshot',
--     headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
--     timeout_milliseconds := 20000);
-- Hapus jadwal (kalau perlu revisi):
--   select cron.unschedule('bmkg-snapshot-every-5-min');
