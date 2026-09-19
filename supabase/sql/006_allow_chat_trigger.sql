-- =====================================================================
-- Migrasi kecil: izinkan nilai baru 'chat' di kolom trigger_type tabel
-- weekly_reports (tabel ini kita yang buat sendiri di Fase 5, jadi aman
-- diubah — beda dengan tabel devices/sensors/system_logs yang asalnya
-- dari device).
-- =====================================================================

alter table public.weekly_reports
  drop constraint if exists weekly_reports_trigger_type_check;

alter table public.weekly_reports
  add constraint weekly_reports_trigger_type_check
  check (trigger_type in ('manual', 'scheduled', 'chat'));
