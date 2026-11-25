"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { DeviceRainfall, DeviceWithLatestReading } from "@/lib/types";
import { getDevicesWithLatestReadings } from "@/lib/devices";
import { fetchDeviceRainfalls } from "@/lib/rainfall";
import { buildKioskBoard } from "@/lib/kiosk";
import { fetchTemperatureTrend, fetchRainfallTrend, TrendPoint } from "@/lib/kioskTrend";
import { supabase } from "@/lib/supabase";
import { loadForecasts } from "@/lib/forecast/load";
import type { LocationForecast } from "@/lib/forecast/predict";
import BrandLogo from "@/components/BrandLogo";
import KioskBoard from "./KioskBoard";

// Kiosk menyala terus tanpa ada yang refresh manual, jadi semua data segar sendiri:
const DATA_POLL_MS = 30_000; // pembacaan terakhir cuaca + ringkasan hujan
const TREND_POLL_MS = 5 * 60_000; // grafik tren (query lebih berat)
const FORECAST_POLL_MS = 15 * 60_000; // prediksi 3 jam (model dilatih tiap malam)

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function KioskView({
  initialDevices,
  initialRainfalls,
  initialForecasts,
}: {
  initialDevices: DeviceWithLatestReading[];
  initialRainfalls: DeviceRainfall[];
  initialForecasts: LocationForecast[];
}) {
  const [devices, setDevices] = useState(initialDevices);
  const [rainfalls, setRainfalls] = useState(initialRainfalls);
  const [forecasts, setForecasts] = useState(initialForecasts);
  // undefined = belum selesai diambil sekali pun -> grafik disembunyikan dulu
  const [tempTrend, setTempTrend] = useState<TrendPoint[] | undefined>(undefined);
  const [rainTrend, setRainTrend] = useState<TrendPoint[] | undefined>(undefined);
  const now = useClock();

  const board = buildKioskBoard(devices, rainfalls);
  const allOnline = board.devicesOnline === board.devicesTotal && board.devicesTotal > 0;

  // ---- Data utama ----
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const freshDevices = await getDevicesWithLatestReadings();
        if (cancelled) return;
        setDevices(freshDevices);
        const freshRainfalls = await fetchDeviceRainfalls(freshDevices.map((d) => d.id));
        if (!cancelled) setRainfalls(freshRainfalls);
      } catch (err) {
        // Gagal sesaat: pertahankan data terakhir yang valid di layar.
        console.error("Kiosk: gagal memperbarui data:", err);
      }
    }
    const id = setInterval(refresh, DATA_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ---- Grafik tren & prediksi (lebih jarang) ----
  // Dependensi string id device (bukan `devices`) supaya tidak ikut jalan
  // tiap 30 detik bersama poll data utama.
  const deviceKey = devices.map((d) => `${d.id}:${d.type}`).join(",");
  useEffect(() => {
    if (!deviceKey) return;
    let cancelled = false;
    const list = deviceKey.split(",").map((s) => {
      const [id, ...type] = s.split(":");
      return { id: Number(id), type: type.join(":") };
    });

    async function refreshTrend() {
      try {
        const ids = list.map((d) => d.id);
        const [temp, rain] = await Promise.all([fetchTemperatureTrend(ids), fetchRainfallTrend(ids)]);
        if (!cancelled) {
          setTempTrend(temp);
          setRainTrend(rain);
        }
      } catch (err) {
        console.error("Kiosk: gagal memperbarui grafik tren:", err);
      }
    }
    async function refreshForecast() {
      try {
        const { forecasts: fresh } = await loadForecasts(supabase, list, { trainIfMissing: false });
        if (!cancelled && fresh.length) setForecasts(fresh);
      } catch (err) {
        console.error("Kiosk: gagal memperbarui prediksi:", err);
      }
    }

    refreshTrend();
    const t1 = setInterval(refreshTrend, TREND_POLL_MS);
    const t2 = setInterval(refreshForecast, FORECAST_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t1);
      clearInterval(t2);
    };
  }, [deviceKey]);

  const time = now?.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) ?? "--.--";
  const date =
    now?.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }) ?? "";

  return (
    // HP/tablet: tinggi minimal satu layar, boleh digulir. lg ke atas:
    // dikunci tepat satu layar (100dvh) tanpa scroll -- isi menyesuaikan.
    <div
      className="flex min-h-[100dvh] flex-col gap-3 bg-page p-3 sm:p-4 lg:h-[100dvh] lg:gap-[clamp(0.6rem,1.6vh,1.25rem)] lg:overflow-hidden lg:p-[clamp(0.75rem,2vh,1.75rem)]"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
    >
      {/* ---------- Kepala ---------- */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo className="h-10 w-auto shrink-0 lg:h-[clamp(2.5rem,6.5vh,4.5rem)]" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-extrabold tracking-tight text-slate-900 lg:text-[clamp(1.1rem,3vh,2.4rem)]">
              Ringkasan Saat Ini
            </h1>
            <p className="truncate text-xs capitalize text-slate-500 lg:text-[clamp(0.75rem,1.6vh,1.15rem)]">{date}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span
            className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold sm:inline-flex lg:text-[clamp(0.75rem,1.6vh,1.15rem)] ${
              allOnline
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${allOnline ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden />
            {board.devicesOnline}/{board.devicesTotal} lokasi online
          </span>
          <p className="font-extrabold leading-none tracking-tight tabular-nums text-slate-900">
            <span className="text-2xl lg:text-[clamp(1.6rem,5vh,4rem)]">{time}</span>
            <span className="ml-1 text-xs font-bold text-teal-600 dark:text-teal-400 lg:text-[clamp(0.7rem,1.5vh,1.1rem)]">WIB</span>
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-2 text-xs font-medium text-slate-600 ring-1 ring-slate-200/70 transition hover:bg-slate-100"
            aria-label="Kembali ke Dashboard"
          >
            <LayoutGrid size={14} strokeWidth={2.25} aria-hidden />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <KioskBoard board={board} tempTrend={tempTrend} rainTrend={rainTrend} forecasts={forecasts} />
      </div>
    </div>
  );
}
