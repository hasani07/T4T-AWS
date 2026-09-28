-- =====================================================================
-- Catatan rilis prakiraan BMKG (bmkg_releases): satu baris tiap kali BMKG
-- merilis prakiraan baru (field analysis_date berganti), beserta kapan
-- sistem kita PERTAMA kali melihatnya di API (first_seen_at).
--
-- Dipakai halaman /bmkg untuk menampilkan "Terdeteksi di API" dan jeda dari
-- waktu rilis. Diisi HANYA oleh route /api/cron/bmkg-snapshot (server,
-- service_role), jadi tidak ada policy insert/update untuk anon.
-- Jumlah baris kecil: sekitar 2 per hari per device.
--
-- * Hanya membuat objek BARU; tidak mengubah tabel yang sudah ada.
-- * Aman dijalankan berulang.
-- Jalankan di Supabase -> SQL Editor (SEBELUM 010_bmkg_snapshot_cron.sql)
-- =====================================================================

create table if not exists public.bmkg_releases (
  id            bigint generated always as identity primary key,
  device_id     integer not null,
  adm4          text,                                 -- kode wilayah saat rilis ini terlihat
  analysis_utc  timestamptz not null,                 -- waktu BMKG memproduksi prakiraan (UTC yang benar)
  first_seen_at timestamptz not null default now(),   -- kapan kita pertama melihatnya di API (UTC yang benar)
  -- true = rilis PERTAMA yang kita lihat sejak pemantauan dimulai. Rilis itu
  -- mungkin sudah ada di API jauh sebelumnya, jadi first_seen_at cuma batas
  -- paling lambat, bukan jam sebenarnya muncul.
  is_baseline   boolean not null default false,
  unique (device_id, analysis_utc)
);

create index if not exists bmkg_releases_device_analysis_idx
  on public.bmkg_releases (device_id, analysis_utc desc);

alter table public.bmkg_releases enable row level security;

drop policy if exists "dashboard boleh baca rilis bmkg" on public.bmkg_releases;
create policy "dashboard boleh baca rilis bmkg"
  on public.bmkg_releases for select to anon
  using (true);

grant select on public.bmkg_releases to anon, authenticated;

-- Cek setelah pencatatan berjalan (jeda = seberapa lama sejak dirilis sampai
-- muncul di API; baris is_baseline diabaikan karena jamnya hanya batas lambat):
--   select device_id,
--          analysis_utc  at time zone 'Asia/Jakarta' as dirilis_wib,
--          first_seen_at at time zone 'Asia/Jakarta' as terdeteksi_wib,
--          first_seen_at - analysis_utc              as jeda,
--          is_baseline
--   from public.bmkg_releases order by first_seen_at desc limit 20;
