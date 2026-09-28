import { supabase } from "./supabase";

// Baris tabel device_quota apa adanya (angka bisa datang sebagai string dari
// PostgREST, jadi field numerik dibiarkan `number` di sini dan dirapikan oleh
// pemanggilnya lewat lib/quotaCalc.ts, yang menerima string tanggal mentah).
export interface DeviceQuotaRow {
  device_id: number;
  provider_phone: string | null;
  cycle_days: number;
  last_refill_date: string | null; // "YYYY-MM-DD"
  last_reminder_at: string | null;
  last_reminder_zone: string | null;
}

/**
 * Ambil baris kuota untuk sekumpulan device. Device yang belum punya baris
 * (mis. SQL seed belum dijalankan, atau device baru) tidak dimasukkan ke
 * hasil — pemanggil memperlakukannya sebagai "belum diatur".
 */
export async function fetchDeviceQuotas(deviceIds: number[]): Promise<Record<number, DeviceQuotaRow>> {
  if (deviceIds.length === 0) return {};

  const { data, error } = await supabase
    .from("device_quota")
    .select("device_id, provider_phone, cycle_days, last_refill_date, last_reminder_at, last_reminder_zone")
    .in("device_id", deviceIds);

  if (error) {
    console.error("Gagal mengambil data kuota device:", error);
    return {};
  }

  const result: Record<number, DeviceQuotaRow> = {};
  for (const row of (data ?? []) as DeviceQuotaRow[]) {
    result[row.device_id] = { ...row, cycle_days: Number(row.cycle_days) };
  }
  return result;
}
