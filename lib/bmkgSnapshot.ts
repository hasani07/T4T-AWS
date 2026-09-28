// Pencatat prakiraan BMKG ke Supabase. Dijalankan berkala (tiap 5 menit) oleh
// route /api/cron/bmkg-snapshot. Mencatat DUA hal:
//
// 1) bmkg_snapshots — prakiraan tiap slot 3 jam (untuk unduhan riwayat).
//    API BMKG hanya memberi slot dari sekarang ke depan, tanpa riwayat, jadi
//    kita catat sendiri. Tiap pencatatan meng-upsert semua slot yang
//    dikembalikan; karena slot yang sudah lewat tidak dikembalikan lagi, nilai
//    tersimpan tiap slot = prakiraan TERBARU sebelum slot itu tiba.
//
// 2) bmkg_releases — SATU baris tiap kali BMKG merilis prakiraan baru, yaitu
//    saat `analysis_date` berganti. first_seen_at = kapan kita PERTAMA kali
//    melihat rilis itu di API (jam "terdeteksi"). Tidak pernah ditimpa, jadi
//    jamnya tetap yang awal selama analysis_date belum berganti.
//
// HANYA untuk kode server (memakai service_role key).
import { getSupabaseServer } from "./supabaseServer";
import { getSetting } from "./settings";
import { fetchBmkgForecast } from "./bmkg";
import { buildSnapshotRows, pickAnalysisUtc } from "./bmkgSnapshotRows";

export interface SnapshotResult {
  deviceId: number;
  adm4: string | null;
  fetched: number;
  upserted: number;
  analysisUtc: string | null; // rilis BMKG yang terbaca di respons ini
  newRelease: boolean; // true kalau rilis ini BARU pertama kali tercatat
  error?: string;
}

type ServerClient = ReturnType<typeof getSupabaseServer>;

/**
 * Catat rilis BMKG kalau belum pernah tercatat. Sengaja tidak mengandalkan
 * perilaku "ignore duplicates" milik upsert: cek dulu, baru sisipkan. Kalau
 * dua pemanggilan berbarengan (balapan), constraint unik di database
 * menolak yang kedua dan itu dianggap wajar.
 */
async function recordRelease(
  server: ServerClient,
  deviceId: number,
  adm4: string,
  analysisUtc: string
): Promise<{ isNew: boolean; error?: string }> {
  const exact = await server
    .from("bmkg_releases")
    .select("id")
    .eq("device_id", deviceId)
    .eq("analysis_utc", analysisUtc)
    .limit(1);
  if (exact.error) return { isNew: false, error: exact.error.message };
  if (exact.data && exact.data.length > 0) return { isNew: false };

  // Rilis pertama yang kita lihat untuk device ini? Kalau ya, tandai sebagai
  // baseline: rilis itu mungkin sudah ada di API jauh sebelum kita mulai
  // memantau, jadi first_seen_at cuma batas paling lambat.
  const any = await server.from("bmkg_releases").select("id").eq("device_id", deviceId).limit(1);
  if (any.error) return { isNew: false, error: any.error.message };
  const isBaseline = !any.data || any.data.length === 0;

  const { error } = await server.from("bmkg_releases").insert({
    device_id: deviceId,
    adm4,
    analysis_utc: analysisUtc,
    is_baseline: isBaseline,
  });
  if (error) {
    if (error.code === "23505") return { isNew: false }; // sudah dicatat pemanggilan lain
    return { isNew: false, error: error.message };
  }
  return { isNew: true };
}

export async function captureBmkgSnapshots(): Promise<SnapshotResult[]> {
  const server = getSupabaseServer();

  const { data: devices, error: devicesError } = await server
    .from("devices")
    .select("id")
    .order("id", { ascending: true });
  if (devicesError) {
    throw new Error(`Gagal mengambil daftar device: ${devicesError.message}`);
  }

  const results: SnapshotResult[] = [];

  for (const device of devices ?? []) {
    const deviceId = Number(device.id);
    const adm4 = await getSetting<string>(`bmkg_adm4_${deviceId}`, "");

    if (!adm4) {
      results.push({
        deviceId,
        adm4: null,
        fetched: 0,
        upserted: 0,
        analysisUtc: null,
        newRelease: false,
        error: "kode wilayah BMKG (adm4) belum diisi",
      });
      continue;
    }

    const forecast = await fetchBmkgForecast(adm4, { fresh: true });
    if (!forecast) {
      results.push({
        deviceId,
        adm4,
        fetched: 0,
        upserted: 0,
        analysisUtc: null,
        newRelease: false,
        error: "gagal mengambil data BMKG",
      });
      continue;
    }

    const problems: string[] = [];
    const analysisUtc = pickAnalysisUtc(forecast.entries);

    // (1) snapshot prakiraan per slot
    const rows = buildSnapshotRows(deviceId, adm4, forecast.entries);
    let upserted = 0;
    if (rows.length === 0) {
      problems.push("tidak ada entri prakiraan yang valid");
    } else {
      const { error: upsertError } = await server
        .from("bmkg_snapshots")
        .upsert(rows, { onConflict: "device_id,slot_utc" });
      if (upsertError) problems.push(`gagal menyimpan snapshot: ${upsertError.message}`);
      else upserted = rows.length;
    }

    // (2) rilis BMKG — dicatat terpisah, supaya kegagalannya (mis. tabel
    // belum dibuat) tidak menghalangi snapshot di atas.
    let newRelease = false;
    if (analysisUtc) {
      const rel = await recordRelease(server, deviceId, adm4, analysisUtc);
      newRelease = rel.isNew;
      if (rel.error) problems.push(`gagal mencatat rilis: ${rel.error}`);
    } else {
      problems.push("analysis_date tidak ada di respons BMKG");
    }

    results.push({
      deviceId,
      adm4,
      fetched: forecast.entries.length,
      upserted,
      analysisUtc,
      newRelease,
      ...(problems.length ? { error: problems.join("; ") } : {}),
    });
  }

  return results;
}
