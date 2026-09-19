-- =====================================================================
-- Migrasi: tabel backup_logs + function get_database_size_mb (Fase 6)
-- =====================================================================
-- PENTING: script ini HANYA membuat objek baru. TIDAK ada ALTER/DROP
-- terhadap tabel `devices`, `sensors`, `system_logs`, `ai_recommendations`,
-- `weekly_reports`, atau `settings` yang sudah ada.
-- =====================================================================

create table if not exists public.backup_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  storage_path text not null,
  db_size_at_backup numeric, -- persentase kapasitas saat backup dibuat
  retention_expires_at timestamptz not null,
  downloaded boolean not null default false,
  downloaded_at timestamptz,
  last_notified_at timestamptz,
  expired boolean not null default false
);

alter table public.backup_logs enable row level security;

create policy "Allow read access for anon"
on public.backup_logs
for select
to anon
using (true);
-- Tidak ada policy insert/update untuk anon — penulisan (buat backup,
-- tandai downloaded, tandai expired) hanya lewat service_role key dari
-- Edge Function / API route server.

create index if not exists idx_backup_logs_created_at
  on public.backup_logs (created_at desc);

-- Default kuota database dalam MB. INI HARUS DISESUAIKAN MANUAL sesuai
-- plan Supabase Anda yang sebenarnya (cek di Dashboard -> Settings ->
-- Usage). 500 MB adalah batas plan Free saat migrasi ini dibuat.
insert into public.settings (key, value)
values ('db_quota_mb', '500'::jsonb)
on conflict (key) do nothing;

-- Function untuk menghitung ukuran database aktual (dalam MB).
-- SECURITY DEFINER supaya bisa dipanggil lewat anon key tanpa perlu izin
-- superuser di sisi pemanggil.
create or replace function public.get_database_size_mb()
returns numeric
language sql
security definer
set search_path = public
as $$
  select round(pg_database_size(current_database()) / 1024.0 / 1024.0, 2);
$$;

grant execute on function public.get_database_size_mb() to anon, authenticated;

-- =====================================================================
-- SETELAH menjalankan SQL ini, buat 1 Storage bucket secara manual:
--   Supabase Dashboard -> Storage -> New bucket
--   Nama: backups
--   Public: TIDAK (harus Private)
-- =====================================================================
