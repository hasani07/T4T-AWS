export type PeriodPreset = "7d" | "30d" | "custom";

export interface DateRange {
  start: Date;
  end: Date; // exclusive
}

/**
 * Hitung rentang tanggal berdasarkan preset yang dipilih user.
 * "30d" dipakai sebagai representasi "1 bulan" (rolling 30 hari,
 * bukan kalender bulan kalender) supaya konsisten dipakai untuk
 * perbandingan periode sebelumnya.
 */
export function getPeriodRange(
  preset: PeriodPreset,
  customStart?: string,
  customEnd?: string
): DateRange {
  const now = new Date();

  if (preset === "7d") {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { start, end: now };
  }

  if (preset === "30d") {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { start, end: now };
  }

  // custom
  if (!customStart || !customEnd) {
    throw new Error("Custom range membutuhkan customStart dan customEnd");
  }
  const start = new Date(`${customStart}T00:00:00`);
  const end = new Date(`${customEnd}T00:00:00`);
  end.setDate(end.getDate() + 1); // jadikan exclusive: sampai akhir hari customEnd

  return { start, end };
}

/**
 * Periode pembanding = durasi yang sama, persis sebelum periode saat ini.
 * Mis. kalau periode saat ini 7 hari terakhir, periode pembanding adalah
 * 7 hari sebelum itu.
 */
export function getPreviousRange(range: DateRange): DateRange {
  const duration = range.end.getTime() - range.start.getTime();
  return {
    start: new Date(range.start.getTime() - duration),
    end: new Date(range.start.getTime()),
  };
}
