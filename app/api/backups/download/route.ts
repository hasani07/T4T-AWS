import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const BUCKET_NAME = "backups";
const SIGNED_URL_EXPIRY_SECONDS = 300; // 5 menit

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = body?.id as string | undefined;
    if (!id) {
      return NextResponse.json({ success: false, error: "ID backup wajib diisi." }, { status: 400 });
    }

    const supabase = getSupabaseServer();

    const { data: backup, error: fetchError } = await supabase
      .from("backup_logs")
      .select("id, storage_path, expired")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !backup) {
      return NextResponse.json({ success: false, error: "Backup tidak ditemukan." }, { status: 404 });
    }

    if (backup.expired) {
      return NextResponse.json(
        { success: false, error: "Backup ini sudah kadaluarsa dan filenya sudah dihapus." },
        { status: 410 }
      );
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(backup.storage_path, SIGNED_URL_EXPIRY_SECONDS);

    if (signedUrlError || !signedUrlData) {
      throw new Error(signedUrlError?.message ?? "Gagal membuat signed URL.");
    }

    const { error: updateError } = await supabase
      .from("backup_logs")
      .update({ downloaded: true, downloaded_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) {
      console.error("Gagal update status downloaded:", updateError);
    }

    return NextResponse.json({ success: true, url: signedUrlData.signedUrl });
  } catch (err) {
    console.error("Gagal proses download backup:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
