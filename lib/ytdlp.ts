import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Quality, ResolvedVideo } from "./types";

export function ytdlpPath(): string {
  const name = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  const local = path.join(process.cwd(), "bin", name);
  if (fs.existsSync(local)) return local;
  return process.env.YTDLP_PATH || "yt-dlp";
}

export function ffmpegPath(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

export function ffprobePath(): string {
  return process.env.FFPROBE_PATH || "ffprobe";
}

const versionCache = globalThis as unknown as {
  __engineVersions?: { at: number; ytdlp: string | null; ffmpeg: string | null };
};

function cachedVersions() {
  const now = Date.now();
  const cached = versionCache.__engineVersions;
  // Deteksi yang gagal (kemungkinan timeout antivirus) hanya dipercaya 1 menit
  // supaya engine tidak terus dilaporkan hilang.
  const cacheTtl = cached?.ytdlp ? 600_000 : 60_000;
  if (cached && now - cached.at < cacheTtl) return cached;

  let ytdlp: string | null = null;
  let ffmpeg: string | null = null;
  try {
    // Binary PyInstaller di Windows bisa butuh >10 detik saat pertama dipindai antivirus.
    const result = spawnSync(ytdlpPath(), ["--version"], {
      encoding: "utf8",
      timeout: 60_000,
      windowsHide: true,
    });
    if (result.status === 0) ytdlp = result.stdout.trim();
  } catch {
    /* not installed */
  }
  try {
    const result = spawnSync(ffmpegPath(), ["-version"], {
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
    });
    if (result.status === 0) {
      const match = /ffmpeg version (\S+)/i.exec(result.stdout);
      ffmpeg = match?.[1] ?? "ok";
    }
  } catch {
    /* not installed */
  }

  const fresh = { at: now, ytdlp, ffmpeg };
  versionCache.__engineVersions = fresh;
  return fresh;
}

export function ytdlpVersion(): string | null {
  return cachedVersions().ytdlp;
}

export function ffmpegVersion(): string | null {
  return cachedVersions().ffmpeg;
}

export function killTree(pid: number | null | undefined) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
    return;
  }
  try {
    process.kill(-pid, "SIGINT");
  } catch {
    try {
      process.kill(pid, "SIGINT");
    } catch {
      /* already gone */
    }
  }
}

function firstErrorLine(stderr: string): string {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("ERROR") || line.includes("ERROR:"));
  const line = lines[lines.length - 1] ?? stderr.trim().split(/\r?\n/).pop() ?? "";
  return line.replace(/^ERROR:\s*/, "").slice(0, 500);
}

export async function resolveVideo(url: string): Promise<ResolvedVideo> {
  const args = [
    "-J",
    "--no-playlist",
    "--no-warnings",
    "--socket-timeout",
    "20",
    "--retries",
    "2",
    url,
  ];

  return await new Promise<ResolvedVideo>((resolve, reject) => {
    const child = spawn(ytdlpPath(), args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      killTree(child.pid);
      reject(new Error("Timeout saat mengambil metadata. Cek koneksi lalu coba lagi."));
    }, 60_000);

    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`Gagal menjalankan yt-dlp: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(firstErrorLine(stderr) || `yt-dlp keluar dengan kode ${code}`));
        return;
      }
      try {
        const info = JSON.parse(stdout) as Record<string, unknown>;
        resolve({
          videoId: String(info.id ?? ""),
          url,
          title: String(info.title ?? info.id ?? "Tanpa judul"),
          channel: String(info.channel ?? info.uploader ?? ""),
          thumbnail: typeof info.thumbnail === "string" ? info.thumbnail : null,
          durationSec: typeof info.duration === "number" ? info.duration : null,
          isLive: info.live_status === "is_live",
          liveStatus: typeof info.live_status === "string" ? info.live_status : null,
        });
      } catch {
        reject(new Error("Tidak bisa membaca metadata dari jawaban yt-dlp."));
      }
    });
  });
}

const FORMATS: Record<Quality, string> = {
  best: "b/bv*+ba",
  "1080": "b[height<=1080]/bv*[height<=1080]+ba",
  "720": "b[height<=720]/bv*[height<=720]+ba",
  audio: "ba/b",
};

export const MEDIA_EXTENSIONS = [".mp4", ".ts", ".mkv", ".webm", ".m4a", ".mp3", ".opus", ".flv", ".mov"];

export function buildRecordArgs(opts: {
  url: string;
  quality: Quality;
  outputTemplate: string;
  fromStart?: boolean;
}): string[] {
  const isAudio = opts.quality === "audio";
  const args = [
    "--no-playlist",
    "--newline",
    "--no-part",
    "--no-warnings",
    "--no-mtime",
    "--wait-for-video",
    "30",
    "--socket-timeout",
    "15",
    "--retries",
    "10",
    "--fragment-retries",
    "20",
    "--progress-template",
    "download:dl:%(progress.downloaded_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s",
    "-f",
    FORMATS[opts.quality],
    "-o",
    opts.outputTemplate,
  ];
  if (opts.fromStart) args.push("--live-from-start");
  if (!isAudio) args.push("--hls-use-mpegts");
  if (isAudio) args.push("-x", "--audio-format", "m4a");
  // Tanpa -copyts, ffmpeg menormalkan timestamp audio dan video secara terpisah
  // sehingga offset relatif antar-stream hilang setiap ada diskontinuitas HLS.
  args.push("--downloader-args", "ffmpeg:-copyts");
  if (process.platform === "win32") args.push("--windows-filenames");
  args.push(opts.url);
  return args;
}
