-- =====================================================================
-- Pengingat kuota data provider (device_quota) untuk halaman /kuota.
--
-- Alur singkat: pengguna mencatat TANGGAL terakhir isi ulang paket data
-- lewat web (dan nomor provider, sudah diisi otomatis di bawah). Cron
-- (jadwalnya: 014_quota_cron.sql) mengecek tiap jam dan mengirim pengingat
-- Telegram sesuai zona:
--   - H-5 s/d H-1        : 1x/hari
--   - H-24 jam ke bawah, TERMASUK setelah lewat perkiraan habis
--     (terus-menerus sampai diisi ulang) : 1x/jam
-- Siklus dihitung 28 hari sejak tanggal isi ulang (cycle_days, bisa
-- disesuaikan per device kalau suatu saat providernya beda paket).
--
-- * Hanya membuat objek BARU. TIDAK mengubah tabel `devices` atau `sensors`.
-- * TIDAK ADA policy insert/update untuk anon: nomor provider dan tanggal
--   isi ulang HANYA diubah lewat API server (/api/quota/phone,
--   /api/quota/refill), supaya perubahan tanggal selalu memicu pesan
--   Telegram yang bersangkutan dan tidak bisa diutak-atik langsung dari
--   browser.
-- * Aman dijalankan berulang.
-- Jalankan di Supabase -> SQL Editor
-- =====================================================================

create table if not exists public.device_quota (
  device_id          bigint primary key references public.devices(id) on delete cascade,
  provider_phone     text,
  cycle_days         integer not null default 28,
  last_refill_date   date,               -- tanggal kalender WIB terakhir isi ulang
  last_reminder_at   timestamptz,        -- kapan pengingat TERAKHIR benar-benar terkirim
  last_reminder_zone text,               -- zona pengingat terakhir: 'daily' | 'hourly' | null
  updated_at         timestamptz not null default now()
);

alter table public.device_quota enable row level security;

drop policy if exists "dashboard boleh baca kuota" on public.device_quota;
create policy "dashboard boleh baca kuota"
  on public.device_quota for select to anon
  using (true);

grant select on public.device_quota to anon, authenticated;

-- Seed 1 baris per device yang SUDAH ADA di tabel `devices`, dicocokkan lewat
-- nama lokasi (bukan menebak angka id, karena id sesungguhnya bisa berbeda
-- di tiap instalasi). Nomor provider diisi sesuai yang diberikan; kalau
-- baris untuk device itu sudah ada, nomornya TIDAK ditimpa (supaya aman
-- dijalankan ulang setelah nomor pernah diedit lewat web).
insert into public.device_quota (device_id, provider_phone, cycle_days)
select d.id, x.phone, 28
from public.devices d
join (values ('CISANGKUY', '08217367751'), ('CIMINYAK', '08217367749')) as x(loc, phone)
  on upper(d.type) = x.loc
on conflict (device_id) do nothing;

-- Cek hasil seed (harus menampilkan 2 baris, satu per device, dengan
-- provider_phone terisi dan last_refill_date NULL sampai diisi lewat web):
--   select dq.device_id, d.type, dq.provider_phone, dq.cycle_days, dq.last_refill_date
--   from public.device_quota dq join public.devices d on d.id = dq.device_id
--   order by d.type;
