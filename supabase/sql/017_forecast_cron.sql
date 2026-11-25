-- =====================================================================
-- Latih ulang model prediksi tiap malam lewat pg_cron.
-- Jalankan SETELAH 016_forecast.sql DAN setelah kode website (route
-- /api/cron/forecast-train) ter-deploy di Vercel.
--
-- TIDAK PERLU mengisi apa pun: CRON_SECRET diambil otomatis dari job cron
-- yang sudah berjalan (pengingat kuota / snapshot BMKG), jadi nilainya pasti
-- sama dengan yang ada di Vercel. Cukup tempel seluruh file ini lalu Run.
-- =====================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
declare
  v_url    text := 'https://atmosx.t4t.hasani.life/api/cron/forecast-train';
  v_secret text;
begin
  -- Ambil token "Bearer ..." dari perintah job cron lain yang sudah ada.
  select substring(command from 'Bearer ([^'']+)')
    into v_secret
  from cron.job
  where jobname in ('quota-check-hourly', 'bmkg-snapshot-every-5-min', 'bmkg-snapshot-every-30-min')
    and command like '%Bearer %'
  order by case jobname when 'quota-check-hourly' then 0 else 1 end
  limit 1;

  if v_secret is null or v_secret = '<CRON_SECRET>' then
    raise exception 'CRON_SECRET tidak ditemukan di job cron lain (quota-check-hourly / bmkg-snapshot). Jalankan 014_quota_cron.sql dulu, atau isi secret manual.';
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname = 'forecast-train-nightly';

  -- Jadwal pg_cron memakai UTC: '20 18 * * *' = 01:20 WIB tiap malam, saat
  -- data hari kemarin sudah lengkap dan tidak berebut dengan cron lain.
  perform cron.schedule(
    'forecast-train-nightly',
    '20 18 * * *',
    format(
      $cmd$select net.http_get(url := %L, headers := jsonb_build_object('Authorization', %L), timeout_milliseconds := 55000);$cmd$,
      v_url,
      'Bearer ' || v_secret
    )
  );

  -- Latih sekali sekarang juga, tidak perlu menunggu nanti malam.
  perform net.http_get(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 55000
  );

  raise notice 'Cron forecast-train-nightly terpasang (01:20 WIB) dan latihan pertama sudah dipicu.';
end $$;

-- Cek hasilnya (opsional), sekitar 1 menit setelah Run:
--   select jobname, schedule from cron.job where jobname = 'forecast-train-nightly';
--   select id, trained_at from public.forecast_models order by trained_at desc limit 3;
