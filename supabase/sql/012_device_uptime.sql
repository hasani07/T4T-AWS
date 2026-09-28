-- =====================================================================
-- Uptime per perangkat (fungsi device_uptime) untuk panel "Uptime Perangkat"
-- di dashboard.
--
-- DEFINISI: uptime = persentase waktu perangkat TIDAK berstatus Offline, memakai
-- aturan yang sama dengan badge Online/Offline di dashboard: perangkat dianggap
-- Offline kalau tidak ada data baru lebih dari p_threshold_minutes (default 10,
-- sama dengan OFFLINE_THRESHOLD_MINUTES di lib/config.ts). Jadi tiap jeda antar
-- dua pembacaan yang lebih panjang dari ambang dihitung sebagai gangguan,
-- mulai dari (pembacaan terakhir + ambang) sampai pembacaan berikutnya.
-- Gangguan yang MASIH berlangsung (belum ada data baru sampai sekarang)
-- ikut dihitung sampai p_end.
--
-- p_kind      : 'weather' (tabel sensors) atau 'rain' (tabel rainfall_readings)
-- p_start/p_end : JAM DINDING WIB tanpa zona (tipe `timestamp`), p_end = sekarang.
--
-- Kekhasan created_at (angka sudah WIB tapi berlabel UTC): `created_at at time
-- zone 'UTC'` dipakai untuk mengambil angka jam dindingnya apa adanya (= WIB),
-- persis seperti di bmkg_compare_export. Tidak ada penggeseran +/-7 jam.
--
-- Perangkat yang baru ada di tengah jendela: jendela dihitung sejak pembacaan
-- PERTAMA-nya (eff_start), bukan sejak p_start, supaya tidak dianggap mati
-- sebelum pernah menyala.
--
-- * Hanya membuat fungsi BARU (read-only). TIDAK mengubah tabel apa pun.
-- * Aman dijalankan berulang.
-- Jalankan di Supabase -> SQL Editor
-- =====================================================================

create or replace function public.device_uptime(
  p_kind              text,
  p_device_id         integer,
  p_start             timestamp,
  p_end               timestamp,
  p_threshold_minutes integer default 10
)
returns table (
  eff_start              timestamp,          -- awal jendela yang benar-benar dihitung
  window_seconds         double precision,   -- panjang jendela (detik)
  down_seconds           double precision,   -- total waktu "Offline" (detik)
  readings               integer,            -- jumlah baris data di dalam jendela
  outage_count           integer,            -- jumlah gangguan
  longest_outage_seconds double precision,   -- gangguan terpanjang (detik)
  last_reading           timestamp,          -- pembacaan terakhir yang diketahui
  recent_outages         jsonb               -- sampai 20 gangguan terbaru: [{start,end,seconds}]
)
language sql
stable
as $$
  with win as (
    -- pembacaan di dalam jendela (predikat langsung di created_at supaya index terpakai)
    select s.created_at as ca
    from public.sensors s
    where p_kind = 'weather'
      and s.device_id = p_device_id
      and s.created_at >= (p_start at time zone 'UTC')
      and s.created_at <= (p_end   at time zone 'UTC')
    union all
    select r.created_at
    from public.rainfall_readings r
    where p_kind = 'rain'
      and r.device_id = p_device_id
      and r.created_at >= (p_start at time zone 'UTC')
      and r.created_at <= (p_end   at time zone 'UTC')
  ),
  anchor as (
    -- pembacaan terakhir SEBELUM jendela: menentukan apakah perangkat sedang
    -- mati saat jendela dimulai
    select max(a.ca) as ca
    from (
      select max(s.created_at) as ca
      from public.sensors s
      where p_kind = 'weather'
        and s.device_id = p_device_id
        and s.created_at < (p_start at time zone 'UTC')
      union all
      select max(r.created_at)
      from public.rainfall_readings r
      where p_kind = 'rain'
        and r.device_id = p_device_id
        and r.created_at < (p_start at time zone 'UTC')
    ) a
  ),
  real_pts as (
    select (w.ca at time zone 'UTC') as t from win w
    union all
    select (an.ca at time zone 'UTC') from anchor an where an.ca is not null
  ),
  pts as (
    select t from real_pts
    union all
    select p_end                                   -- titik akhir virtual = "sekarang"
  ),
  ordered as (
    select t, lag(t) over (order by t) as prev from pts
  ),
  bounds as (
    -- kalau ada pembacaan sebelum jendela: eff_start = p_start;
    -- kalau tidak: eff_start = pembacaan pertama (perangkat baru)
    select greatest(p_start, min(t)) as eff_start from pts
  ),
  outages as (
    select
      greatest(o.prev + make_interval(mins => p_threshold_minutes), b.eff_start) as o_start,
      least(o.t, p_end)                                                          as o_end
    from ordered o
    cross join bounds b
    where o.prev is not null
      and o.t - o.prev > make_interval(mins => p_threshold_minutes)
  ),
  clipped as (
    select
      x.o_start,
      x.o_end,
      extract(epoch from (x.o_end - x.o_start))::float8 as secs
    from outages x
    where x.o_end > x.o_start
  )
  select
    b.eff_start,
    extract(epoch from (p_end - b.eff_start))::float8,
    coalesce((select sum(c.secs) from clipped c), 0)::float8,
    (select count(*) from win)::integer,
    (select count(*) from clipped)::integer,
    coalesce((select max(c.secs) from clipped c), 0)::float8,
    (select max(rp.t) from real_pts rp),
    coalesce(
      (select jsonb_agg(
                jsonb_build_object('start', c.o_start, 'end', c.o_end, 'seconds', c.secs)
                order by c.o_start desc)
       from (select * from clipped order by o_start desc limit 20) c),
      '[]'::jsonb)
  from bounds b;
$$;

grant execute on function public.device_uptime(text, integer, timestamp, timestamp, integer)
  to anon, authenticated;

-- Cek cepat (harus keluar 1 baris; ganti 1 dengan id device Anda):
--   select * from public.device_uptime(
--     'weather', 1,
--     (now() at time zone 'Asia/Jakarta') - interval '24 hours',
--     (now() at time zone 'Asia/Jakarta'), 10);
--   select * from public.device_uptime(
--     'rain', 1,
--     (now() at time zone 'Asia/Jakarta') - interval '24 hours',
--     (now() at time zone 'Asia/Jakarta'), 10);

-- OPSIONAL (hanya kalau panel uptime 30 hari terasa lambat): tabel `sensors`
-- belum tentu punya index untuk (device_id, created_at). Membuatnya menahan
-- penulisan ke tabel itu sesaat saat index dibangun, jadi jalankan di jam sepi.
-- (rainfall_readings sudah punya index dari 008.)
--   create index if not exists sensors_device_created_idx
--     on public.sensors (device_id, created_at);
