-- =====================================================================
-- Prediksi cuaca & hujan jangka pendek (halaman /prediksi).
--
-- 1) forecast_hourly(): ringkasan PER JAM dari tabel sensors (cuaca) dan
--    rainfall_readings (hujan) untuk satu device -- bahan latih & bahan
--    prediksi. Dihitung di database supaya yang dikirim ke server hanya
--    ~24 baris per hari, bukan ~1.440 baris per menit.
-- 2) forecast_models: hasil latihan tiap malam (bobot model, pola jam,
--    skor uji 7 hari terakhir) dalam satu kolom JSON. Hanya ditulis oleh
--    cron (service_role); dashboard cukup membaca baris terbaru.
--
-- Aman dijalankan ulang. TIDAK mengubah tabel sensors/rainfall_readings.
--
-- Catatan zona waktu: created_at di kedua tabel berlabel UTC padahal
-- angkanya jam WIB (lihat lib/sensorTimeOffset.ts). Parameter p_start/p_end
-- di sini adalah jam dinding WIB TANPA zona, dan kolom `hour` yang
-- dikembalikan juga jam dinding WIB.
-- =====================================================================

create or replace function public.forecast_hourly(
  p_device_id bigint,
  p_start     timestamp,   -- jam dinding WIB, inklusif
  p_end       timestamp    -- jam dinding WIB, eksklusif
)
returns table (
  hour    timestamp,
  temp    numeric,
  tmax    numeric,
  tmin    numeric,
  rh      numeric,
  wind    numeric,
  gust    numeric,
  vpd     numeric,
  n       integer,
  rain_mm numeric          -- null = sensor hujan tidak mengirim data jam itu
)
language sql
stable
security invoker
as $$
  with wx as (
    select
      date_trunc('hour', s.created_at at time zone 'UTC') as hour,
      avg(s.temperature)  as temp,
      max(s.temperature)  as tmax,
      min(s.temperature)  as tmin,
      avg(s.humidity)     as rh,
      avg(s.wind_speed)   as wind,
      max(s.wind_speed)   as gust,
      avg(0.6108 * exp(17.27 * s.temperature / (s.temperature + 237.3))
          * (1 - s.humidity / 100.0)) as vpd,
      count(*)::int       as n
    from public.sensors s
    where s.device_id = p_device_id
      and s.created_at >= (p_start at time zone 'UTC')
      and s.created_at <  (p_end   at time zone 'UTC')
      -- rentang wajar, sama dengan SANITY_RANGES di lib/config.ts
      and s.temperature between 10 and 45
      and s.humidity    between 0 and 100
      and s.wind_speed  between 0 and 40
    group by 1
  ),
  rn as (
    select
      date_trunc('hour', r.created_at at time zone 'UTC') as hour,
      sum(r.rain_mm) as rain_mm
    from public.rainfall_readings r
    where r.device_id = p_device_id
      and r.created_at >= (p_start at time zone 'UTC')
      and r.created_at <  (p_end   at time zone 'UTC')
    group by 1
  )
  select
    coalesce(wx.hour, rn.hour) as hour,
    round(wx.temp, 3), round(wx.tmax, 2), round(wx.tmin, 2),
    round(wx.rh, 3), round(wx.wind, 3), round(wx.gust, 2), round(wx.vpd, 4),
    coalesce(wx.n, 0),
    round(rn.rain_mm, 4)
  from wx
  full outer join rn on rn.hour = wx.hour
  order by 1;
$$;

grant execute on function public.forecast_hourly(bigint, timestamp, timestamp)
  to anon, authenticated;

create table if not exists public.forecast_models (
  id         bigint generated always as identity primary key,
  trained_at timestamptz not null default now(),
  payload    jsonb not null       -- model + pola jam + skor uji (lib/forecast/train.ts)
);

create index if not exists forecast_models_trained_at_idx
  on public.forecast_models (trained_at desc);

alter table public.forecast_models enable row level security;

drop policy if exists "dashboard boleh baca model prediksi" on public.forecast_models;
create policy "dashboard boleh baca model prediksi"
  on public.forecast_models for select to anon
  using (true);

grant select on public.forecast_models to anon, authenticated;
