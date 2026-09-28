import { supabase } from "./supabase";
import {
  DeviceUptime,
  getUptimeWindow,
  parseUptimeRow,
  UptimeKind,
  UptimePeriod,
} from "./uptimeCalc";

// Error dengan kode PostgREST, supaya UI bisa membedakan "fungsi belum dibuat"
// (SQL 012 belum dijalankan) dari gangguan biasa.
export class UptimeError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Ambil uptime satu perangkat untuk satu periode. Read-only (fungsi SQL
 * device_uptime hanya membaca). Melempar UptimeError kalau gagal.
 *
 * kind: 'weather' = tabel sensors, 'rain' = tabel rainfall_readings.
 * thresholdMinutes: ambang Offline (samakan dengan badge di dashboard:
 * OFFLINE_THRESHOLD_MINUTES / RAINFALL_OFFLINE_THRESHOLD_MINUTES).
 */
export async function fetchDeviceUptime(
  kind: UptimeKind,
  deviceId: number,
  period: UptimePeriod,
  thresholdMinutes: number,
  nowMs: number = Date.now()
): Promise<DeviceUptime | null> {
  const { start, end } = getUptimeWindow(period, nowMs);
  const { data, error } = await supabase.rpc("device_uptime", {
    p_kind: kind,
    p_device_id: deviceId,
    p_start: start,
    p_end: end,
    p_threshold_minutes: thresholdMinutes,
  });

  if (error) throw new UptimeError(error.message, error.code);

  const row = Array.isArray(data) ? data[0] : data;
  return parseUptimeRow(row, end);
}
