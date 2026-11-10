import { statfsSync } from "node:fs";
import { NextResponse } from "next/server";
import { countActive } from "@/lib/db";
import { DATA_DIR } from "@/lib/paths";
import { ffmpegVersion, ytdlpVersion } from "@/lib/ytdlp";
import { getUploadInfo } from "@/lib/upload-info";

export const dynamic = "force-dynamic";

export async function GET() {
  let diskFreeBytes: number | null = null;
  let diskTotalBytes: number | null = null;
  try {
    const stats = statfsSync(DATA_DIR);
    diskFreeBytes = stats.bavail * stats.bsize;
    diskTotalBytes = stats.blocks * stats.bsize;
  } catch {
    /* statfs tidak tersedia */
  }

  return NextResponse.json({
    ytdlpVersion: ytdlpVersion(),
    ffmpegVersion: ffmpegVersion(),
    diskFreeBytes,
    diskTotalBytes,
    activeCount: countActive(),
    upload: getUploadInfo(),
  });
}
