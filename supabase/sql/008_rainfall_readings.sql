-- =====================================================================
-- Tabel hujan + view akumulasi (1/3/6/12/24 jam, per jam, per hari)
--
-- * Hanya membuat / mengubah objek BARU khusus hujan.
--   TIDAK menyentuh public.sensors, public.devices, atau tabel lain.
-- * Aman dijalankan berulang, dan aman walau rainfall_readings
--   sudah pernah dibuat dari versi sebelumnya.
-- Jalankan di Supabase -> SQL Editor
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Tabel
--    rain_mm  = hujan sejak pengiriman sukses sebelumnya (normalnya 1 menit)
--    rainfall = akumulasi hujan hari ini sejak 00:00 WIB
-- ---------------------------------------------------------------------
create table if not exists public.rainfall_readings (
  id          bigint generated always as identity primary key,
  device_id   bigint not null default 1,      -- sama dengan id weather station, sengaja TANPA foreign key
  rain_mm     numeric(9,4) not null default 0,
  rainfall    numeric(8,2),
  -- Sama persis dengan tabel sensors: menyimpan jam dinding WIB (tampil dengan label +00)
  created_at  timestamptz not null default (now() at time zone 'Asia/Jakarta')
);

-- Kalau tabel sudah ada dari versi sebelumnya: tambah kolom baru, longgarkan rainfall
alter table public.rainfall_readings
  add column if not exists rain_mm numeric(9,4) not null default 0;
alter table public.rainfall_readings
  alter column rainfall drop not null;

create index if not exists rainfall_readings_device_created_idx
  on public.rainfall_readings (device_id, created_at desc);


-- ---------------------------------------------------------------------
-- 2) RLS hanya di tabel hujan ini
-- ---------------------------------------------------------------------
alter table public.rainfall_readings enable row level security;

drop policy if exists "esp hujan boleh insert" on public.rainfall_readings;
create policy "esp hujan boleh insert"
  on public.rainfall_readings for insert to anon
  with check (true);

drop policy if exists "dashboard boleh baca rainfall" on public.rainfall_readings;
create policy "dashboard boleh baca rainfall"
  on public.rainfall_readings for select to anon
  using (true);

grant select, insert on public.rainfall_readings to anon, authenticated;


-- ---------------------------------------------------------------------
-- 3) View ringkasan: sama seperti popup "Curah Hujan + Akumulasi 1J/3J/6J/12J/24J"
--    Dashboard cukup: select * from rainfall_summary where device_id = 1
--
--    Catatan waktu: created_at berisi jam WIB (label +00), jadi "sekarang"
--    juga dihitung dalam jam WIB supaya jendela waktunya tepat.
--    Jendela 1J/3J/... adalah jendela bergulir (rolling), bukan reset 00:00.
--    acc_today = akumulasi sejak 00:00 WIB hari ini.
-- ---------------------------------------------------------------------
create or replace view public.rainfall_summary
with (security_invoker = on) as
with t as (
  select
    (now() at time zone 'Asia/Jakarta') at time zone 'UTC'                  as now_wib,
    date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'UTC' as today_start
)
select
  r.device_id,
  max(r.created_at)                                    as last_reading_at,
  (array_agg(r.rain_mm order by r.created_at desc))[1] as rain_last_mm,
  round(coalesce(sum(r.rain_mm) filter (where r.created_at >  t.now_wib - interval '1 hour'),  0), 2) as acc_1h,
  round(coalesce(sum(r.rain_mm) filter (where r.created_at >  t.now_wib - interval '3 hours'), 0), 2) as acc_3h,
  round(coalesce(sum(r.rain_mm) filter (where r.created_at >  t.now_wib - interval '6 hours'), 0), 2) as acc_6h,
  round(coalesce(sum(r.rain_mm) filter (where r.created_at >  t.now_wib - interval '12 hours'), 0), 2) as acc_12h,
  round(coalesce(sum(r.rain_mm) filter (where r.created_at >  t.now_wib - interval '24 hours'), 0), 2) as acc_24h,
  round(coalesce(sum(r.rain_mm) filter (where r.created_at >= t.today_start), 0), 2)                   as acc_today
from public.rainfall_readings r
cross join t
where r.created_at > t.now_wib - interval '24 hours'
group by r.device_id;


-- ---------------------------------------------------------------------
-- 4) View untuk grafik: total per jam dan total per hari (WIB)
-- ---------------------------------------------------------------------
create or replace view public.rainfall_hourly
with (security_invoker = on) as
select
  device_id,
  date_trunc('hour', created_at) as jam,
  round(sum(rain_mm), 2)         as rain_mm
from public.rainfall_readings
group by device_id, date_trunc('hour', created_at);

create or replace view public.rainfall_daily
with (security_invoker = on) as
select
  device_id,
  (created_at at time zone 'UTC')::date as tanggal,
  round(sum(rain_mm), 2)                as rain_mm
from public.rainfall_readings
group by device_id, (created_at at time zone 'UTC')::date;

grant select on public.rainfall_summary, public.rainfall_hourly, public.rainfall_daily
  to anon, authenticated;


-- ---------------------------------------------------------------------
-- 5) Fungsi agregasi (dipanggil dashboard lewat supabase.rpc)
--    Dihitung di database supaya website tidak perlu mengunduh puluhan
--    ribu baris per menit hanya untuk menjumlahkan curah hujan.
--
--    p_start / p_end memakai konvensi waktu yang sama dengan tabel sensors
--    (jam WIB berlabel +00), yaitu batas yang sudah digeser +7 jam oleh
--    lib/sensorTimeOffset.ts -> toSensorQueryBoundary().
--    security invoker: RLS tabel rainfall_readings tetap berlaku.
-- ---------------------------------------------------------------------

-- Total curah hujan (mm) dalam satu rentang.
-- Mengembalikan NULL kalau tidak ada satu baris pun (= sensor hujan tidak
-- mengirim data pada rentang itu), supaya dashboard bisa menampilkan "-"
-- dan bukan "0 mm" yang menyesatkan.
create or replace function public.rainfall_total(
  p_device_id bigint,
  p_start     timestamptz,
  p_end       timestamptz
)
returns numeric
language sql
stable
security invoker
as $$
  select sum(rain_mm)
  from public.rainfall_readings
  where device_id = p_device_id
    and created_at >= p_start
    and created_at <  p_end;
$$;

-- Total curah hujan per jam ('hour') atau per hari ('day').
-- bucket berformat sama dengan yang dipakai kode dashboard:
--   'hour' -> YYYY-MM-DDTHH   |   'day' -> YYYY-MM-DD
create or replace function public.rainfall_buckets(
  p_device_id bigint,
  p_start     timestamptz,
  p_end       timestamptz,
  p_bucket    text default 'hour'
)
returns table (bucket text, rain_mm numeric)
language sql
stable
security invoker
as $$
  select
    case when p_bucket = 'day'
      then to_char(created_at at time zone 'UTC', 'YYYY-MM-DD')
      else to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24')
    end as bucket,
    round(sum(rain_mm), 4) as rain_mm
  from public.rainfall_readings
  where device_id = p_device_id
    and created_at >= p_start
    and created_at <  p_end
  group by 1
  order by 1;
$$;

grant execute on function public.rainfall_total(bigint, timestamptz, timestamptz)
  to anon, authenticated;
grant execute on function public.rainfall_buckets(bigint, timestamptz, timestamptz, text)
  to anon, authenticated;
