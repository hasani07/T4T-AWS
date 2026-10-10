import { getDevicesWithLatestReadings } from "@/lib/devices";
import { fetchDeviceRainfalls } from "@/lib/rainfall";
import { DeviceRainfall } from "@/lib/types";
import KioskView from "@/components/kiosk/KioskView";

// Selalu ambil data terbaru saat halaman dibuka (kiosk biasanya dibuka
// sekali lalu dibiarkan menyala terus -- data berikutnya di-refresh sendiri
// oleh polling di KioskView, tapi muatan AWAL ini tetap harus segar).
export const revalidate = 0;

/**
 * Mode Kiosk: halaman BERANDA ("/"). Dibuat untuk dipasang di layar/TV
 * tanpa ada yang menjaga -- ringkasan + cuaca + hujan + peringatan per
 * lokasi digeser otomatis tiap 5 detik (lihat components/kiosk/KioskView.tsx).
 * Dashboard lengkap (semua kartu, grafik, peta) tetap ada di /dashboard,
 * dengan tombol "Lihat Dashboard" di kiosk ini untuk ke sana.
 */
export default async function KioskPage() {
  const devicesWithReadings = await getDevicesWithLatestReadings();
  const deviceIds = devicesWithReadings.map((d) => d.id);

  let rainfalls: DeviceRainfall[];
  try {
    rainfalls = await fetchDeviceRainfalls(deviceIds);
  } catch (err) {
    console.error("Kiosk: gagal memuat data curah hujan awal:", err);
    rainfalls = deviceIds.map((id) => ({ deviceId: id, summary: null, lastReadingAt: null }));
  }

  return <KioskView initialDevices={devicesWithReadings} initialRainfalls={rainfalls} />;
}
