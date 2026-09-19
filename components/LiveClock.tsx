"use client";

import { useEffect, useState } from "react";

export default function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!now) return null;

  const dateStr = now.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
  const timeStr = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Jakarta",
  });

  return (
    <div className="rounded-2xl bg-white px-5 py-3 text-right shadow-[0_2px_20px_rgba(15,23,42,0.06)]">
      <p className="text-lg font-semibold tabular-nums text-slate-900">{timeStr} WIB</p>
      <p className="text-xs text-slate-400">{dateStr}</p>
    </div>
  );
}
