import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { ffmpegPath, ffprobePath, killTree } from "./ytdlp";

export function mimeForFile(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case ".mp4":
    case ".mov":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mkv":
      return "video/x-matroska";
    case ".ts":
      return "video/mp2t";
    case ".m4a":
      return "audio/mp4";
    case ".mp3":
      return "audio/mpeg";
    case ".opus":
    case ".ogg":
      return "audio/ogg";
    case ".flv":
      return "video/x-flv";
    default:
      return "application/octet-stream";
  }
}

export function probeDuration(file: string): number | null {
  try {
    const result = spawnSync(
      ffprobePath(),
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
      { encoding: "utf8", timeout: 60_000, windowsHide: true },
    );
    const value = Number(result.stdout.trim());
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function remuxToMp4(source: string, target: string): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const child = spawn(
      ffmpegPath(),
      ["-hide_banner", "-loglevel", "error", "-y", "-i", source, "-c", "copy", "-movflags", "+faststart", target],
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    const timer = setTimeout(() => killTree(child.pid), 30 * 60_000);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) console.error(`[worker] remux gagal: ${stderr.trim().slice(0, 300)}`);
      resolve(code === 0);
    });
  });
}
