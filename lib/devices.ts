import { supabase } from "./supabase";
import { DeviceWithLatestReading } from "./types";

/**
 * Daftar device + pembacaan sensor cuaca TERAKHIR masing-masing.
 *
 * Dipakai bersama oleh dashboard (SSR awal, app/dashboard/page.tsx) dan
 * kiosk (SSR awal + polling berkala di browser, app/page.tsx +
 * components/kiosk/*) -- diekstrak ke sini supaya query-nya satu tempat,
 * bukan diduplikasi di kedua halaman.
 *
 * Boleh dipanggil dari server MAUPUN client (dipakai Supabase anon key
 * biasa, pola yang sama dengan components/SensorCardGrid.tsx).
 */
export async function getDevicesWithLatestReadings(): Promise<DeviceWithLatestReading[]> {
  const { data: devices, error: devicesError } = await supabase
    .from("devices")
    .select("id, type")
    .order("id", { ascending: true });

  if (devicesError || !devices) {
    console.error("Gagal mengambil data devices:", devicesError);
    return [];
  }

  const results: DeviceWithLatestReading[] = [];

  for (const device of devices) {
    // Firmware SUDAH mengirim hasil rata-rata 5 menit (bukan data mentah
    // per menit) — jadi kita ambil 1 baris terakhir apa adanya, tidak
    // perlu hitung ulang rata-rata di sisi web.
    const { data: latestReadings, error: sensorError } = await supabase
      .from("sensors")
      .select("*")
      .eq("device_id", device.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (sensorError) {
      console.error(
        `Gagal mengambil data sensor untuk device ${device.id}:`,
        sensorError
      );
    }

    results.push({
      ...device,
      latest: latestReadings && latestReadings.length > 0 ? latestReadings[0] : null,
    });
  }

  return results;
}
