import { NextResponse } from "next/server";
import { loadSettings, saveSettings } from "@/lib/settings";
import { getUploadInfo } from "@/lib/upload-info";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ settings: loadSettings(), upload: getUploadInfo() });
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const patch: Record<string, string> = {};

  const maxConcurrent = Number(input.max_concurrent ?? "1");
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 3) {
    return NextResponse.json({ error: "Maksimal rekaman bersamaan harus 1–3." }, { status: 400 });
  }
  patch.max_concurrent = String(maxConcurrent);

  const provider = String(input.upload_provider ?? "none");
  if (!["none", "s3", "drive"].includes(provider)) {
    return NextResponse.json({ error: "Provider upload tidak dikenal." }, { status: 400 });
  }
  patch.upload_provider = provider;
  patch.auto_upload = input.auto_upload === "1" || input.auto_upload === true ? "1" : "0";
  patch.s3_bucket = String(input.s3_bucket ?? "").trim().slice(0, 200);
  patch.s3_region = String(input.s3_region ?? "").trim().slice(0, 80) || "ap-southeast-1";
  patch.s3_endpoint = String(input.s3_endpoint ?? "").trim().slice(0, 300);
  patch.s3_prefix = String(input.s3_prefix ?? "").trim().slice(0, 200);
  patch.gdrive_folder_id = String(input.gdrive_folder_id ?? "").trim().slice(0, 200);

  if (provider === "s3" && !patch.s3_bucket) {
    return NextResponse.json({ error: "Bucket S3 wajib diisi." }, { status: 400 });
  }
  if (provider === "drive" && !patch.gdrive_folder_id) {
    return NextResponse.json({ error: "Folder ID Google Drive wajib diisi." }, { status: 400 });
  }

  saveSettings(patch);
  return NextResponse.json({ settings: loadSettings(), upload: getUploadInfo() });
}
