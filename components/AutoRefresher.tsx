"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useNavigationProgress } from "./NavigationProgress";

/**
 * Komponen tak-terlihat (render null) yang memanggil router.refresh()
 * secara berkala — dipakai untuk memaksa Server Component ambil data
 * baru lagi tanpa perlu reload halaman penuh atau navigasi manual.
 * Dibungkus lewat useNavigationProgress() supaya bar loading di atas
 * halaman ikut muncul tiap kali refresh ini jalan — router.refresh()
 * SENDIRIAN tidak memicu app/loading.tsx bawaan Next.js.
 */
export default function AutoRefresher({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  const { run } = useNavigationProgress();

  useEffect(() => {
    const interval = setInterval(() => {
      run(() => router.refresh());
    }, intervalMs);
    return () => clearInterval(interval);
  }, [router, intervalMs, run]);

  return null;
}
