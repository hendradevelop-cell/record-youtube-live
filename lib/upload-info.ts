import { loadSettings } from "./settings";
import type { UploadProvider } from "./types";

export interface UploadInfo {
  provider: UploadProvider;
  configured: boolean;
  target: string | null;
  missing: string[];
  note: string;
}

export function getUploadInfo(): UploadInfo {
  const settings = loadSettings();
  const provider = (settings.upload_provider || "none") as UploadProvider;

  if (provider === "s3") {
    const missing: string[] = [];
    if (!process.env.AWS_ACCESS_KEY_ID) missing.push("AWS_ACCESS_KEY_ID");
    if (!process.env.AWS_SECRET_ACCESS_KEY) missing.push("AWS_SECRET_ACCESS_KEY");
    if (!settings.s3_bucket) missing.push("Bucket (halaman Pengaturan)");
    const target = settings.s3_bucket ? `s3://${settings.s3_bucket}/${settings.s3_prefix}` : null;
    return {
      provider,
      configured: missing.length === 0,
      target,
      missing,
      note: "Kredensial S3 dibaca dari environment (.env.local). Endpoint opsional untuk R2/MinIO/Backblaze.",
    };
  }

  if (provider === "drive") {
    const missing: string[] = [];
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) missing.push("GOOGLE_APPLICATION_CREDENTIALS");
    if (!settings.gdrive_folder_id) missing.push("Folder ID (halaman Pengaturan)");
    return {
      provider,
      configured: missing.length === 0,
      target: settings.gdrive_folder_id ? `drive folder ${settings.gdrive_folder_id}` : null,
      missing,
      note: "Pakai service account. Folder Drive harus di-share ke email service account dengan akses Editor.",
    };
  }

  return {
    provider: "none",
    configured: false,
    target: null,
    missing: [],
    note: "Upload cloud nonaktif. Rekaman tetap tersimpan lokal.",
  };
}
