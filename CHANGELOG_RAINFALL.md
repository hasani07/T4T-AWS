# Perubahan: Curah Hujan dari Sensor Terpisah

## Latar belakang

Sensor hujan sekarang ESP tersendiri (tabel `rainfall_readings`), terpisah dari
weather station (tabel `sensors`). Weather station lama masih mengirim
`rainfall = 0` ke `sensors.rainfall` (sensornya sudah dilepas), jadi seluruh
tampilan yang membaca kolom itu harus dipindah.

Satu `device_id` dipakai bersama untuk lokasi yang sama
(1 = Cisangkuy, 2 = Ciminyak). Tabelnya beda, jadi tidak bentrok.

## Urutan deploy (PENTING, urut)

1. **SQL dulu**: Supabase → SQL Editor → jalankan seluruh isi
   `supabase/sql/008_rainfall_readings.sql`. Aman diulang. Tidak menyentuh
   `devices` / `sensors`.
2. **Website (Vercel)**: deploy project ini seperti biasa.
   Kalau langkah 1 terlewat, dashboard tetap jalan; kartu hujan hanya
   menampilkan "Belum ada data curah hujan" dan halaman lain menampilkan "-".
3. **Edge Functions** (opsional tapi disarankan, karena dipakai laporan
   Telegram & rekomendasi terjadwal). Deploy ulang, isi file diganti utuh:
   - `generate-recommendation`
   - `weekly-report`
   - `telegram-webhook`
   - `realtime-alert-check` (hanya buang cek `rainfall` yang sudah tidak relevan)
   - `backup-monitor` (menambahkan tabel `rainfall_readings` ke backup)

## Yang berubah di kode

| File | Perubahan |
|---|---|
| `lib/rainfall.ts` (baru) | Satu-satunya pintu baca data hujan: ringkasan (view), total & per-jam/hari (RPC), ekspor CSV |
| `lib/types.ts` | `SensorReading.rainfall` jadi deprecated; tambah `RainfallSummary`, `DeviceRainfall` |
| `lib/config.ts` | Tambah `RAINFALL_OFFLINE_THRESHOLD_MINUTES` (10 menit); hapus sanity range hujan |
| `lib/deviceStatus.ts` | `isDeviceOnline` menerima ambang opsional |
| `lib/statsEngine.ts` | Hujan tidak dihitung dari `sensors` lagi; `totalRainfall` diisi pemanggil |
| `lib/excelReport.ts` | Total hujan per jam/hari dari `rainfall_buckets` |
| `lib/csv.ts` | CSV cuaca tanpa kolom `rainfall`; tambah `buildRainfallCsv` |
| `lib/recommendationEngine.ts` | Hujan 24 jam dari `rainfall_total` |
| `lib/weeklyReport.ts` | Total hujan periode & pembanding dari `rainfall_total` |
| `components/RainfallCard.tsx` (baru) | Kartu hujan terpisah (akumulasi 1/3/6/12/24 J + hari ini + status sendiri) |
| `components/RainfallCardGrid.tsx` (baru) | Deretan kartu hujan, polling 30 detik |
| `components/DeviceStatusOverview.tsx` (baru) | Panel status 4 perangkat (weather + hujan per lokasi) |
| `lib/deviceLastSeen.ts` (baru) | Ambil data terakhir tiap perangkat dari `sensors` dan `rainfall_readings` |
| `components/SensorCard.tsx` | Hapus pill hujan (pindah ke kartu sendiri) |
| `app/page.tsx` | Pill ringkasan "Curah Hujan 24 Jam (Total)"; section kartu hujan |
| `components/analytics/*` | Total hujan dari RPC; batang hujan per jam di grafik tren |
| `components/download/DownloadClient.tsx` | Dua tombol: CSV Cuaca dan CSV Curah Hujan |
| `supabase/functions/*` | Hujan dari `rainfall_total` / `rainfall_buckets` |

## Yang TIDAK diubah

- Tabel `devices`, `sensors`, `system_logs`, dan firmware weather station.
- Kolom `sensors.rainfall` tetap ada (sisa), hanya tidak dibaca lagi.

## Catatan perilaku

- **Panel "Status Perangkat"** di atas dashboard menghitung tiap perangkat fisik
  sendiri-sendiri (2 lokasi = 4 perangkat): Weather Station dan Sensor Hujan
  untuk Cisangkuy dan Ciminyak, masing-masing dengan badge Online/Offline dan
  "data terakhir X menit lalu". Ringkasan "X/4 online". Diperbarui sendiri
  (tanpa reload) tiap 30 detik. Pill "Status Device" lama dihapus (diganti panel ini).
- **Ambang offline weather station diperketat dari 90 menit menjadi 10 menit**
  (`OFFLINE_THRESHOLD_MINUTES` di `lib/config.ts`), karena weather station sekarang
  kirim tiap 1 menit. Kalau interval kirim diubah lagi, sesuaikan nilai ini.
  Ikut memengaruhi badge di kartu cuaca dan warna titik di peta.
- Kartu hujan online/offline pakai ambang 10 menit (sensor hujan kirim tiap
  1 menit), terpisah dari ambang weather station (90 menit).
- "Curah Hujan" di kartu = hujan pada pengiriman terakhir. Kalau pengiriman
  sebelumnya tertunda (WiFi putus), nilainya mencakup hujan yang tertahan.
- Total hujan bernilai `-` (bukan 0) kalau sensor hujan tidak mengirim satu
  baris pun pada periode itu.
- Di grafik tren, batang hujan (mm per jam) diletakkan di pembacaan cuaca
  pertama pada jam tersebut. Jam yang punya hujan tapi weather station
  offline seluruh jam itu tidak tampil di grafik (tetap masuk total).
- Excel: kolom "Total Hujan" kosong untuk periode tanpa data hujan.

## Belum bisa diuji dari sisi pembuat perubahan

Perubahan ini diperiksa dengan type-check (library eksternal di-stub) dan
dibandingkan dengan versi asli: tidak ada error tipe baru. Tetapi **`npm run
build` dan SQL belum dijalankan** di lingkungan pembuat (tanpa internet dan
tanpa PostgreSQL). Jalankan `npm run build` sebelum deploy, dan cek hasil SQL
dengan query di bawah.

```sql
select * from public.rainfall_summary;
select public.rainfall_total(1, now() - interval '1 day' + interval '7 hours', now() + interval '7 hours');
select * from public.rainfall_buckets(1, now() - interval '1 day' + interval '7 hours', now() + interval '7 hours', 'hour');
```
