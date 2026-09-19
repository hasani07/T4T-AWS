"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Komponen tak-terlihat (render null) yang memanggil router.refresh()
 * secara berkala — dipakai untuk memaksa Server Component ambil data
 * baru lagi tanpa perlu reload halaman penuh atau navigasi manual.
 * Cocok untuk halaman yang datanya berubah berkala (mis. tiap jam,
 * mengikuti interval kirim data sensor) tapi Server Component-nya
 * sendiri cuma fetch sekali saat pertama dibuka.
 */
export default function AutoRefresher({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(interval);
  }, [router, intervalMs]);

  return null;
}
