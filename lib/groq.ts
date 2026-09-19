// PENTING: file ini hanya boleh diimport dari kode server (API routes),
// TIDAK PERNAH dari komponen 'use client' — karena memakai GROQ_API_KEY
// yang harus tetap rahasia (tidak diberi prefix NEXT_PUBLIC_).

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";

interface RecommendationParams {
  deviceLabel: string;
  temperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  rainfallTotal: number;
  vpd: number;
  vpdClass: string;
  riskLevel: string;
  riskExplanation: string;
  windNote: string;
  rainfallNote: string;
}

const SYSTEM_PROMPT = `Kamu adalah asisten ahli mikroklimat persemaian, memberi rekomendasi tindakan operasional berbasis materi Workshop T4T "Strategi Cerdas Membaca Cuaca". Prinsip yang harus kamu pegang:

- Suhu >33-35°C siang tropis + RH <50-60% + angin sedang-kuat = kombinasi risiko kritis: media kering cepat, bibit layu, mortalitas meningkat. Tindakan: naungan/paranet, kurangi paparan angin kering, perketat irigasi.
- Suhu 28-32°C, RH 60-75%, angin lemah-sedang = risiko sedang/cukup baik: cukup pantau media & gejala layu sore hari.
- RH sangat tinggi + suhu sedang: buka sebagian naungan/tingkatkan ventilasi supaya tidak memicu jamur, tapi jaga media tidak terlalu kering.
- Arah angin dominan menentukan sisi mana perlu windbreak (dari area terbuka/kering = risiko tinggi, dari area bervegetasi = risiko rendah). Jangan berikan saran windbreak kalau kondisi angin calm/tidak terdeteksi.
- VPD <0.8 kPa = lembap/transpirasi rendah; 0.8-1.5 kPa = seimbang; >1.5 kPa = kering, risiko stres air tinggi -> indikasi kebutuhan penyiraman ekstra (proksi hari ber-ETo tinggi kalau dikombinasikan dengan panas & angin).
- Curah hujan tinggi pada periode terakhir bisa menurunkan urgensi irigasi tambahan meskipun suhu/RH menunjukkan waspada.

Tugasmu: berdasarkan data numerik dan hasil klasifikasi yang sudah dihitung (jangan dihitung ulang, anggap benar), tulis rekomendasi tindakan singkat, actionable, dalam Bahasa Indonesia (3-5 kalimat atau beberapa poin) untuk pengelola persemaian di lokasi tersebut. Fokus ke tindakan konkret, jangan mengulang-ulang angka mentah.`;

function buildUserPrompt(p: RecommendationParams): string {
  return `Data mikroklimat lokasi ${p.deviceLabel}:
- Suhu: ${p.temperature.toFixed(1)} °C
- Kelembaban (RH): ${p.humidity.toFixed(0)} %
- Kecepatan Angin: ${p.windSpeed.toFixed(1)} m/s
- Arah Angin: ${p.windDirection}
- Curah Hujan (24 jam terakhir): ${p.rainfallTotal.toFixed(1)} mm
- VPD: ${p.vpd.toFixed(2)} kPa (kelas: ${p.vpdClass})
- Klasifikasi risiko (sudah dihitung sistem): ${p.riskLevel} — ${p.riskExplanation}
- Catatan angin: ${p.windNote}
- Catatan curah hujan: ${p.rainfallNote}

Tulis rekomendasi tindakan untuk pengelola persemaian di lokasi ini.`;
}

export async function generateRecommendationText(
  params: RecommendationParams
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY belum diisi di environment variable server (Vercel)."
    );
  }
  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(params) },
      ],
      temperature: 0.4,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("Groq API tidak mengembalikan teks rekomendasi.");
  }
  return text.trim();
}
