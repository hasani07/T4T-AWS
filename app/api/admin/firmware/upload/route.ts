import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Butuh Buffer & modul crypto Node, jadi harus runtime Node (bukan Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "firmware";
// Device rainfall yang dikenal saat ini. Tambah id baru di sini kalau ada lokasi baru.
const KNOWN_DEVICE_IDS = [1, 2];
// Jauh di atas ukuran firmware ESP32 wajar (~1-1.5 MB); sekadar pengaman salah unggah file.
const MAX_FILE_SIZE = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const adminPassword = process.env.ADMIN_FIRMWARE_PASSWORD;
  if (!adminPassword) {
    return NextResponse.json(
      {
        success: false,
        error: "ADMIN_FIRMWARE_PASSWORD belum diatur di server (.env.local). Halaman ini tidak bisa dipakai sebelum itu diisi.",
      },
      { status: 500 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ success: false, error: "Body request tidak valid (harus multipart/form-data)." }, { status: 400 });
  }

  const password = String(form.get("password") ?? "");
  if (password !== adminPassword) {
    // Password gagal: TIDAK memberi tahu bagian mana yang salah, dan tidak membedakan
    // "password kosong" vs "password salah" di pesan, supaya tidak membantu tebakan.
    return NextResponse.json({ success: false, error: "Password salah." }, { status: 401 });
  }

  const deviceId = Number(form.get("device_id"));
  const version = Number(form.get("version"));
  const versionLabel = String(form.get("version_label") ?? "").trim();
  const notes = String(form.get("notes") ?? "").trim();
  const file = form.get("file");

  if (!KNOWN_DEVICE_IDS.includes(deviceId)) {
    return NextResponse.json(
      { success: false, error: `device_id harus salah satu dari: ${KNOWN_DEVICE_IDS.join(", ")}` },
      { status: 400 }
    );
  }
  if (!Number.isInteger(version) || version <= 0) {
    return NextResponse.json({ success: false, error: "Nomor versi harus bilangan bulat positif (1, 2, 3, ...)." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: "File firmware (.bin) wajib diisi." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".bin")) {
    return NextResponse.json(
      { success: false, error: "File harus berekstensi .bin (hasil Sketch > Export Compiled Binary di Arduino IDE)." },
      { status: 400 }
    );
  }
  if (file.size === 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { success: false, error: `Ukuran file tidak wajar (${file.size} byte). Batas ${MAX_FILE_SIZE} byte.` },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const md5 = crypto.createHash("md5").update(buffer).digest("hex");
  const storagePath = `rainfall/${deviceId}/fw_${version}.bin`;

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Konfigurasi server admin tidak lengkap.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }

  // upsert:true supaya bisa upload ulang ke version+device_id yang sama (misal ganti file
  // karena salah upload) tanpa perlu hapus manual dulu di Storage.
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: "application/octet-stream", upsert: true });
  if (uploadError) {
    return NextResponse.json({ success: false, error: `Gagal upload ke Storage: ${uploadError.message}` }, { status: 500 });
  }

  const { data: publicUrlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);
  const fileUrl = publicUrlData.publicUrl;

  const { error: insertError } = await supabaseAdmin.from("device_firmware").insert({
    device_id: deviceId,
    version,
    version_label: versionLabel || null,
    storage_path: storagePath,
    file_url: fileUrl,
    md5,
    notes: notes || null,
  });
  if (insertError) {
    return NextResponse.json(
      {
        success: false,
        error: `File sudah terupload ke Storage, TAPI gagal dicatat ke tabel device_firmware: ${insertError.message}. ` +
          `ESP tidak akan melihat versi ini sampai baris ini berhasil dibuat (coba upload ulang).`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, file_url: fileUrl, md5, storage_path: storagePath });
}
