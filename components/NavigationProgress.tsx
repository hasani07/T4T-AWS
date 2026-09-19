"use client";

import { createContext, useContext, useTransition } from "react";

interface NavigationProgressContextValue {
  isPending: boolean;
  run: (fn: () => void) => void;
}

const NavigationProgressContext = createContext<NavigationProgressContextValue | null>(
  null
);

/**
 * Provider global buat indikator loading yang DIJAMIN kelihatan, beda
 * dengan app/loading.tsx bawaan Next.js yang:
 *   - bisa "kelewat" kalau halaman tujuan sudah di-prefetch (jadi
 *     transisinya berasa instan, Suspense-nya gak sempat kepakai)
 *   - TIDAK terpicu sama sekali kalau yang jalan itu router.refresh()
 *     (dipakai AutoRefresher), karena itu bukan "navigasi ke halaman
 *     baru" di mata Next.js
 *
 * Solusinya: bungkus manual pakai useTransition sendiri, supaya
 * isPending-nya kita yang kontrol penuh, dipakai bareng-bareng oleh
 * Nav.tsx (klik menu) dan AutoRefresher.tsx (refresh berkala).
 */
export function NavigationProgressProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isPending, startTransition] = useTransition();

  function run(fn: () => void) {
    startTransition(fn);
  }

  return (
    <NavigationProgressContext.Provider value={{ isPending, run }}>
      {isPending && (
        <div className="fixed inset-x-0 top-0 z-[60] h-1 bg-slate-200">
          <div className="h-full w-full animate-pulse bg-slate-900" />
        </div>
      )}
      {children}
    </NavigationProgressContext.Provider>
  );
}

export function useNavigationProgress() {
  const ctx = useContext(NavigationProgressContext);
  if (!ctx) {
    throw new Error(
      "useNavigationProgress harus dipakai di dalam NavigationProgressProvider."
    );
  }
  return ctx;
}
