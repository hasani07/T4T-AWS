"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { DeviceRainfall, DeviceWithLatestReading } from "@/lib/types";
import { getDevicesWithLatestReadings } from "@/lib/devices";
import { fetchDeviceRainfalls } from "@/lib/rainfall";
import { buildKioskBoard } from "@/lib/kiosk";
import { fetchTemperatureTrend, fetchRainfallTrend, TrendPoint } from "@/lib/kioskTrend";
import KioskBoard from "./KioskBoard";

// Seberapa sering data (sensor cuaca + ringkasan hujan) diambil ulang dari
// Supabase. Kiosk dimaksudkan menyala terus-menerus di satu layar tanpa
// ada yang refresh manual, jadi data HARUS tetap segar sendiri.
const DATA_POLL_MS = 30_000;
// Grafik tren butuh query jauh lebih berat (data mentah beberapa jam,
// lihat lib/kioskTrend.ts) daripada pembacaan terakhir -- jadi di-refresh
// lebih jarang, cukup tiap 5 menit.
const TREND_POLL_MS = 5 * 60_000;

export default function KioskView({
  initialDevices,
  initialRainfalls,
}: {
  initialDevices: DeviceWithLatestReading[];
  initialRainfalls: DeviceRainfall[];
}) {
  const [devices, setDevices] = useState(initialDevices);
  const [rainfalls, setRainfalls] = useState(initialRainfalls);
  // undefined = belum selesai diambil sekali pun -- KioskBoard
  // menyembunyikan grafik selagi begini, bukan menampilkan grafik kosong.
  const [tempTrend, setTempTrend] = useState<TrendPoint[] | undefined>(undefined);
  const [rainTrend, setRainTrend] = useState<TrendPoint[] | undefined>(undefined);

  const board = buildKioskBoard(devices, rainfalls);

  // ---------------- Polling data dari Supabase ----------------
  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const freshDevices = await getDevicesWithLatestReadings();
        if (cancelled) return;
        setDevices(freshDevices);

        const ids = freshDevices.map((d) => d.id);
        const freshRainfalls = await fetchDeviceRainfalls(ids);
        if (!cancelled) setRainfalls(freshRainfalls);
      } catch (err) {
        // Gagal sesaat (jaringan/DB): pertahankan data terakhir yang valid
        // di layar daripada mengosongkan kiosk.
        console.error("Kiosk: gagal memperbarui data:", err);
      }
    }

    const interval = setInterval(refresh, DATA_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // ---------------- Polling grafik tren (lebih jarang, lihat TREND_POLL_MS) ----------------
  // Dependensi sengaja STRING id device (bukan `devices` langsung): `devices`
  // berganti referensi tiap 30 detik (poll data utama di atas), kalau dipakai
  // sebagai dependency effect ini akan ikut jalan tiap 30 detik juga --
  // padahal query tren jauh lebih berat dan tidak perlu sesering itu. String
  // ini cuma berubah kalau daftar device-nya sendiri yang berubah (jarang).
  const deviceIdsKey = devices.map((d) => d.id).join(",");
  useEffect(() => {
    if (!deviceIdsKey) return;
    let cancelled = false;
    const ids = deviceIdsKey.split(",").map(Number);

    async function refreshTrend() {
      try {
        const [temp, rain] = await Promise.all([
          fetchTemperatureTrend(ids),
          fetchRainfallTrend(ids),
        ]);
        if (!cancelled) {
          setTempTrend(temp);
          setRainTrend(rain);
        }
      } catch (err) {
        console.error("Kiosk: gagal memperbarui grafik tren:", err);
      }
    }

    refreshTrend(); // ambil sekali langsung (jangan tunggu TREND_POLL_MS pertama)
    const interval = setInterval(refreshTrend, TREND_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [deviceIdsKey]);

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-page">
      {/* ---------- Header tipis: logo + judul + tombol ke dashboard ---------- */}
      <div
        className="flex shrink-0 items-center justify-between px-4 py-3 sm:px-6 sm:py-4"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
      >
        <div className="flex items-center gap-2 rounded-2xl bg-surface px-2.5 py-1.5 shadow-[0_2px_20px_rgba(15,23,42,0.06)] sm:gap-2.5 sm:px-3 sm:py-2">
          {/* public/t4t-logo.png -- logo Trees4Trees, latar transparan. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/t4t-logo.png"
            alt="Trees4Trees"
            width={28}
            height={28}
            className="h-6 w-6 object-contain sm:h-7 sm:w-7"
          />
          <span className="hidden text-xs font-semibold text-slate-600 sm:inline">AWS T4T</span>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 text-xs font-medium text-slate-600 shadow-[0_2px_20px_rgba(15,23,42,0.06)] transition hover:bg-slate-100 sm:text-sm"
        >
          <LayoutGrid size={14} strokeWidth={2.25} />
          Lihat Dashboard
        </Link>
      </div>

      {/* ---------- Papan kiosk: semua info satu layar, tidak digeser ---------- */}
      <div className="min-h-0 flex-1">
        <KioskBoard board={board} tempTrend={tempTrend} rainTrend={rainTrend} />
      </div>
    </div>
  );
}
