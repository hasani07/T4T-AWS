-- =====================================================================
-- Isi cepat kode wilayah BMKG (adm4) per device — opsional, alternatif
-- dari isi manual lewat halaman /bmkg. Aman dijalankan berkali-kali.
-- Sesuaikan device_id kalau urutan devices Anda beda (cek: select * from
-- public.devices;)
-- =====================================================================

insert into public.settings (key, value) values
  ('bmkg_adm4_1', '"32.04.13.2007"'::jsonb),  -- device_id 1 = CISANGKUY -> Kiangroke
  ('bmkg_adm4_2', '"32.17.12.2002"'::jsonb)   -- device_id 2 = CIMINYAK -> Baranangsiang
on conflict (key) do update set value = excluded.value;
