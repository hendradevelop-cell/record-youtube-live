import { statfsSync } from "node:fs";
import { SettingsForm } from "@/components/settings-form";
import { loadSettings } from "@/lib/settings";
import { getUploadInfo } from "@/lib/upload-info";
import { ffmpegVersion, ytdlpVersion } from "@/lib/ytdlp";
import { DATA_DIR, RECORDINGS_DIR, toStoredPath } from "@/lib/paths";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  let diskFreeBytes: number | null = null;
  let diskTotalBytes: number | null = null;
  try {
    const stats = statfsSync(DATA_DIR);
    diskFreeBytes = stats.bavail * stats.bsize;
    diskTotalBytes = stats.blocks * stats.bsize;
  } catch {
    /* statfs tidak tersedia */
  }

  return (
    <SettingsForm
      initialSettings={loadSettings()}
      initialUpload={getUploadInfo()}
      engine={{
        ytdlp: ytdlpVersion(),
        ffmpeg: ffmpegVersion(),
        diskFreeBytes,
        diskTotalBytes,
      }}
      recordingsPath={toStoredPath(RECORDINGS_DIR)}
    />
  );
}
