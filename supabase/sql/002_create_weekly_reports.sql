-- =====================================================================
-- Migrasi: tabel settings & weekly_reports (Fase 5 — Laporan Mingguan)
-- =====================================================================
-- PENTING: script ini HANYA membuat tabel baru. TIDAK ada ALTER/DROP
-- terhadap tabel `devices`, `sensors`, `system_logs`, atau
-- `ai_recommendations` yang sudah ada. Jalankan di Supabase SQL Editor.
-- =====================================================================

-- Tabel key-value untuk pengaturan yang bisa diubah dari dashboard
create table if not exists public.settings (
  key text primary key,
  value jsonb not null
);

alter table public.settings enable row level security;

create policy "Allow read access for anon"
on public.settings
for select
to anon
using (true);
-- Tidak ada policy insert/update untuk anon — perubahan setting hanya
-- lewat service_role key dari API route server.

-- Default interval laporan mingguan: 7 hari
insert into public.settings (key, value)
values ('weekly_report_interval_days', '7'::jsonb)
on conflict (key) do nothing;

-- Riwayat laporan mingguan yang sudah dikirim/dicoba kirim
create table if not exists public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz not null default now(),
  trigger_type text not null check (trigger_type in ('manual', 'scheduled')),
  period_start date not null,
  period_end date not null,
  interval_days_config int not null,
  telegram_message_id text,
  status text not null check (status in ('sent', 'failed')),
  summary_text text,
  error_message text
);

alter table public.weekly_reports enable row level security;

create policy "Allow read access for anon"
on public.weekly_reports
for select
to anon
using (true);

create index if not exists idx_weekly_reports_generated_at
  on public.weekly_reports (generated_at desc);
