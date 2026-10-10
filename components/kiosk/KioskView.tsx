"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { DeviceRainfall, DeviceWithLatestReading } from "@/lib/types";
import { getDevicesWithLatestReadings } from "@/lib/devices";
import { fetchDeviceRainfalls } from "@/lib/rainfall";
import { buildKioskSlides, KioskSlide } from "@/lib/kiosk";
import { fetchTemperatureTrend, fetchRainfallTrend, TrendPoint } from "@/lib/kioskTrend";
import {
  OverviewSlide,
  WeatherSlide,
  RainSlide,
  AlertSlide,
  slideTintClass,
  weatherSlideTint,
  rainSlideTint,
  alertSlideTint,
} from "./slides";

// Lama tiap slide tampil sebelum geser otomatis ke slide berikutnya.
const SLIDE_INTERVAL_MS = 5000;
// Seberapa sering data (sensor cuaca + ringkasan hujan) diambil ulang dari
// Supabase. Kiosk dimaksudkan menyala terus-menerus di satu layar tanpa
// ada yang refresh manual, jadi data HARUS tetap segar sendiri.
const DATA_POLL_MS = 30_000;
// Grafik tren (slide ringkasan) butuh query jauh lebih berat (data mentah
// beberapa jam, lihat lib/kioskTrend.ts) daripada pembacaan terakhir --
// jadi di-refresh lebih jarang, cukup tiap 5 menit (garis tren 6 jam tidak
// perlu update tiap 30 detik untuk tetap terasa "hidup").
const TREND_POLL_MS = 5 * 60_000;
// Geser horizontal minimum (px) di layar sentuh supaya dianggap swipe,
// bukan sekadar tap/scroll vertikal yang tidak sengaja.
const SWIPE_THRESHOLD_PX = 50;

function tintForSlide(slide: KioskSlide): string {
  switch (slide.kind) {
    case "overview":
      return slideTintClass("neutral");
    case "weather":
      return slideTintClass(weatherSlideTint(slide));
    case "rain":
      return slideTintClass(rainSlideTint(slide));
    case "alert":
      return slideTintClass(alertSlideTint(slide));
  }
}

export default function KioskView({
  initialDevices,
  initialRainfalls,
}: {
  initialDevices: DeviceWithLatestReading[];
  initialRainfalls: DeviceRainfall[];
}) {
  const [devices, setDevices] = useState(initialDevices);
  const [rainfalls, setRainfalls] = useState(initialRainfalls);
  const [index, setIndex] = useState(0);
  // undefined = belum selesai diambil sekali pun -- OverviewSlide
  // menyembunyikan grafik selagi begini, bukan menampilkan grafik kosong.
  const [tempTrend, setTempTrend] = useState<TrendPoint[] | undefined>(undefined);
  const [rainTrend, setRainTrend] = useState<TrendPoint[] | undefined>(undefined);

  const slides = buildKioskSlides(devices, rainfalls);
  // Data bisa berubah (device baru/hilang) sehingga jumlah slide berubah --
  // jaga index tetap valid supaya tidak mengarah ke slide yang sudah tidak ada.
  // `index` bisa negatif (abis beberapa kali goPrev dari slide 0), dan `%` di
  // JS mempertahankan tanda bilangan negatif (-1 % 5 === -1, bukan 4), jadi
  // ditambah sekali lagi supaya hasilnya selalu bulat positif.
  const safeIndex =
    slides.length > 0 ? ((index % slides.length) + slides.length) % slides.length : 0;
  const currentSlide = slides[safeIndex];

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

  // ---------------- Geser otomatis tiap SLIDE_INTERVAL_MS ----------------
  // `tick` dipakai sebagai "alasan" effect ini jalan ulang: setiap navigasi
  // manual (dot/panah/swipe) menaikkan tick, yang me-restart timer-nya --
  // jadi abis orang interaksi, hitungan 5 detik mulai dari situ lagi,
  // bukan nyambung dari sisa waktu sebelumnya.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setTimeout(() => {
      setIndex((i) => i + 1);
    }, SLIDE_INTERVAL_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, slides.length]);

  const goTo = useCallback((next: number) => {
    setIndex(next);
    setTick((t) => t + 1);
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => i + 1);
    setTick((t) => t + 1);
  }, []);

  const goPrev = useCallback(() => {
    setIndex((i) => i - 1);
    setTick((t) => t + 1);
  }, []);

  // ---------------- Keyboard (panah kiri/kanan) ----------------
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev]);

  // ---------------- Swipe (layar sentuh/HP) ----------------
  const touchStartX = useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (dx < 0) goNext();
    else goPrev();
  }

  if (!currentSlide) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-page text-center text-slate-500">
        <p>Belum ada device terdaftar.</p>
      </div>
    );
  }

  return (
    <div
      className={`relative flex h-screen w-screen flex-col overflow-hidden ${tintForSlide(currentSlide)}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ---------- Header tipis: judul + tombol ke dashboard ---------- */}
      <div
        className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
      >
        <div className="flex items-center gap-2 rounded-2xl bg-surface/80 px-2.5 py-1.5 shadow-sm backdrop-blur sm:gap-2.5 sm:px-3 sm:py-2">
          {/* public/t4t-logo.png -- logo Trees4Trees, latar transparan jadi
              aman dipasang di atas tint warna slide apapun. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/t4t-logo.png"
            alt="Trees4Trees"
            width={28}
            height={28}
            className="h-6 w-6 object-contain sm:h-7 sm:w-7"
          />
          <span className="hidden text-xs font-semibold text-slate-600 dark:text-slate-300 sm:inline">
            AWS T4T
          </span>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full bg-surface/80 px-3.5 py-2 text-xs font-medium text-slate-600 shadow-sm backdrop-blur transition hover:bg-surface sm:text-sm"
        >
          <LayoutGrid size={14} strokeWidth={2.25} />
          Lihat Dashboard
        </Link>
      </div>

      {/* ---------- Konten slide (tap kiri/kanan juga bisa navigasi) ---------- */}
      <div className="relative flex-1">
        <button
          aria-label="Slide sebelumnya"
          onClick={goPrev}
          className="absolute inset-y-0 left-0 z-10 w-1/4 cursor-default"
        />
        <button
          aria-label="Slide berikutnya"
          onClick={goNext}
          className="absolute inset-y-0 right-0 z-10 w-1/4 cursor-default"
        />
        <div key={safeIndex} className="h-full w-full animate-[kiosk-fade_0.4s_ease]">
          {currentSlide.kind === "overview" && (
            <OverviewSlide slide={currentSlide} tempTrend={tempTrend} rainTrend={rainTrend} />
          )}
          {currentSlide.kind === "weather" && <WeatherSlide slide={currentSlide} />}
          {currentSlide.kind === "rain" && <RainSlide slide={currentSlide} />}
          {currentSlide.kind === "alert" && <AlertSlide slide={currentSlide} />}
        </div>
      </div>

      {/* ---------- Titik navigasi ---------- */}
      <div
        className="flex items-center justify-center gap-2 pb-5 pt-2"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))" }}
      >
        {slides.map((_, i) => (
          <button
            key={i}
            aria-label={`Ke slide ${i + 1}`}
            onClick={() => goTo(i)}
            className={`h-2 rounded-full transition-all ${
              i === safeIndex ? "w-6 bg-slate-900 dark:bg-slate-50" : "w-2 bg-slate-900/25 dark:bg-slate-50/25"
            }`}
          />
        ))}
      </div>

      <style>{`
        @keyframes kiosk-fade {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
