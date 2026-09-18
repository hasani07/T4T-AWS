// Rule engine ini deterministik (murni matematika/logika), TIDAK memakai
// LLM. Groq (lib/groq.ts) hanya bertugas menyusun narasi dari hasil
// perhitungan di sini — supaya angka & klasifikasi risiko konsisten dan
// tidak "dihalusinasi" oleh model. Basis pengetahuannya diringkas dari
// materi Workshop T4T (lihat PRD Bagian 9.1).

const CALM_WIND_CODE = "U";

export type RiskLevel = "aman" | "waspada" | "kritis";
export type VpdClass = "rendah" | "sedang" | "tinggi";

export interface RuleEngineInput {
  temperature: number;
  humidity: number;
  windSpeed: number; // m/s
  windDirection: string; // kompas, atau "U" (calm)
  rainfallTotal: number; // mm, akumulasi pada window yang dipakai (mis. 24 jam terakhir)
}

export interface RuleEngineOutput {
  vpd: number;
  vpdClass: VpdClass;
  riskLevel: RiskLevel;
  riskExplanation: string;
  windNote: string;
  rainfallNote: string;
}

export function calcVPD(temperatureC: number, humidityPct: number): number {
  const es = 0.6108 * Math.exp((17.27 * temperatureC) / (temperatureC + 237.3));
  const ea = es * (humidityPct / 100);
  return Number((es - ea).toFixed(3));
}

export function classifyVPD(vpd: number): VpdClass {
  if (vpd < 0.8) return "rendah";
  if (vpd <= 1.5) return "sedang";
  return "tinggi";
}

/**
 * Klasifikasi risiko HEURISTIK dari kombinasi ambang batas di materi
 * Workshop T4T. Materi sumber tidak memberi angka pasti untuk kelas
 * kecepatan angin, jadi dipakai skala umum: lemah <3 m/s, sedang 3-8 m/s,
 * kuat >8 m/s. Ini estimasi awal v1 — sebaiknya disesuaikan lagi kalau ada
 * masukan dari pakar lapangan / observasi data lebih banyak.
 */
export function classifyRisk(
  temperature: number,
  humidity: number,
  windSpeed: number
): { level: RiskLevel; explanation: string } {
  const isHotDry = temperature > 33 && humidity < 55;
  const isModerateHot = temperature > 32 || humidity < 60;
  const isStrongWind = windSpeed > 8;

  let level: RiskLevel = "aman";
  if (isHotDry) {
    level = "kritis";
  } else if (isModerateHot) {
    level = "waspada";
  }

  // Angin kuat + suhu cukup tinggi menaikkan level risiko satu tingkat
  if (isStrongWind && temperature > 30 && level !== "kritis") {
    level = level === "aman" ? "waspada" : "kritis";
  }

  const explanations: Record<RiskLevel, string> = {
    aman: "Kondisi suhu, kelembaban, dan angin dalam rentang yang cukup baik untuk pertumbuhan bibit.",
    waspada:
      "Ada indikasi beban termal/pengeringan meningkat — perlu pemantauan lebih ketat.",
    kritis:
      "Kombinasi suhu tinggi, kelembaban rendah, dan/atau angin kencang berisiko mempercepat kekeringan media dan stres air pada bibit.",
  };

  return { level, explanation: explanations[level] };
}

export function buildWindNote(windDirection: string): string {
  if (windDirection === CALM_WIND_CODE) {
    return "Angin dalam kondisi calm/tidak terdeteksi arah dominan pada periode ini.";
  }
  return `Angin dominan dari arah ${windDirection}. Pertimbangkan posisi windbreak di sisi ini kalau kondisinya berlangsung konsisten.`;
}

export function buildRainfallNote(rainfallTotal: number): string {
  if (rainfallTotal >= 5) {
    return `Curah hujan tercatat ${rainfallTotal.toFixed(1)} mm dalam 24 jam terakhir — cukup signifikan, dapat menurunkan urgensi penyiraman tambahan.`;
  }
  return `Curah hujan minim (${rainfallTotal.toFixed(1)} mm) dalam 24 jam terakhir — pertimbangkan kebutuhan irigasi tambahan kalau kondisi kering berlanjut.`;
}

export function runRuleEngine(input: RuleEngineInput): RuleEngineOutput {
  const vpd = calcVPD(input.temperature, input.humidity);
  const vpdClass = classifyVPD(vpd);
  const { level, explanation } = classifyRisk(
    input.temperature,
    input.humidity,
    input.windSpeed
  );

  return {
    vpd,
    vpdClass,
    riskLevel: level,
    riskExplanation: explanation,
    windNote: buildWindNote(input.windDirection),
    rainfallNote: buildRainfallNote(input.rainfallTotal),
  };
}
