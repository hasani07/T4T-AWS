-- =====================================================================
-- Riwayat prakiraan BMKG (bmkg_snapshots) + fungsi ekspor perbandingan
-- sensor vs BMKG (bmkg_compare_export) untuk fitur "Unduh data" di /bmkg.
--
-- KENAPA PERLU: API BMKG hanya memberi prakiraan ke depan (per 3 jam,
-- ~3 hari), TANPA riwayat. Supaya bisa diunduh untuk 24 jam / 7 hari /
-- 1 bulan terakhir, prakiraan tiap slot dicatat sendiri secara berkala
-- oleh route /api/cron/bmkg-snapshot tiap 5 menit (jadwalnya: 010_bmkg_snapshot_cron.sql).
-- Riwayat baru mulai terkumpul SEJAK pencatatan aktif; slot sebelum itu
-- akan kosong di kolom BMKG (data sensor tetap lengkap).
--
-- * Hanya membuat objek BARU. TIDAK mengubah tabel `sensors`, `devices`,
--   atau tabel lain yang sudah ada.
-- * Aman dijalankan berulang.
-- Jalankan di Supabase -> SQL Editor
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Tabel snapshot: satu baris per (device, slot 3 jam).
--    Diisi HANYA oleh server (service_role, melewati RLS), jadi sengaja
--    tidak ada policy insert/update untuk anon.
-- ---------------------------------------------------------------------
create table if not exists public.bmkg_snapshots (
  id              bigint generated always as identity primary key,
  device_id       integer not null,
  adm4            text,                    -- kode wilayah saat dicatat (bisa berubah kalau diganti di /bmkg)
  slot_utc        timestamptz not null,    -- jam SLOT yang diprakirakan (UTC yang benar)
  slot_local      timestamp not null,      -- jam lokal BMKG untuk slot itu (WIB), tanpa zona
  analysis_utc    timestamptz,             -- kapan BMKG memproduksi prakiraan ini ("update terakhir BMKG")
  temperature     numeric,                 -- °C
  humidity        numeric,                 -- %
  wind_speed_ms   numeric,                 -- m/s (sudah dikonversi dari km/jam)
  wind_direction  text,                    -- arah angin "dari" (N, NE, ...)
  weather_desc    text,
  cloud_cover_pct numeric,
  -- Catatan: berbeda dari sensors.created_at, kolom ini memakai UTC yang
  -- BENAR (diisi server kita, bukan device), jadi TIDAK kena kekhasan
  -- "angka WIB berlabel UTC".
  captured_at     timestamptz not null default now(),
  unique (device_id, slot_utc)
);

create index if not exists bmkg_snapshots_device_slot_idx
  on public.bmkg_snapshots (device_id, slot_local);

alter table public.bmkg_snapshots enable row level security;

drop policy if exists "dashboard boleh baca snapshot bmkg" on public.bmkg_snapshots;
create policy "dashboard boleh baca snapshot bmkg"
  on public.bmkg_snapshots for select to anon
  using (true);

grant select on public.bmkg_snapshots to anon, authenticated;


-- ---------------------------------------------------------------------
-- 2) Fungsi ekspor: satu baris per slot 3 jam antara p_start dan p_end.
--
--    p_start / p_end = JAM DINDING WIB tanpa zona (tipe `timestamp`).
--
--    Kolom sensor_* = rata-rata pembacaan sensor dalam ±30 menit dari jam
--    slot. Baris glitch di luar rentang wajar dikecualikan dari rata-rata
--    (sama dengan SANITY_RANGES di lib/config.ts: suhu 10-45, RH 0-100,
--    angin 0-40 m/s). sensor_wind_dir = arah yang paling sering muncul
--    (kondisi "U"/calm diabaikan). sensor_samples = jumlah pembacaan mentah
--    dalam jendela itu.
--    Kolom bmkg_* dari bmkg_snapshots; NULL kalau slot itu belum tercatat.
--
--    Kekhasan sensors.created_at (angka sudah WIB tapi berlabel UTC):
--    `created_at at time zone 'UTC'` sengaja dipakai untuk mengambil
--    angka jam dindingnya apa adanya (= jam WIB), lalu dibandingkan dengan
--    jam slot WIB. Jadi tidak ada penggeseran +/-7 jam di sini.
--
--    Sekali lewat tabel sensors (bukan satu subquery per slot), jadi tetap
--    cepat untuk 30 hari data tanpa perlu menambah index baru di `sensors`.
--    Catatan: slot digenerate tiap 3 jam dari 00:00 WIB, cocok dengan slot
--    BMKG untuk wilayah WIB (kedua device Anda). Kalau suatu saat ada
--    wilayah WITA/WIT, jamnya tidak jatuh di kelipatan 3 -> kolom BMKG kosong.
-- ---------------------------------------------------------------------
create or replace function public.bmkg_compare_export(
  p_device_id integer,
  p_start     timestamp,
  p_end       timestamp
)
returns table (
  slot_local         timestamp,
  bmkg_temperature   numeric,
  bmkg_humidity      numeric,
  bmkg_wind_ms       numeric,
  bmkg_wind_dir      text,
  bmkg_weather       text,
  bmkg_cloud_pct     numeric,
  bmkg_analysis_utc  timestamptz,
  bmkg_adm4          text,
  sensor_temperature numeric,
  sensor_humidity    numeric,
  sensor_wind_ms     numeric,
  sensor_wind_dir    text,
  sensor_samples     integer
)
language sql
stable
as $$
  with grid as (
    select g.slot
    from generate_series(date_trunc('day', p_start), p_end, interval '3 hours') as g(slot)
    where g.slot >= p_start and g.slot <= p_end
  ),
  readings as (
    select
      (s.created_at at time zone 'UTC') as t,
      s.temperature,
      s.humidity,
      s.wind_speed,
      s.wind_direction
    from public.sensors s
    where s.device_id = p_device_id
      and s.created_at >= ((p_start - interval '30 minutes') at time zone 'UTC')
      and s.created_at <  ((p_end   + interval '30 minutes') at time zone 'UTC')
  ),
  bucketed as (
    -- slot 3 jam terdekat untuk tiap pembacaan
    select
      r.*,
      date_trunc('day', r.t)
        + interval '3 hours'
        * round(extract(epoch from (r.t - date_trunc('day', r.t))) / 10800.0)::float8 as slot
    from readings r
  ),
  agg as (
    select
      b.slot,
      avg(b.temperature) filter (where b.temperature between 10 and 45)  as avg_t,
      avg(b.humidity)    filter (where b.humidity    between 0  and 100) as avg_h,
      avg(b.wind_speed)  filter (where b.wind_speed  between 0  and 40)  as avg_w,
      mode() within group (order by b.wind_direction::text)
        filter (where b.wind_direction::text <> 'U')                     as dir,
      count(*)::integer                                                  as n
    from bucketed b
    where abs(extract(epoch from (b.t - b.slot))) <= 1800   -- hanya yang dalam ±30 menit dari slot
    group by b.slot
  )
  select
    gr.slot,
    bm.temperature,
    bm.humidity,
    bm.wind_speed_ms,
    bm.wind_direction,
    bm.weather_desc,
    bm.cloud_cover_pct,
    bm.analysis_utc,
    bm.adm4,
    round(ag.avg_t::numeric, 2),
    round(ag.avg_h::numeric, 2),
    round(ag.avg_w::numeric, 2),
    ag.dir,
    coalesce(ag.n, 0)
  from grid gr
  left join public.bmkg_snapshots bm
    on bm.device_id = p_device_id
   and bm.slot_local = gr.slot
  left join agg ag on ag.slot = gr.slot
  order by gr.slot;
$$;

grant execute on function public.bmkg_compare_export(integer, timestamp, timestamp)
  to anon, authenticated;

-- Cek cepat setelah dijalankan (ganti angka device sesuai kebutuhan):
--   select * from public.bmkg_compare_export(
--     1,
--     (now() at time zone 'Asia/Jakarta') - interval '24 hours',
--     (now() at time zone 'Asia/Jakarta')
--   );
-- Kolom sensor_* seharusnya sudah terisi; kolom bmkg_* baru terisi setelah
-- pencatatan (010_bmkg_snapshot_cron.sql) berjalan.
