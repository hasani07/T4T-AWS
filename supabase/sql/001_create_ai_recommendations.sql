-- =====================================================================
-- Migrasi: tabel ai_recommendations (Fase 4 — AI Recommendation)
-- =====================================================================
-- PENTING: script ini HANYA membuat tabel baru. TIDAK ada ALTER/DROP
-- terhadap tabel `devices`, `sensors`, atau `system_logs` yang sudah
-- berjalan. Jalankan ini di Supabase Dashboard -> SQL Editor.
-- =====================================================================

create table if not exists public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  device_id int8 not null references public.devices(id),
  generated_at timestamptz not null default now(),
  trigger_type text not null check (trigger_type in ('manual', 'scheduled')),
  input_summary jsonb not null,
  recommendation_text text not null
);

-- Aktifkan Row Level Security
alter table public.ai_recommendations enable row level security;

-- Dashboard (pakai anon key) boleh MEMBACA riwayat rekomendasi
create policy "Allow read access for anon"
on public.ai_recommendations
for select
to anon
using (true);

-- SENGAJA tidak ada policy insert/update/delete untuk anon.
-- Penulisan data HANYA lewat service_role key yang dipakai di API route
-- server (Vercel) — service_role otomatis bypass RLS, jadi tetap bisa
-- insert meski tidak ada policy insert eksplisit di atas.

-- Index untuk mempercepat query riwayat per device & waktu
create index if not exists idx_ai_recommendations_device_time
  on public.ai_recommendations (device_id, generated_at desc);
