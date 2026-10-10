import { getDevicesWithLatestReadings } from "@/lib/devices";
import { fetchDeviceRainfalls } from "@/lib/rainfall";
import { DeviceRainfall } from "@/lib/types";
import KioskView from "@/components/kiosk/KioskView";

// Selalu ambil data terbaru saat halaman dibuka (kiosk biasanya dibuka
// sekali lalu dibiarkan menyala terus -- data berikutnya di-refresh sendiri
// oleh polling di KioskView, tapi muatan AWAL ini tetap harus segar).
export const revalidate = 0;

/**
 * Mode Kiosk: halaman OPSIONAL di "/kiosk" (bukan beranda). Dibuat untuk
 * dipasang di layar/TV tanpa ada yang menjaga -- ringkasan + tren + tiap
 * lokasi (cuaca, hujan, sinyal, risiko) + peringatan tampil SEKALIGUS di
 * satu layar (lihat components/kiosk/KioskBoard.tsx), tanpa slide
 * bergantian, jadi orang yang lewat langsung lihat semua info tanpa
 * menunggu. Data tetap segar sendiri lewat polling di KioskView.tsx.
 * Dashboard lengkap (semua kartu, grafik, peta) tetap jadi beranda di "/",
 * dengan tombol "Mode Kiosk" di sana untuk masuk ke sini, dan tombol
 * "Lihat Dashboard" di kiosk ini untuk balik.
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
