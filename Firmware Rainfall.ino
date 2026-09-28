/*
 * Rainfall logger: DFRobot SEN0575 (I2C) + ESP32-C3 -> Supabase
 *
 * - Baca sensor tiap 2 detik (30 pembacaan = 1 menit)
 * - Tiap 1 menit kirim ke Supabase:
 *     rain_mm  = jumlah hujan sejak pengiriman sukses sebelumnya (normalnya 1 menit)
 *     rainfall = akumulasi hujan hari ini (reset ke 0 di RESET_HOUR:RESET_MINUTE WIB via NTP)
 *   Akumulasi 1/3/6/12/24 jam dihitung di Supabase (view rainfall_summary)
 *   dengan menjumlahkan rain_mm.
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
#include <esp_task_wdt.h>
#include "DFRobot_RainfallSensor.h"

// =====================================================
//                    KONFIGURASI
// =====================================================
const char* WIFI_SSID = "Subhanallah";
const char* WIFI_PASS = "muhammadnabiyullah";

// Supabase
const char *supabaseUrl       = "https://pykernnkhvnssplhzcvn.supabase.co";
const char *supabasePublicKey = "sb_publishable_coDPUa845ZtfYmoBWlZlgw_eH5vsCY7";
const char *supabaseTable     = "rainfall_readings";
// ID device (tabel rainfall_readings). Sama dengan id weather station di lokasi yang sama:
//   1 = Cisangkuy   |   2 = Ciminyak
// (tabelnya beda dengan weather station yang menulis ke tabel sensors, jadi tidak bentrok)
const int   DEVICE_ID         = 1;

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
#define STATE_VERSION 2

// Sampling
const uint32_t SAMPLE_INTERVAL_MS  = 2000;  // 2 detik
const uint8_t  SAMPLES_PER_MINUTE  = 30;    // 30 x 2 detik = 60 detik

// WiFi
const uint32_t WIFI_RETRY_MS           = 10000;              // coba sambung ulang tiap 10 detik
const uint32_t WIFI_RESTART_AFTER_MS   = 10UL * 60UL * 1000UL; // restart ESP kalau WiFi putus > 10 menit

// Ubah ke 1 kalau WiFi terdeteksi tapi tetap gagal tersambung
// (masalah umum di board ESP32-C3 kecil / SuperMini dengan antena lemah)
#define WIFI_LOW_TX_POWER 1

// Sensor
const uint32_t SENSOR_RETRY_MS = 5000;   // kalau sensor belum terdeteksi, coba lagi tiap 5 detik

// Curah hujan (mm) per SATU guling mangkuk. Spesifikasi SEN0575: resolusi 0,28 mm
// (0,2794 mm). ESP menghitung sendiri: mm = jumlah guling (tips) x MM_PER_TIP,
// karena nilai mm dari sensor (getRainfall) terbukti tidak ikut berubah.
// KALIBRASI: tuang air terukur ke corong, lalu
//   MM_PER_TIP = (10 x volume_mL / luas_corong_cm2) / jumlah_tips_terbaca
const float MM_PER_TIP = 0.2794f;

// Pengaman anti-hang
const uint32_t WDT_TIMEOUT_S   = 60;      // ESP di-reset otomatis kalau program macet > 60 detik
const uint32_t MIN_FREE_HEAP   = 50000;   // restart terjadwal kalau memori bebas < 50 KB (byte)

// Mode tes TANPA sensor: 1 = pakai data hujan palsu (untuk mengetes WiFi + Supabase saja).
// PERHATIAN: data palsu ikut masuk ke tabel rainfall_readings. Hapus setelah tes:
//   delete from public.rainfall_readings;
// Kembalikan ke 0 sebelum dipasang di lokasi.
#define TEST_WITHOUT_SENSOR 0

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

// Status sensor
bool     sensorReady      = false;
uint32_t lastSensorTryMs  = 0;
uint8_t  zeroStreak       = 0;   // berapa pembacaan berturut-turut yang mendadak 0

// Status WiFi
uint32_t lastWifiAttemptMs = 0;
uint32_t wifiDownSince     = 0;
bool     wifiDown          = false;
bool     timeConfigured    = false;

// =====================================================
//                    FUNGSI BANTU
// =====================================================
void saveState();   // didefinisikan di bawah

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

// ---------- WiFi: dicoba terus sampai tersambung ----------
void applyTxPower() {
#if WIFI_LOW_TX_POWER
  WiFi.setTxPower(WIFI_POWER_8_5dBm);
#endif
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
      Serial.print("\nWiFi tersambung, IP: ");
      Serial.println(WiFi.localIP());
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
    Serial.println("\nWiFi tidak tersambung, mencoba terus...");
  }

  // Coba sambung ulang tiap WIFI_RETRY_MS
  if (now - lastWifiAttemptMs >= WIFI_RETRY_MS) {
    // status: 1 = SSID tidak ditemukan, 4 = gagal connect (biasanya password/keamanan), 6 = terputus
    Serial.printf("Coba sambung WiFi lagi... (status=%d)\n", (int)WiFi.status());
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    applyTxPower();
    lastWifiAttemptMs = now;
  }

  // Kalau terlalu lama putus, restart ESP (mengatasi WiFi yang "nyangkut")
  if (now - wifiDownSince >= WIFI_RESTART_AFTER_MS) {
    Serial.println("WiFi putus terlalu lama, restart ESP...");
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

// Jam sekarang (WIB) untuk ditampilkan di log
String timeStr() {
  struct tm t;
  if (!getLocalTime(&t, 10)) return String("--:--:--");
  char buf[16];
  snprintf(buf, sizeof(buf), "%02d:%02d:%02d", t.tm_hour, t.tm_min, t.tm_sec);
  return String(buf);
}

void saveState() {
  prefs.putFloat("daily", dailyRain);
  prefs.putFloat("pend", pendingRain);
  prefs.putInt("day", currentDay);
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
      Serial.printf(">>> HUJAN TERDETEKSI: +%lu guling = +%.4f mm\n",
                    (unsigned long)deltaTips, deltaMm);
    }
  }
  lastTips = effectiveTips;
  haveLast = true;

  sampleCount++;

  // tips  = jumlah guling dari sensor (angka mentah)
  // total = guling x MM_PER_TIP (mm sejak sensor menyala)
  Serial.printf("[%s] Sample %2u/%u | tips: %lu | total: %.2f mm | pending: %.4f | daily: %.2f mm\n",
                timeStr().c_str(), sampleCount, SAMPLES_PER_MINUTE,
                (unsigned long)tips, effectiveTips * MM_PER_TIP, pendingRain, dailyRain);

  // Nol mendadak yang berulang = sensor tidak menjawab atau memang restart.
  if (ignoredZero) {
    zeroStreak++;
    Serial.printf("!!! Pembacaan 0 diabaikan (%u kali berturut-turut) - kabel I2C longgar atau sensor restart?\n",
                  (unsigned)zeroStreak);
  } else {
    zeroStreak = 0;
  }

#if !TEST_WITHOUT_SENSOR
  if (zeroStreak >= 5) {
    zeroStreak = 0;
    i2cScan();
    if (!Sensor.begin()) {
      Serial.println("Sensor TIDAK merespons -> dianggap gagal I2C, mencoba lagi otomatis.");
      sensorReady = false;
    } else if (Sensor.getRawData() == 0) {
      Serial.println("Sensor melaporkan 0 terus -> dianggap sensor restart, baseline di-nol-kan.");
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
  http.setTimeout(8000);          // ms

  // Publishable key (sb_publishable_...) bukan JWT -> cukup kirim lewat header apikey,
  // JANGAN dikirim di header Authorization: Bearer.
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", supabasePublicKey);
  http.addHeader("Prefer", "return=minimal");

  // rain_mm  = hujan sejak pengiriman sukses sebelumnya (dipakai untuk akumulasi 1/3/6/12/24 jam)
  // rainfall = akumulasi hujan hari ini sejak 00:00 WIB
  // (id & created_at diisi otomatis oleh Supabase)
  char payload[160];
  snprintf(payload, sizeof(payload),
           "{\"device_id\":%d,\"rain_mm\":%.4f,\"rainfall\":%.2f}",
           DEVICE_ID, rainMm, dailyMm);

  int code = http.POST((uint8_t*)payload, strlen(payload));
  Serial.printf("Upload -> HTTP %d | %s\n", code, payload);
  if (code < 0) Serial.println(http.errorToString(code));

  http.end();
  return (code >= 200 && code < 300);
}

// Dipanggil tiap 1 menit (setelah 30 sampel terkumpul)
void sendMinuteData() {
  bool ok = uploadToSupabase(pendingRain, dailyRain);

  if (ok) {
    Serial.println("Upload sukses");
    pendingRain = 0;
  } else {
    // Hujan TIDAK hilang: tetap di pendingRain dan ikut terkirim di pengiriman berikutnya
    Serial.printf("Upload GAGAL, %.4f mm ditunda ke pengiriman berikutnya\n", pendingRain);
  }

  sampleCount = 0;
  saveState();

  // Pantau memori. Kalau menipis (mis. setelah berminggu-minggu nyala), restart
  // dengan rapi. Data hujan aman karena sudah disimpan di atas.
  uint32_t freeHeap = ESP.getFreeHeap();
  Serial.printf("Memori bebas: %u byte\n", (unsigned)freeHeap);
  if (freeHeap < MIN_FREE_HEAP) {
    Serial.println("Memori menipis, restart terjadwal...");
    delay(200);
    ESP.restart();
  }
}

// =====================================================
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
  lastSampleMs = millis();
}

// =====================================================
//                        LOOP
// =====================================================
void loop() {
  esp_task_wdt_reset();   // tanda "masih hidup": kalau berhenti > WDT_TIMEOUT_S, ESP di-reset
  maintainWiFi();         // sambung ulang WiFi kalau putus (tidak memblokir)

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
