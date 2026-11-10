import fs from "node:fs";
import { NextResponse } from "next/server";
import { getRecording, updateRecording } from "@/lib/db";
import { fromStoredPath } from "@/lib/paths";
import { getUploadInfo } from "@/lib/upload-info";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recording = getRecording(id);
  if (!recording) return NextResponse.json({ error: "Rekaman tidak ditemukan." }, { status: 404 });
  if (!recording.file_path) {
    return NextResponse.json({ error: "Rekaman belum punya file." }, { status: 400 });
  }

  const info = getUploadInfo();
  if (info.provider === "none") {
    return NextResponse.json({ error: "Provider upload belum dipilih di Pengaturan." }, { status: 400 });
  }
  if (!info.configured) {
    return NextResponse.json(
      { error: `Konfigurasi upload belum lengkap: ${info.missing.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    if (!fs.existsSync(fromStoredPath(recording.file_path))) {
      return NextResponse.json({ error: "File rekaman tidak ada di disk." }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: "Path file tidak valid." }, { status: 400 });
  }

  updateRecording(id, { upload_status: "pending", upload_error: null, upload_url: null });
  return NextResponse.json({ ok: true });
}
