const QUICKCHART_CREATE_URL = "https://quickchart.io/chart/create";

/**
 * Kirim konfigurasi chart.js ke QuickChart.io, dapat balik URL gambar
 * (PNG) yang persisten — bisa langsung dipakai sebagai `photo` di
 * Telegram sendPhoto tanpa perlu handle binary image sendiri.
 * Return null kalau gagal (caller sebaiknya fallback ke kirim teks saja).
 */
export async function createQuickChartUrl(
  chartConfig: object,
  opts?: { width?: number; height?: number }
): Promise<string | null> {
  try {
    const res = await fetch(QUICKCHART_CREATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chart: chartConfig,
        backgroundColor: "white",
        width: opts?.width ?? 700,
        height: opts?.height ?? 400,
        format: "png",
      }),
    });

    if (!res.ok) {
      console.error("QuickChart create gagal:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    return data?.url ?? null;
  } catch (err) {
    console.error("Gagal membuat chart via QuickChart:", err);
    return null;
  }
}
