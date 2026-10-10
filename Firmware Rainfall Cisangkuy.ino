/*
 * Rainfall logger CISANGKUY: DFRobot SEN0575 (I2C) + ESP32-C3 -> Supabase
 * (OTA + log jarak jauh via device_logs/device_console TETAP ADA - lihat PANDUAN)
 *
 * - Baca sensor tiap 10 detik (6 pembacaan = 1 menit)
 * - Tiap 1 menit kirim ke Supabase:
 *     rain_mm  = jumlah hujan sejak pengiriman sukses sebelumnya (normalnya 1 menit)
 *     rainfall = akumulasi hujan hari ini (reset ke 0 di RESET_HOUR:RESET_MINUTE WIB via NTP)
 *   Akumulasi 1/3/6/12/24 jam dihitung di Supabase (view rainfall_summary)
 *   dengan menjumlahkan rain_mm.
 *
 * CATATAN EFISIENSI (dibanding versi sebelumnya):
 *   Sensor ini melaporkan JUMLAH GULING KUMULATIF (counter), bukan nilai sesaat.
 *   Artinya membaca lebih jarang TIDAK membuang data hujan sedikit pun -- delta
 *   (tips - lastTips) tetap benar berapa pun jarak waktu antar pembacaan, selama
 *   counter-nya tidak overflow (counter 32-bit, perlu miliaran guling, jadi aman).
 *   Jadi interval sampling diperlonggar dari 2 detik -> 10 detik TANPA kehilangan
 *   presisi curah hujan, cuma mengurangi jumlah pembacaan I2C per menit (30 -> 6).
 *
 *   TAMBAHAN: daya pancar WiFi di-SET LANGSUNG ke daya rendah (lihat
 *   WIFI_TX_POWER di bawah). Sebelumnya ada logika adaptif (coba daya tinggi
 *   dulu, fallback ke rendah kalau gagal connect dalam 45 detik), tapi di
 *   lapangan SEMUA board (Cisangkuy & Ciminyak) selalu berakhir di daya
 *   rendah -- board ESP32-C3 kecil/"SuperMini" ini memang tidak bisa connect
 *   di daya tinggi (WiFi tetap TERDETEKSI, tapi gagal connect). Jadi logika
 *   adaptif itu dihapus: langsung pakai daya rendah dari awal, supaya boot
 *   tidak lagi menunggu percobaan daya tinggi yang pasti gagal.
 *
 * CATATAN: file ini adalah firmware yang sama dengan versi Ciminyak (OTA +
 * log jarak jauh + perbaikan efisiensi & WiFi daya rendah), hanya DEVICE_ID
 * yang dibedakan (1 = Cisangkuy). WAJIB diflash manual lewat USB sekali
 * untuk memasukkan perubahan TX power ini - lihat FW_VERSION di bawah.
 *
 * SERIAL MONITOR WEB (device_console): sekarang menampung SEMUA kejadian
 * penting (WiFi connect/putus, RSSI, upload OK/GAGAL, sensor zero-streak,
 * memori rendah, dsb) lewat antrian kecil (lihat vlog()/logQueue di bawah),
 * bukan cuma baris pembacaan sampel seperti sebelumnya. Tetap pakai tabel
 * device_console & RPC trim_device_console yang SAMA, tidak ada perubahan
 * di Supabase.
 *
 * Library: "DFRobot_RainfallSensor" (https://github.com/DFRobot/DFRobot_RainfallSensor)
 * Board  : ESP32C3 Dev Module
 * Sensor : DIP switch di posisi I2C
 */

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <time.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
#include <Update.h>
#include <stdarg.h>
#include "DFRobot_RainfallSensor.h"

// =====================================================
//                    KONFIGURASI
// =====================================================
const char* WIFI_SSID = "NodeSensorWiFi1";   // SSID lokasi (sama dengan Ciminyak)
const char* WIFI_PASS = "muhammadnabiyullah";

// Supabase
const char *supabaseUrl       = "https://pykernnkhvnssplhzcvn.supabase.co";
const char *supabasePublicKey = "sb_publishable_coDPUa845ZtfYmoBWlZlgw_eH5vsCY7";
const char *supabaseTable     = "rainfall_readings";
// ID device (tabel rainfall_readings). Sama dengan id weather station di lokasi yang sama:
//   1 = Cisangkuy   |   2 = Ciminyak
// (tabelnya beda dengan weather station yang menulis ke tabel sensors, jadi tidak bentrok)
const int   DEVICE_ID         = 1;   // Cisangkuy

// Pin I2C ESP32-C3 (sesuaikan dengan wiring kamu!)
#define I2C_SDA_PIN 1
#define I2C_SCL_PIN 0

// Waktu
const long  GMT_OFFSET_SEC = 7 * 3600;   // WIB = UTC+7
const int   DST_OFFSET_SEC = 0;

// Jam reset akumulasi harian (WIB).
// NORMAL : RESET_HOUR 0, RESET_MINUTE 0  -> reset tiap tengah malam.
// TES    : isi jam beberapa menit ke depan, misalnya 0 dan 55 -> reset jam 00:55.
// Setelah tes, KEMBALIKAN ke 0 dan 0.
#define RESET_HOUR    0
#define RESET_MINUTE  0

// Data tersimpan di memori ESP (akumulasi harian + hujan yang belum terkirim) dihapus
// SEKALI saat angka ini berubah dari nilai yang tersimpan. Berguna untuk membuang sisa
// data tes. Naikkan angkanya (2 -> 3 -> ...) kalau suatu saat perlu mengulang.
#define STATE_VERSION 13   // dinaikkan dari firmware v10 sebelumnya (hapus sisa data lama sekali)

// Sampling. Sensor melaporkan COUNTER KUMULATIF (jumlah guling), bukan nilai
// sesaat -- jadi memperlambat sampling TIDAK membuang data hujan (lihat
// catatan efisiensi di atas file). 10 detik x 6 = tetap 1 menit per siklus,
// hanya pembacaan I2C & baris Serial yang 5x lebih sedikit dibanding sebelumnya.
const uint32_t SAMPLE_INTERVAL_MS  = 10000; // 10 detik
const uint8_t  SAMPLES_PER_MINUTE  = 6;     // 6 x 10 detik = 60 detik

// WiFi
const uint32_t WIFI_RETRY_MS           = 60000;              // coba sambung ulang tiap 60 detik (10 detik terlalu rapat: memutus koneksi yang lambat)
const uint32_t WIFI_RESTART_AFTER_MS   = 10UL * 60UL * 1000UL; // restart ESP kalau WiFi putus > 10 menit

// Daya pancar WiFi: LANGSUNG daya rendah, tidak ada lagi percobaan daya
// tinggi. Board ESP32-C3 kecil/"SuperMini" di semua lokasi (Cisangkuy &
// Ciminyak) terbukti selalu gagal connect di daya tinggi (walau WiFi tetap
// terdeteksi), jadi percobaan daya tinggi di awal cuma buang waktu boot
// tanpa pernah berhasil.
const wifi_power_t WIFI_TX_POWER = WIFI_POWER_8_5dBm;

// Sensor
const uint32_t SENSOR_RETRY_MS = 5000;   // kalau sensor belum terdeteksi, coba lagi tiap 5 detik

// Berapa kali pembacaan 0 yang MENCURIGAKAN (bukan 0 yang wajar) boleh terjadi
// berturut-turut sebelum dianggap gangguan I2C dan memicu scan+reinit sensor.
// Di interval sampling 10 detik, ambang 3x berarti terdeteksi dalam ~30 detik
// (sebelumnya: ambang 5x pada interval 2 detik = ~10 detik -- sedikit lebih
// lambat sekarang, trade-off wajar untuk 5x lebih sedikit pembacaan I2C).
// Naikkan kalau sensor kamu sesekali mengirim 0 palsu secara wajar.
const uint8_t ZERO_STREAK_LIMIT = 3;

// Curah hujan (mm) per SATU guling mangkuk. Spesifikasi SEN0575: resolusi 0,28 mm
// (0,2794 mm). ESP menghitung sendiri: mm = jumlah guling (tips) x MM_PER_TIP,
// karena nilai mm dari sensor (getRainfall) terbukti tidak ikut berubah.
// KALIBRASI: tuang air terukur ke corong, lalu
//   MM_PER_TIP = (10 x volume_mL / luas_corong_cm2) / jumlah_tips_terbaca
const float MM_PER_TIP = 0.2794f;

// Pengaman anti-hang
const uint32_t WDT_TIMEOUT_S   = 60;      // ESP di-reset otomatis kalau program macet > 60 detik
const uint32_t MIN_FREE_HEAP   = 50000;   // restart kalau memori bebas < 50 KB (byte)
const uint32_t MIN_MAX_ALLOC   = 45000;   // restart kalau blok memori kosong TERBESAR < 45 KB (memori terfragmentasi -> HTTPS gagal)
const uint8_t  UPLOAD_FAIL_RECONNECT = 5;  // 5 menit upload gagal (WiFi tersambung) -> sambung ulang WiFi
const uint8_t  UPLOAD_FAIL_RESTART   = 10; // 10 menit upload gagal -> restart ESP

// Mode tes TANPA sensor: 1 = pakai data hujan palsu (untuk mengetes WiFi + Supabase saja).
// PERHATIAN: data palsu ikut masuk ke tabel rainfall_readings. Hapus setelah tes:
//   delete from public.rainfall_readings;
// Kembalikan ke 0 sebelum dipasang di lokasi.
#define TEST_WITHOUT_SENSOR 0

// ---------- OTA (update firmware jarak jauh lewat Supabase Storage) ----------
// Nomor versi firmware YANG SEDANG DI-COMPILE. Naikkan angka ini SETIAP kali kamu
// upload .bin baru lewat halaman admin, dan isi angka yang SAMA di form upload-nya.
// (Kalau lupa menaikkan, lihat catatan appliedFwVersion di bawah - ada pengaman kedua
// supaya ESP tidak flash ulang versi yang sama berkali-kali.)
// CATATAN: pastikan angka ini LEBIH BESAR dari versi terakhir yang pernah
// diupload untuk Cisangkuy lewat halaman admin OTA (apa pun nomornya) --
// kalau lebih kecil/sama, ESP akan mengunduh ulang firmware lama itu lewat
// OTA 2 menit setelah boot.
const int FW_VERSION = 13;   // samakan dengan versi Ciminyak: kirim RSSI di tiap upload (lihat uploadToSupabase)

// Cek firmware baru tiap berapa lama. 2 menit: cukup responsif, dan satu kali cek
// hanya 1 request HTTP kecil (bukan download), jadi murah walau sering.
const uint32_t OTA_CHECK_INTERVAL_MS = 2UL * 60UL * 1000UL;

// ---------- Serial monitor jarak jauh (Run/Stop dari website) ----------
// ESP mengecek izin "verbose" tiap DEBUG_POLL_INTERVAL_MS. Sengaja tidak terlalu
// rapat (bukan tiap 1-2 detik) supaya TIDAK ada biaya tambahan saat tidak ada
// yang memantau (itu 99% dari waktu alat menyala). 20 detik = kompromi: terasa
// hidup saat dipantau, murah saat tidak.
const uint32_t DEBUG_POLL_INTERVAL_MS = 20UL * 1000UL;
// Selama izin masih berlaku, kirim baris log (identik dgn baris di Serial Monitor
// fisik) ke Supabase tiap ini. 3 detik: dekat real-time tanpa membebani HTTPS.
const uint32_t VERBOSE_LOG_INTERVAL_MS = 3UL * 1000UL;
// Baris tersimpan di Supabase (tabel device_console), dibuang otomatis di atas ini.
const uint8_t CONSOLE_KEEP_COUNT = 50;
// Buang baris lama tiap N kali kirim (bukan tiap kirim) - RPC trim tidak perlu
// dipanggil sesering push-nya sendiri, ini menghemat separuh request saat verbose.
const uint8_t CONSOLE_TRIM_EVERY = 10;

// ---------- Log ringkas ke Supabase (supaya bisa dipantau tanpa colok USB) ----------
// BUKAN mirror semua yang tampil di Serial (itu tiap 2 detik, akan penuh dalam
// hitungan detik). Satu baris dikirim tiap ada KEJADIAN PENTING: hasil upload tiap
// menit, boot, dan OTA. Baris lama dibuang otomatis, hanya LOG_KEEP_COUNT yang tersisa.
const uint8_t LOG_KEEP_COUNT = 5;

// =====================================================
//                    VARIABEL GLOBAL
// =====================================================
DFRobot_RainfallSensor_I2C Sensor(&Wire);
Preferences prefs;

uint8_t  sampleCount = 0;       // jumlah pembacaan 2 detik dalam menit ini
float    pendingRain = 0;       // hujan (mm) yang belum berhasil terkirim ke Supabase

uint32_t lastTips       = 0;    // jumlah guling (tips) pada pembacaan sebelumnya
bool     haveLast       = false;
float    dailyRain      = 0;    // curah hujan hari ini (mm), reset jam 00:00
int32_t  currentDay     = 0;    // format YYYYMMDD

uint32_t lastSampleMs = 0;
uint8_t  uploadFailStreak = 0;   // upload gagal berturut-turut (saat WiFi tersambung)
uint8_t  lowHeapStreak    = 0;   // menit berturut-turut memori rendah

// Status sensor
bool     sensorReady      = false;
uint32_t lastSensorTryMs  = 0;
uint8_t  zeroStreak       = 0;   // berapa pembacaan berturut-turut yang mendadak 0

// Status WiFi
uint32_t lastWifiAttemptMs = 0;
uint32_t wifiDownSince     = 0;
bool     wifiDown          = false;
bool     timeConfigured    = false;

// Status OTA
uint32_t lastOtaCheckMs  = 0;

// Status serial monitor jarak jauh
uint32_t lastDebugPollMs    = 0;
uint32_t lastVerbosePushMs  = 0;
uint8_t  verbosePushCounter = 0;
// Batas waktu (unix epoch UTC, BUKAN millis()) sampai kapan verbose boleh aktif.
// Dibandingkan langsung ke time(nullptr) tiap loop -- jadi walau polling
// berikutnya telat/gagal, mode verbose tetap otomatis padam TEPAT waktu
// (tidak bisa nyangkut aktif selamanya kalau internet putus di tengah jalan).
long verboseUntilEpoch = 0;
// Baris terakhir yang dicetak takeSample() (format SAMA PERSIS dengan Serial
// Monitor fisik). Dipush ke device_console oleh loop() saat verbose aktif,
// pada jadwalnya SENDIRI (bukan tiap sampel) - lihat VERBOSE_LOG_INTERVAL_MS.
char lastSampleLine[180] = "";
// Antrian baris log untuk Serial Monitor WEB (device_console). Dulu hanya
// lastSampleLine (baris sampel) yang dikirim; sekarang SEMUA kejadian
// penting (WiFi, upload, sensor, memori) juga masuk sini lewat vlog(),
// supaya yang terlihat di web sama lengkapnya dengan Serial Monitor fisik.
// Ring buffer sederhana: kalau penuh, baris TERLAMA dibuang duluan (baris
// terbaru lebih berguna daripada baris lama yang sudah basi).
#define LOG_QUEUE_SIZE 12
char    logQueue[LOG_QUEUE_SIZE][180];
uint8_t logQueueHead  = 0;   // index baris TERLAMA (yang akan dikirim berikutnya)
uint8_t logQueueCount = 0;   // berapa baris sedang mengantri
// Versi yang BENAR-BENAR tertanam di flash saat ini, tersimpan di NVS (bukan cuma
// angka FW_VERSION yang di-compile). Pengaman: kalau suatu saat lupa menaikkan
// FW_VERSION sebelum upload firmware baru, ESP tetap mencatat sendiri "saya sudah
// di versi X", jadi tidak mencoba flash ulang versi yang sama berkali-kali walau
// nomor di kode belum berubah.
int appliedFwVersion = 0;

// =====================================================
//                    FUNGSI BANTU
// =====================================================
void saveState();   // didefinisikan di bawah
void pushLog(const char* message);   // didefinisikan di bawah
void checkOta();                     // didefinisikan di bawah
void pollDebugFlag();                // didefinisikan di bawah
void pushConsoleLine();              // didefinisikan di bawah
void vlog(const char* fmt, ...);     // didefinisikan di bawah

// ---------- Watchdog: reset otomatis kalau program macet ----------
void setupWatchdog() {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  esp_task_wdt_config_t cfg;
  cfg.timeout_ms     = WDT_TIMEOUT_S * 1000;
  cfg.idle_core_mask = 0;      // hanya pantau task loop(), bukan idle task
  cfg.trigger_panic  = true;   // macet -> reset ESP
  if (esp_task_wdt_reconfigure(&cfg) != ESP_OK) {
    esp_task_wdt_init(&cfg);
  }
#else
  esp_task_wdt_init(WDT_TIMEOUT_S, true);
#endif
  esp_task_wdt_add(NULL);      // daftarkan task loop()
}

// ---------- Log jarak jauh (antrian untuk Serial Monitor WEB) ----------
// Masukkan satu baris ke logQueue. Kalau sudah penuh, baris TERLAMA dibuang
// (digeser) supaya baris baru selalu punya tempat.
void enqueueLog(const char* line) {
  if (logQueueCount >= LOG_QUEUE_SIZE) {
    logQueueHead = (logQueueHead + 1) % LOG_QUEUE_SIZE;
    logQueueCount--;
  }
  uint8_t idx = (logQueueHead + logQueueCount) % LOG_QUEUE_SIZE;
  strncpy(logQueue[idx], line, sizeof(logQueue[idx]) - 1);
  logQueue[idx][sizeof(logQueue[idx]) - 1] = '\0';
  logQueueCount++;
}

// Serial.printf + masuk ke antrian device_console sekaligus, dalam SATU
// panggilan. Dipakai di semua titik yang dulu cuma Serial.print/println/printf
// biasa, supaya kejadian itu juga terlihat di Serial Monitor WEB (bukan cuma
// di kabel USB) -- tanpa mengubah apa pun di sisi Supabase.
void vlog(const char* fmt, ...) {
  char buf[180];
  va_list args;
  va_start(args, fmt);
  vsnprintf(buf, sizeof(buf), fmt, args);
  va_end(args);
  Serial.println(buf);
  enqueueLog(buf);
}

// ---------- WiFi: dicoba terus sampai tersambung ----------
void applyTxPower() {
  WiFi.setTxPower(WIFI_TX_POWER);
}

// Diagnosis: tampilkan WiFi yang terlihat oleh ESP, dan apakah SSID kamu ada
void scanNetworks() {
  Serial.println("Mencari WiFi di sekitar...");
  int n = WiFi.scanNetworks();
  if (n <= 0) {
    Serial.println("Tidak ada WiFi terdeteksi sama sekali (cek antena / board).");
    return;
  }
  bool found = false;
  for (int i = 0; i < n; i++) {
    bool match = (WiFi.SSID(i) == WIFI_SSID);
    if (match) found = true;
    Serial.printf("  %s%s  (%d dBm, channel %d)\n",
                  match ? "-> " : "   ", WiFi.SSID(i).c_str(), WiFi.RSSI(i), WiFi.channel(i));
  }
  Serial.println(found
    ? "SSID kamu TERDETEKSI."
    : "SSID kamu TIDAK terdeteksi (salah nama, WiFi 5 GHz, atau terlalu jauh).");
  WiFi.scanDelete();
}

void startWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  applyTxPower();
  lastWifiAttemptMs = millis();
}

// Dipanggil terus-menerus dari loop(). Tidak memblokir, jadi sensor tetap dibaca
// walaupun WiFi sedang putus.
void maintainWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    if (wifiDown) {
      wifiDown = false;
      vlog("\nWiFi tersambung, IP: %s, RSSI: %d dBm",
           WiFi.localIP().toString().c_str(), WiFi.RSSI());
    }
    if (!timeConfigured) {   // mulai sinkron waktu NTP setelah internet ada
      configTime(GMT_OFFSET_SEC, DST_OFFSET_SEC, "pool.ntp.org", "time.google.com");
      timeConfigured = true;
    }
    return;
  }

  uint32_t now = millis();

  if (!wifiDown) {           // baru putus, atau memang belum pernah tersambung
    wifiDown = true;
    wifiDownSince = now;
    vlog("\nWiFi tidak tersambung, mencoba terus...");
  }

  // Coba sambung ulang tiap WIFI_RETRY_MS
  if (now - lastWifiAttemptMs >= WIFI_RETRY_MS) {
    // status: 1 = SSID tidak ditemukan, 4 = gagal connect (biasanya password/keamanan), 6 = terputus
    vlog("Coba sambung WiFi lagi... (status=%d)", (int)WiFi.status());
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    applyTxPower();
    lastWifiAttemptMs = now;
  }

  // Kalau terlalu lama putus, restart ESP (mengatasi WiFi yang "nyangkut")
  if (now - wifiDownSince >= WIFI_RESTART_AFTER_MS) {
    Serial.println("WiFi putus terlalu lama, restart ESP...");
    // CATATAN: WiFi sedang putus saat ini, jadi pushLog di sini TIDAK akan terkirim
    // (fungsinya sendiri langsung pulang kalau WL_CONNECTED gagal). Alasan restart ini
    // tetap terlihat lewat resetReasonName("SW") di log Serial saat ESP nyala lagi.
    saveState();
    delay(200);
    ESP.restart();
  }
}

// Dipakai saat ESP baru menyala: tahan di sini sampai WiFi tersambung
void waitForWiFi() {
  WiFi.mode(WIFI_STA);
  scanNetworks();   // diagnosis: apakah SSID terlihat oleh ESP?
  startWiFi();
  Serial.print("Menghubungkan WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    esp_task_wdt_reset();   // menunggu WiFi itu normal, bukan hang (ada batas 10 menit sendiri)
    maintainWiFi();
  }
  maintainWiFi();   // cetak IP + mulai NTP
  vlog("Kekuatan sinyal (RSSI): %d dBm (daya pancar: RENDAH)", WiFi.RSSI());
}

// Kode "hari" (YYYYMMDD) yang berganti tepat di jam reset (RESET_HOUR:RESET_MINUTE).
// Caranya: waktu digeser mundur sebesar jam reset, jadi "hari baru" dimulai di jam itu.
// Mengembalikan 0 kalau waktu belum sinkron NTP.
int32_t todayKey() {
  time_t now = time(nullptr);
  if (now < 1700000000) return 0;   // belum sinkron NTP
  now -= (time_t)RESET_HOUR * 3600 + (time_t)RESET_MINUTE * 60;

  struct tm t;
  localtime_r(&now, &t);
  return (t.tm_year + 1900) * 10000 + (t.tm_mon + 1) * 100 + t.tm_mday;
}

// Jam sekarang (WIB) untuk ditampilkan di log. Memakai buffer tetap (bukan String)
// supaya tidak mengalokasi memori heap tiap 2 detik.
const char* timeStr() {
  static char buf[16];
  struct tm t;
  if (!getLocalTime(&t, 10)) return "--:--:--";
  snprintf(buf, sizeof(buf), "%02d:%02d:%02d", t.tm_hour, t.tm_min, t.tm_sec);
  return buf;
}

void saveState() {
  prefs.putFloat("daily", dailyRain);
  prefs.putFloat("pend", pendingRain);
  prefs.putInt("day", currentDay);
  if (haveLast) {
    prefs.putUInt("tips", lastTips);   // posisi guling: guling yang terjadi saat restart tetap terhitung
    prefs.putBool("hasTips", true);
  }
}

// Cek pergantian hari -> reset ke 0 jam 00:00
void checkNewDay() {
  int32_t key = todayKey();
  if (key == 0) return;  // NTP belum sinkron

  if (key != currentDay) {
    Serial.printf("=== RESET HARIAN jam %02d:%02d (kode hari %ld). Akumulasi harian di-nol-kan. ===\n",
                  RESET_HOUR, RESET_MINUTE, (long)key);
    dailyRain  = 0;
    currentDay = key;
    saveState();
  }
}

// Diagnosis: tampilkan semua perangkat I2C yang menjawab di bus.
// Kalau kosong -> masalah kabel SDA/SCL/daya sensor, bukan masalah kode.
void i2cScan() {
  Serial.print("Scan I2C:");
  int found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf(" 0x%02X", addr);
      found++;
    }
    esp_task_wdt_reset();
  }
  if (found == 0) {
    Serial.print(" (tidak ada perangkat I2C yang menjawab -> cek kabel SDA/SCL, daya 3.3V, DIP switch)");
  }
  Serial.println();
}

// Coba inisialisasi sensor. Aman dipanggil berulang.
bool initSensor() {
#if TEST_WITHOUT_SENSOR
  Serial.println("MODE TES: sensor palsu aktif (data hujan tidak nyata!)");
  lastTips = 0;
  haveLast = true;
  sensorReady = true;
  return true;
#else
  if (!Sensor.begin()) return false;

  Serial.print("Firmware sensor: ");
  Serial.println(Sensor.getFirmwareVersion());
  Serial.printf("VID: 0x%X  PID: 0x%X\n", (unsigned)Sensor.vid, (unsigned)Sensor.pid);

  // Titik awal pembacaan (hanya sekali). Kalau sensor sempat tidak terbaca lalu
  // pulih, baseline lama DIPERTAHANKAN supaya hujan yang turun selama itu
  // tetap terhitung di pembacaan berikutnya.
  if (!haveLast) {
    lastTips = Sensor.getRawData();
    haveLast = true;
  }
  zeroStreak = 0;
  sensorReady = true;
  return true;
#endif
}

// Ambil 1 sampel dari sensor.
// Hujan dihitung dari JUMLAH GULING (tips): mm = tips x MM_PER_TIP.
void takeSample() {
#if TEST_WITHOUT_SENSOR
  uint32_t tips = lastTips + ((random(0, 3) == 0) ? 1 : 0);   // sesekali "guling"
#else
  uint32_t tips = Sensor.getRawData();
#endif
  uint32_t effectiveTips = tips;
  bool ignoredZero = false;

  if (haveLast) {
    uint32_t deltaTips = 0;
    if (tips >= lastTips) {
      deltaTips = tips - lastTips;
    } else if (tips == 0) {
      // Kemungkinan gagal baca I2C (0 mendadak): abaikan, jangan dihitung
      effectiveTips = lastTips;
      ignoredZero = true;
    } else {
      deltaTips = tips;   // sensor restart -> hitungan mulai dari nol lagi
    }

    float deltaMm = deltaTips * MM_PER_TIP;
    dailyRain   += deltaMm;
    pendingRain += deltaMm;
    if (deltaTips > 0) {
      vlog(">>> HUJAN TERDETEKSI: +%lu guling = +%.4f mm",
           (unsigned long)deltaTips, deltaMm);
    }
  }
  lastTips = effectiveTips;
  haveLast = true;

  sampleCount++;

  // tips  = jumlah guling dari sensor (angka mentah)
  // total = guling x MM_PER_TIP (mm sejak sensor menyala)
  // Diformat SEKALI ke lastSampleLine: dipakai untuk Serial Monitor fisik DAN
  // (kalau verbose aktif) dikirim apa adanya ke device_console, supaya keduanya
  // identik. Tanpa "\n" di buffer -- kolom `message` di Supabase satu baris polos.
  snprintf(lastSampleLine, sizeof(lastSampleLine),
           "[%s] Sample %2u/%u | tips: %lu | total: %.2f mm | pending: %.4f | daily: %.2f mm",
           timeStr(), sampleCount, SAMPLES_PER_MINUTE,
           (unsigned long)tips, effectiveTips * MM_PER_TIP, pendingRain, dailyRain);
  Serial.println(lastSampleLine);
  enqueueLog(lastSampleLine);   // baris sampel juga ikut ke Serial Monitor WEB

  // Nol mendadak yang berulang = sensor tidak menjawab atau memang restart.
  if (ignoredZero) {
    zeroStreak++;
    vlog("!!! Pembacaan 0 diabaikan (%u kali berturut-turut) - kabel I2C longgar atau sensor restart?",
         (unsigned)zeroStreak);
  } else {
    zeroStreak = 0;
  }

#if !TEST_WITHOUT_SENSOR
  if (zeroStreak >= ZERO_STREAK_LIMIT) {
    zeroStreak = 0;
    i2cScan();
    if (!Sensor.begin()) {
      vlog("Sensor TIDAK merespons -> dianggap gagal I2C, mencoba lagi otomatis.");
      sensorReady = false;
    } else if (Sensor.getRawData() == 0) {
      vlog("Sensor melaporkan 0 terus -> dianggap sensor restart, baseline di-nol-kan.");
      lastTips = 0;
    }
  }
#endif
}

bool uploadToSupabase(float rainMm, float dailyMm) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi putus, upload dilewati (data menit ini tidak terkirim)");
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();   // skip verifikasi sertifikat (simple). Untuk produksi, pakai setCACert()
  client.setHandshakeTimeout(10);   // detik. Bawaannya 120 detik, terlalu lama kalau server macet

  HTTPClient http;
  String url = String(supabaseUrl) + "/rest/v1/" + supabaseTable;

  if (!http.begin(client, url)) {
    Serial.println("HTTP begin gagal");
    return false;
  }
  http.setConnectTimeout(5000);   // ms
  // PERBAIKAN: sebelumnya 8000ms, lebih PENDEK dari batas jabat tangan TLS di
  // atas (10 detik) -- koneksi yang masih dalam proses jabat tangan bisa
  // keburu dianggap gagal oleh batas ini duluan. Dinaikkan supaya tidak lebih
  // ketat dari batas jabat tangannya sendiri.
  http.setTimeout(12000);         // ms

  // Publishable key (sb_publishable_...) bukan JWT -> cukup kirim lewat header apikey,
  // JANGAN dikirim di header Authorization: Bearer.
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", supabasePublicKey);
  http.addHeader("Prefer", "return=minimal");

  // rain_mm  = hujan sejak pengiriman sukses sebelumnya (dipakai untuk akumulasi 1/3/6/12/24 jam)
  // rainfall = akumulasi hujan hari ini sejak 00:00 WIB
  // rssi     = kekuatan sinyal WiFi (dBm, negatif) SAAT upload ini, supaya dashboard
  //            bisa menampilkan status sinyal per lokasi (lihat supabase/sql/015_rainfall_rssi.sql)
  // (id & created_at diisi otomatis oleh Supabase)
  char payload[180];
  snprintf(payload, sizeof(payload),
           "{\"device_id\":%d,\"rain_mm\":%.4f,\"rainfall\":%.2f,\"rssi\":%d}",
           DEVICE_ID, rainMm, dailyMm, WiFi.RSSI());

  int code = http.POST((uint8_t*)payload, strlen(payload));
  vlog("Upload -> HTTP %d | RSSI %d dBm | %s", code, WiFi.RSSI(), payload);
  if (code < 0) vlog("%s", http.errorToString(code).c_str());

  http.end();
  return (code >= 200 && code < 300);
}

// Dipanggil tiap 1 menit (setelah 30 sampel terkumpul)
void sendMinuteData() {
  bool ok = uploadToSupabase(pendingRain, dailyRain);

  if (ok) {
    vlog("Upload sukses");
    pendingRain = 0;
    uploadFailStreak = 0;
    char m[96];
    snprintf(m, sizeof(m), "Upload OK | pending 0.00 | daily %.2f mm", dailyRain);
    pushLog(m);
  } else {
    // Hujan TIDAK hilang: tetap di pendingRain dan ikut terkirim di pengiriman berikutnya
    vlog("Upload GAGAL, %.4f mm ditunda ke pengiriman berikutnya", pendingRain);
    {
      char m[96];
      snprintf(m, sizeof(m), "Upload GAGAL (%ux) | pending %.4f mm tertunda", (unsigned)(uploadFailStreak + 1), pendingRain);
      pushLog(m);
    }

    // WiFi tersambung tapi upload gagal terus = internet/DNS macet atau memori HTTPS habis.
    // Dulu kondisi ini TIDAK pernah dipulihkan. (Kalau WiFi memang putus, ditangani maintainWiFi.)
    if (WiFi.status() == WL_CONNECTED) {
      uploadFailStreak++;
      if (uploadFailStreak == UPLOAD_FAIL_RECONNECT) {
        vlog("Upload gagal 5x berturut-turut -> sambung ulang WiFi");
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASS);
        applyTxPower();
      } else if (uploadFailStreak >= UPLOAD_FAIL_RESTART) {
        vlog("Upload gagal 10x berturut-turut -> restart ESP");
        pushLog("Restart: upload gagal 10x berturut-turut");   // WiFi masih tersambung, jadi ini masih bisa terkirim
        saveState();
        delay(200);
        ESP.restart();
      }
    }
  }

  sampleCount = 0;
  saveState();

  // Pantau memori: total bebas DAN blok kosong terbesar. HTTPS butuh satu blok besar; memori
  // yang terfragmentasi bisa membuat HTTPS gagal walau totalnya kelihatan cukup. Harus rendah
  // 3 menit berturut-turut sebelum restart supaya lonjakan sesaat tidak memicu restart.
  uint32_t freeHeap = ESP.getFreeHeap();
  uint32_t maxBlock = ESP.getMaxAllocHeap();
  vlog("Memori bebas: %u byte (blok terbesar %u)", (unsigned)freeHeap, (unsigned)maxBlock);
  if (freeHeap < MIN_FREE_HEAP || maxBlock < MIN_MAX_ALLOC) {
    if (++lowHeapStreak >= 3) {
      vlog("Memori menipis/terfragmentasi, restart...");
      pushLog("Restart: memori menipis/terfragmentasi");
      saveState();
      delay(200);
      ESP.restart();
    }
  } else {
    lowHeapStreak = 0;
  }
}

// =====================================================
//        OTA (Supabase Storage) & LOG RINGKAS
// =====================================================
// Ambil satu nilai integer dari JSON sederhana, mis. cari "version":123 -> 123.
// Bukan parser JSON umum: cukup untuk respons PostgREST yang bentuknya kita tahu persis.
long jsonFindInt(const String &body, const char *key, long fallback) {
  String needle = String("\"") + key + "\":";
  int pos = body.indexOf(needle);
  if (pos < 0) return fallback;
  return body.substring(pos + needle.length()).toInt();
}

// Ambil satu nilai string dari JSON sederhana, mis. cari "file_url":"https://..." -> https://...
// Mengembalikan string kosong kalau key tidak ada (BUKAN kesalahan: dipakai juga untuk
// kolom opsional seperti md5 yang boleh kosong).
String jsonFindString(const String &body, const char *key) {
  String needle = String("\"") + key + "\":\"";
  int pos = body.indexOf(needle);
  if (pos < 0) return "";
  pos += needle.length();
  int end = body.indexOf('"', pos);
  if (end < 0) return "";
  return body.substring(pos, end);
}

// Kirim satu baris status ke tabel device_logs, lalu minta Supabase membuang baris
// lama (RPC trim_device_logs) supaya cuma LOG_KEEP_COUNT baris TERBARU yang tersisa
// per device. Dipanggil untuk kejadian penting saja (lihat komentar LOG_KEEP_COUNT
// di atas), bukan tiap sampel 2 detik.
void pushLog(const char* message) {
  if (WiFi.status() != WL_CONNECTED) return;   // jangan buang waktu kalau memang belum ada internet

  WiFiClientSecure client;
  client.setInsecure();
  client.setHandshakeTimeout(10);
  HTTPClient http;
  http.setConnectTimeout(5000);
  http.setTimeout(8000);

  String url = String(supabaseUrl) + "/rest/v1/device_logs";
  if (!http.begin(client, url)) return;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", supabasePublicKey);
  http.addHeader("Prefer", "return=minimal");

  char payload[220];
  snprintf(payload, sizeof(payload), "{\"device_id\":%d,\"message\":\"%s\"}", DEVICE_ID, message);
  int code = http.POST((uint8_t*)payload, strlen(payload));
  http.end();
  if (code != 200 && code != 201) {
    Serial.printf("Log ke Supabase gagal (HTTP %d), diabaikan (tidak kritis)\n", code);
    return;
  }

  // Buang baris lama lewat RPC (dibuat SECURITY DEFINER di SQL, supaya ESP dengan
  // publishable key tidak perlu izin DELETE langsung ke tabel).
  WiFiClientSecure client2;
  client2.setInsecure();
  client2.setHandshakeTimeout(10);
  HTTPClient http2;
  http2.setConnectTimeout(5000);
  http2.setTimeout(8000);
  String rpcUrl = String(supabaseUrl) + "/rest/v1/rpc/trim_device_logs";
  if (!http2.begin(client2, rpcUrl)) return;
  http2.addHeader("Content-Type", "application/json");
  http2.addHeader("apikey", supabasePublicKey);
  char rpcPayload[64];
  snprintf(rpcPayload, sizeof(rpcPayload), "{\"p_device_id\":%d,\"p_keep\":%d}", DEVICE_ID, (int)LOG_KEEP_COUNT);
  http2.POST((uint8_t*)rpcPayload, strlen(rpcPayload));
  http2.end();
}

// Unduh file firmware dari Supabase Storage lalu flash. Dipanggil hanya kalau
// checkOta() menemukan versi yang LEBIH BARU dari appliedFwVersion.
bool applyOta(const String &url, const String &md5, int newVersion) {
  Serial.printf("OTA: firmware v%d terdeteksi, mengunduh dari %s\n", newVersion, url.c_str());
  {
    char m[96];
    snprintf(m, sizeof(m), "OTA: unduh firmware v%d dimulai", newVersion);
    pushLog(m);
  }

  WiFiClientSecure client;
  client.setInsecure();
  client.setHandshakeTimeout(15);
  HTTPClient http;
  http.setConnectTimeout(8000);
  http.setTimeout(20000);   // file bisa >1 MB; beri waktu lebih dari upload data biasa
  if (!http.begin(client, url)) {
    Serial.println("OTA: http.begin gagal");
    pushLog("OTA GAGAL: http.begin gagal");
    return false;
  }

  int code = http.GET();
  if (code != 200) {
    Serial.printf("OTA: unduh gagal, HTTP %d\n", code);
    char m[64];
    snprintf(m, sizeof(m), "OTA GAGAL: unduh HTTP %d", code);
    pushLog(m);
    http.end();
    return false;
  }

  int len = http.getSize();
  if (len <= 0) {
    Serial.println("OTA: ukuran file tidak diketahui, dibatalkan");
    pushLog("OTA GAGAL: ukuran file tidak valid");
    http.end();
    return false;
  }

  // Proses tulis flash bisa memakan waktu lebih lama dari batas watchdog normal (60 detik)
  // kalau sinyal WiFi lemah. Lepaskan loop() dari watchdog SELAMA proses ini saja (tidak ada
  // task lain yang perlu dipantau di sketch single-loop ini), lalu daftarkan lagi setelahnya
  // apa pun hasilnya.
  esp_task_wdt_delete(NULL);

  bool ok = false;
  if (md5.length() == 32) {
    Update.setMD5(md5.c_str());   // verifikasi integritas file kalau checksum disediakan
  }
  if (!Update.begin(len)) {
    Serial.printf("OTA: Update.begin gagal (%s)\n", Update.errorString());
  } else {
    WiFiClient *stream = http.getStreamPtr();
    size_t written = Update.writeStream(*stream);
    if (written != (size_t)len) {
      Serial.printf("OTA: hanya %u/%d byte tertulis\n", (unsigned)written, len);
    } else if (!Update.end()) {
      Serial.printf("OTA: Update.end gagal (%s)\n", Update.errorString());
    } else if (!Update.isFinished()) {
      Serial.println("OTA: proses belum selesai (tidak diketahui sebabnya)");
    } else {
      ok = true;
    }
  }
  http.end();
  esp_task_wdt_add(NULL);   // daftar lagi ke watchdog sebelum lanjut

  if (ok) {
    Serial.printf("OTA: SUKSES ke v%d, restart...\n", newVersion);
    appliedFwVersion = newVersion;
    prefs.putInt("fwver", appliedFwVersion);   // dicatat SEBELUM restart: pengaman anti flash-ulang
    char m[64];
    snprintf(m, sizeof(m), "OTA sukses -> v%d, restart", newVersion);
    pushLog(m);   // ini POST biasa (blocking): selesai dulu sebelum baris di bawah restart
    saveState();
    delay(300);
    ESP.restart();
  } else {
    char m[96];
    snprintf(m, sizeof(m), "OTA GAGAL saat flashing v%d (%s)", newVersion, Update.errorString());
    pushLog(m);
  }
  return ok;
}

// Tanya Supabase: ada firmware lebih baru untuk device ini? Kalau ada -> applyOta().
// Kalau belum ada firmware yang pernah diupload untuk device ini, itu kondisi NORMAL
// (bukan error) - dilewati begitu saja.
void checkOta() {
  WiFiClientSecure client;
  client.setInsecure();
  client.setHandshakeTimeout(10);
  HTTPClient http;
  http.setConnectTimeout(5000);
  http.setTimeout(8000);

  String url = String(supabaseUrl) + "/rest/v1/device_firmware_latest?device_id=eq." +
               String(DEVICE_ID) + "&select=version,file_url,md5&limit=1";
  if (!http.begin(client, url)) return;
  http.addHeader("apikey", supabasePublicKey);
  int code = http.GET();
  if (code != 200) {
    if (code > 0) Serial.printf("OTA: cek versi HTTP %d\n", code);
    http.end();
    return;
  }
  String body = http.getString();
  http.end();

  if (body.indexOf("\"version\"") < 0) return;   // "[]" -> belum ada firmware terdaftar untuk device ini

  long remoteVersion = jsonFindInt(body, "version", -1);
  if (remoteVersion <= 0 || remoteVersion <= appliedFwVersion) return;   // sudah versi terbaru

  String fileUrl = jsonFindString(body, "file_url");
  if (fileUrl.length() == 0) {
    Serial.println("OTA: file_url kosong di respons, dibatalkan");
    return;
  }
  String md5 = jsonFindString(body, "md5");

  applyOta(fileUrl, md5, (int)remoteVersion);
}

// Tanya Supabase: apakah izin "verbose" masih berlaku untuk device ini?
// Mengambil run_until dalam bentuk EPOCH (angka detik unix) langsung dari view
// SQL (bukan teks ISO8601), supaya ESP tidak perlu parser tanggal - cukup
// bandingkan dua angka. "[]" (belum pernah di-set / sudah none) = tidak verbose.
void pollDebugFlag() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();
  client.setHandshakeTimeout(10);
  HTTPClient http;
  http.setConnectTimeout(5000);
  http.setTimeout(8000);

  String url = String(supabaseUrl) + "/rest/v1/device_debug_status?device_id=eq." +
               String(DEVICE_ID) + "&select=run_until_epoch&limit=1";
  if (!http.begin(client, url)) return;
  http.addHeader("apikey", supabasePublicKey);
  int code = http.GET();
  if (code != 200) { http.end(); return; }
  String body = http.getString();
  http.end();

  // Tidak ada baris (belum pernah diset dari website) -> anggap tidak verbose.
  verboseUntilEpoch = (body.indexOf("run_until_epoch") < 0) ? 0 : jsonFindInt(body, "run_until_epoch", 0);
}

// Kirim SATU baris TERLAMA dari logQueue ke device_console. Dipanggil dari
// loop() HANYA selama verbose aktif, pada jadwal VERBOSE_LOG_INTERVAL_MS
// sendiri (terpisah dari kecepatan sampling sensor). Dulu hanya mengirim
// lastSampleLine (baris sampel terakhir); sekarang mengirim ISI ANTRIAN
// (logQueue) yang berisi SEMUA kejadian penting -- WiFi, upload, sensor,
// memori -- bukan cuma baris sampel, lewat vlog() di titik-titik itu.
// Kalau kirim GAGAL, baris itu TIDAK dibuang dari antrian -- dicoba lagi di
// panggilan berikutnya, supaya baris log tidak hilang gara-gara satu kali
// internet tersendat.
void pushConsoleLine() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (logQueueCount == 0) return;   // antrian kosong, tidak ada yang perlu dikirim

  WiFiClientSecure client;
  client.setInsecure();
  client.setHandshakeTimeout(10);
  HTTPClient http;
  http.setConnectTimeout(5000);
  http.setTimeout(8000);

  String url = String(supabaseUrl) + "/rest/v1/device_console";
  if (!http.begin(client, url)) return;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", supabasePublicKey);
  http.addHeader("Prefer", "return=minimal");

  char payload[220];
  snprintf(payload, sizeof(payload), "{\"device_id\":%d,\"message\":\"%s\"}", DEVICE_ID, logQueue[logQueueHead]);
  int code = http.POST((uint8_t*)payload, strlen(payload));
  http.end();
  if (code != 200 && code != 201) return;   // gagal -> baris TETAP di antrian, dicoba lagi berikutnya

  // Baru boleh dianggap terkirim & dibuang dari antrian kalau HTTP benar-benar sukses.
  logQueueHead = (logQueueHead + 1) % LOG_QUEUE_SIZE;
  logQueueCount--;

  // Buang baris lama HANYA tiap CONSOLE_TRIM_EVERY kali (bukan tiap kirim) - menghemat
  // separuh request selama verbose aktif. Sedikit "kelebihan" sementara di database
  // (maks CONSOLE_TRIM_EVERY - 1 baris di atas 50) tidak masalah, akan dipangkas lagi.
  if (++verbosePushCounter >= CONSOLE_TRIM_EVERY) {
    verbosePushCounter = 0;
    WiFiClientSecure client2;
    client2.setInsecure();
    client2.setHandshakeTimeout(10);
    HTTPClient http2;
    http2.setConnectTimeout(5000);
    http2.setTimeout(8000);
    String rpcUrl = String(supabaseUrl) + "/rest/v1/rpc/trim_device_console";
    if (!http2.begin(client2, rpcUrl)) return;
    http2.addHeader("Content-Type", "application/json");
    http2.addHeader("apikey", supabasePublicKey);
    char rpcPayload[64];
    snprintf(rpcPayload, sizeof(rpcPayload), "{\"p_device_id\":%d,\"p_keep\":%d}", DEVICE_ID, (int)CONSOLE_KEEP_COUNT);
    http2.POST((uint8_t*)rpcPayload, strlen(rpcPayload));
    http2.end();
  }
}

// =====================================================
//                       SETUP
// =====================================================// =====================================================
//                       SETUP
// =====================================================
void setup() {
  Serial.begin(115200);
#if ARDUINO_USB_CDC_ON_BOOT
  Serial.setTxTimeoutMs(0);   // jangan menunggu kalau kabel USB tidak terhubung ke komputer
#endif
  delay(1500);
  Serial.println("\n=== Rainfall logger SEN0575 -> Supabase ===");

  setupWatchdog();

  // Alasan reset terakhir: POWERON=listrik, SW=restart lewat program, PANIC=crash,
  // TASK_WDT/INT_WDT/WDT=macet lalu di-reset watchdog, BROWNOUT=tegangan turun (catu daya lemah)
  {
    static const char* const names[] = {"UNKNOWN", "POWERON", "EXT", "SW", "PANIC", "INT_WDT",
                                        "TASK_WDT", "WDT", "DEEPSLEEP", "BROWNOUT", "SDIO"};
    int rr = (int)esp_reset_reason();
    Serial.printf("Alasan reset terakhir: %s\n", (rr >= 0 && rr <= 10) ? names[rr] : "OTHER");
  }

  // Restore data harian (kalau ESP restart di tengah hari)
  prefs.begin("rain", false);
  if (prefs.getInt("ver", 0) != STATE_VERSION) {
    Serial.println("Data tersimpan lama dihapus (sekali, karena STATE_VERSION berubah).");
    prefs.clear();
    prefs.putInt("ver", STATE_VERSION);
  }
  dailyRain   = prefs.getFloat("daily", 0);
  pendingRain = prefs.getFloat("pend", 0);
  currentDay  = prefs.getInt("day", 0);
  if (prefs.getBool("hasTips", false)) {
    lastTips = prefs.getUInt("tips", 0);
    haveLast = true;
  }
  // Versi firmware yang TERTANAM SAAT INI. Kalau belum pernah di-OTA, defaultnya
  // ya FW_VERSION yang di-compile (lihat komentar appliedFwVersion di atas).
  appliedFwVersion = prefs.getInt("fwver", FW_VERSION);
  if (appliedFwVersion < FW_VERSION) appliedFwVersion = FW_VERSION;   // firmware baru diupload via USB manual

  // I2C dengan pin custom (harus sebelum Sensor.begin)
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setTimeOut(100);   // ms. Bus I2C yang macet tidak boleh menahan program
  i2cScan();

  // Sensor: coba beberapa kali. Kalau tetap gagal, JANGAN berhenti di sini:
  // lanjut ke WiFi dulu, dan sensor dicoba lagi otomatis di loop().
  for (int i = 0; i < 3 && !sensorReady; i++) {
    if (!initSensor()) {
      Serial.println("Sensor belum terdeteksi. Cek wiring / DIP switch I2C...");
      delay(1000);
    }
  }
  if (!sensorReady) {
    Serial.println("Lanjut tanpa sensor dulu (akan dicoba lagi otomatis).");
  }

  // WiFi: tahan di sini sampai tersambung (NTP dimulai otomatis setelah tersambung)
  waitForWiFi();

  Serial.print("Sinkron waktu NTP");
  uint32_t start = millis();
  while (todayKey() == 0 && millis() - start < 15000) {
    delay(500);
    Serial.print(".");
    esp_task_wdt_reset();
  }
  Serial.println(todayKey() ? "\nWaktu OK" : "\nWaktu belum sinkron (akan dicoba terus)");

  checkNewDay();
  lastSampleMs   = millis();
  lastOtaCheckMs = millis();   // cek OTA pertama ~OTA_CHECK_INTERVAL_MS setelah boot ini (lihat loop())

  {
    char m[96];
    snprintf(m, sizeof(m), "Boot: v%d (firmware terpasang v%d)", FW_VERSION, appliedFwVersion);
    pushLog(m);
  }
}

// =====================================================
//                        LOOP
// =====================================================
void loop() {
  esp_task_wdt_reset();   // tanda "masih hidup": kalau berhenti > WDT_TIMEOUT_S, ESP di-reset
  maintainWiFi();         // sambung ulang WiFi kalau putus (tidak memblokir)

  // Cek firmware baru tiap OTA_CHECK_INTERVAL_MS. Ditaruh SEBELUM pengecekan sensor di
  // bawah supaya OTA tetap jalan walau sensor curah hujan sedang mati (justru saat itu
  // update jarak jauh paling berguna).
  if (WiFi.status() == WL_CONNECTED && millis() - lastOtaCheckMs >= OTA_CHECK_INTERVAL_MS) {
    lastOtaCheckMs = millis();
    checkOta();
  }

  // Serial monitor jarak jauh: cek izin verbose tiap DEBUG_POLL_INTERVAL_MS, dan
  // kalau sedang berlaku (dibandingkan ke jam sekarang, BUKAN ke waktu polling
  // terakhir), kirim baris log tiap VERBOSE_LOG_INTERVAL_MS. Keduanya juga
  // ditaruh SEBELUM pengecekan sensor supaya tetap jalan walau sensor mati.
  if (millis() - lastDebugPollMs >= DEBUG_POLL_INTERVAL_MS) {
    lastDebugPollMs = millis();
    pollDebugFlag();
  }
  bool verboseNow = (verboseUntilEpoch > 0) && (time(nullptr) < (time_t)verboseUntilEpoch);
  if (verboseNow && millis() - lastVerbosePushMs >= VERBOSE_LOG_INTERVAL_MS) {
    lastVerbosePushMs = millis();
    pushConsoleLine();
  }

  // Sensor belum terdeteksi -> coba lagi berkala, dan jangan kirim data apa pun
  if (!sensorReady) {
    if (millis() - lastSensorTryMs >= SENSOR_RETRY_MS) {
      lastSensorTryMs = millis();
      if (!initSensor()) {
        Serial.println("Sensor belum terdeteksi. Cek wiring / DIP switch I2C...");
      }
    }
    return;
  }

  if (millis() - lastSampleMs >= SAMPLE_INTERVAL_MS) {
    lastSampleMs = millis();

    checkNewDay();   // reset ke 0 jam 00:00
    takeSample();

    if (sampleCount >= SAMPLES_PER_MINUTE) {
      sendMinuteData();
    }
  }
}
