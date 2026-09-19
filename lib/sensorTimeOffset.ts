/**
 * ⚠️ CATATAN PENTING: kolom `sensors.created_at` diberi label UTC (+00)
 * oleh Supabase, TAPI berdasarkan verifikasi manual, angka jam yang
 * tersimpan sebenarnya SUDAH dalam jam lokal WIB — device/pipeline
 * pengirim data salah label (bukan benar-benar UTC). Ini bug di sisi
 * sumber data, di luar kendali dashboard (dan sesuai prinsip
 * non-destructive di PRD, tidak diubah dari sisi kita).
 *
 * Konsekuensinya: setiap kali kita mau filter tabel `sensors` berdasarkan
 * rentang tanggal yang dihitung dari jam TRUE UTC (mis. "7 hari
 * terakhir"), rentang itu harus digeser +7 jam dulu supaya cocok dengan
 * cara data tersimpan — kalau tidak, data yang seharusnya masuk rentang
 * bisa ketinggalan atau malah dianggap "dari masa depan" oleh query.
 *
 * Dipakai di: lib/statsEngine.ts, lib/csv.ts, lib/recommendationEngine.ts
 * — di manapun ada query ke tabel `sensors` dengan filter created_at.
 * TIDAK dipakai untuk tabel lain (ai_recommendations dll) karena
 * timestamp di tabel itu dibuat oleh server kita sendiri (jam yang benar,
 * tidak kena bug ini).
 */
export function toSensorQueryBoundary(date: Date): string {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString();
}
