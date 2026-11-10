import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import {
  claimNextJob,
  claimUpload,
  createRecording,
  db,
  getRecording,
  updateRecording,
} from "../lib/db";
import { loadSettings } from "../lib/settings";
import { fromStoredPath, recordingDir, toStoredPath } from "../lib/paths";
import { buildRecordArgs, ffmpegVersion, MEDIA_EXTENSIONS, resolveVideo, ytdlpPath, ytdlpVersion, killTree } from "../lib/ytdlp";
import { mimeForFile, probeDuration, remuxToMp4 } from "../lib/media";
import { getUploadInfo } from "../lib/upload-info";
import { uploadFile } from "../lib/upload";
import type { Quality, Recording } from "../lib/types";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
} catch {
  /* .env.local bersifat opsional */
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const running = new Set<string>();
const children = new Map<string, ReturnType<typeof spawn>>();
let stopping = false;

function log(message: string) {
  console.log(`[worker ${new Date().toLocaleTimeString("id-ID")}] ${message}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function directorySize(dir: string): number {
  try {
    return fs.readdirSync(dir).reduce((total, name) => {
      try {
        return total + fs.statSync(path.join(dir, name)).size;
      } catch {
        return total;
      }
    }, 0);
  } catch {
    return 0;
  }
}

async function finalizeFiles(
  job: Recording,
): Promise<{ filePath: string | null; fileSize: number | null; durationSec: number | null }> {
  const dir = recordingDir(job.id);
  if (!fs.existsSync(dir)) return { filePath: null, fileSize: null, durationSec: null };

  const candidates = fs
    .readdirSync(dir)
    .filter((name) => MEDIA_EXTENSIONS.includes(path.extname(name).toLowerCase()))
    .map((name) => {
      const absolute = path.join(dir, name);
      return { absolute, size: fs.statSync(absolute).size };
    })
    .filter((entry) => entry.size > 0)
    .sort((a, b) => b.size - a.size);

  if (candidates.length === 0) return { filePath: null, fileSize: null, durationSec: null };

  let absolute = candidates[0].absolute;
  const ext = path.extname(absolute).toLowerCase();

  if (job.quality !== "audio") {
    const target = absolute.slice(0, -ext.length) + ".final.mp4";
    if (!absolute.endsWith(".final.mp4")) {
      const ok = await remuxToMp4(absolute, target);
      if (ok && fs.existsSync(target) && fs.statSync(target).size > 0) {
        fs.rmSync(absolute, { force: true });
        absolute = target;
      }
    }
  }

  const fileSize = fs.statSync(absolute).size;
  const probed = probeDuration(absolute);
  const elapsed = job.started_at ? (Date.now() - new Date(job.started_at).getTime()) / 1000 : null;

  return {
    filePath: toStoredPath(absolute),
    fileSize,
    durationSec: probed ?? elapsed,
  };
}

async function recordOnce(
  job: Recording,
): Promise<{ error: string | null; cancelled: boolean; autoStopped: boolean }> {
  const dir = recordingDir(job.id);
  fs.mkdirSync(dir, { recursive: true });

  const outputTemplate = path.join(dir, "%(title).80B [%(id)s].%(ext)s");
  const args = buildRecordArgs({
    url: job.url,
    quality: job.quality as Quality,
    outputTemplate,
    fromStart: job.from_start === 1,
  });

  const autoStopMinutes = job.auto_stop_minutes ?? 0;

  let errorLine: string | null = null;
  let cancelled = false;
  let autoStopped = false;
  let stalled = false;
  let lastSize = 0;
  let lastTick = Date.now();
  let lastGrewAt = Date.now();
  // Auto-stop dihitung sejak byte pertama masuk, bukan sejak job diklaim,
  // supaya waktu resolving/antrean yt-dlp tidak memakan durasi rekaman.
  let recordStartedAt: number | null = null;

  const child = spawn(ytdlpPath(), args, {
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.set(job.id, child);
  if (child.pid) updateRecording(job.id, { pid: child.pid });

  const handleLine = (raw: string) => {
    const line = raw.trim();
    if (/ERROR|error/i.test(line)) errorLine = line.slice(0, 500);
  };

  const stdout = createInterface({ input: child.stdout! });
  const stderr = createInterface({ input: child.stderr! });
  stdout.on("line", handleLine);
  stderr.on("line", handleLine);

  // Untuk live, yt-dlp menyerahkan merge ke ffmpeg dan tidak mengeluarkan progress
  // template, jadi progress dihitung dari pertumbuhan file di folder job.
  const progressTimer = setInterval(() => {
    const now = Date.now();
    const size = directorySize(dir);
    const elapsed = Math.max(0.2, (now - lastTick) / 1000);
    lastTick = now;
    if (size <= lastSize) return;

    const speed = (size - lastSize) / elapsed;
    lastSize = size;
    lastGrewAt = now;
    if (recordStartedAt === null) {
      recordStartedAt = now;
      updateRecording(job.id, { record_started_at: new Date(now).toISOString() });
    }
    updateRecording(job.id, {
      status: "recording",
      progress_bytes: size,
      progress_speed: speed,
    });
  }, 1000);

  const watchdog = setInterval(() => {
    const fresh = getRecording(job.id);
    if (!fresh) return;
    if (fresh.cancel_requested) {
      cancelled = true;
      killTree(child.pid);
      return;
    }
    if (
      autoStopMinutes > 0 &&
      !autoStopped &&
      recordStartedAt !== null &&
      Date.now() >= recordStartedAt + autoStopMinutes * 60_000
    ) {
      autoStopped = true;
      updateRecording(job.id, { auto_stopped: 1 });
      log(`auto-stop ${autoStopMinutes} menit: ${job.id}`);
      killTree(child.pid);
      return;
    }
    if (fresh.status === "recording" && Date.now() - lastGrewAt > 180_000) {
      stalled = true;
      killTree(child.pid);
    }
  }, 3000);

  const code = await new Promise<number | null>((resolve) => {
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    child.on("error", (error) => {
      errorLine = error.message;
      finish(null);
    });
    child.on("close", (exitCode) => finish(exitCode));
  });

  clearInterval(progressTimer);
  clearInterval(watchdog);
  stdout.close();
  stderr.close();
  children.delete(job.id);
  updateRecording(job.id, { pid: null });

  if (stalled) {
    return { error: "Stream berhenti mengirim data lebih dari 3 menit.", cancelled: false, autoStopped };
  }
  if (cancelled) return { error: null, cancelled: true, autoStopped };
  if (autoStopped) return { error: null, cancelled: false, autoStopped: true };
  if (code !== 0 && !errorLine) errorLine = `yt-dlp berhenti dengan kode ${code ?? "tidak diketahui"}.`;
  return { error: errorLine, cancelled: false, autoStopped };
}

function queueUploadIfEnabled(jobId: string) {
  const settings = loadSettings();
  if (settings.auto_upload !== "1") return;
  const info = getUploadInfo();
  if (!info.configured || info.provider === "none") return;
  updateRecording(jobId, { upload_status: "pending", upload_error: null });
}

async function runJob(job: Recording) {
  log(
    `mulai "${job.title ?? job.url}" (${job.quality}${job.auto_stop_minutes > 0 ? `, auto-stop ${job.auto_stop_minutes} mnt` : ", rekam penuh"})`,
  );
  updateRecording(job.id, {
    status: "recording",
    error: null,
    cancel_requested: 0,
    auto_stopped: 0,
    record_started_at: null,
  });

  void resolveVideo(job.url)
    .then((info) => {
      updateRecording(job.id, {
        video_id: info.videoId,
        title: info.title,
        channel: info.channel,
        thumbnail: info.thumbnail,
        live_status: info.liveStatus,
      });
      const fresh = getRecording(job.id);
      if (fresh && fresh.status === "recording" && fresh.progress_bytes === null && info.liveStatus === "is_upcoming") {
        updateRecording(job.id, { status: "waiting" });
      }
    })
    .catch((error) => log(`metadata gagal untuk ${job.id}: ${errorMessage(error)}`));

  const result = await recordOnce(job);
  updateRecording(job.id, { status: "finalizing" });
  const final = await finalizeFiles(job);

  const fresh = getRecording(job.id);
  const wasCancelled = result.cancelled || Boolean(fresh?.cancel_requested);
  const endedAt = new Date().toISOString();

  if (!final.filePath) {
    updateRecording(job.id, {
      status: wasCancelled ? "cancelled" : "failed",
      ended_at: endedAt,
      progress_speed: null,
      error: result.error ?? (wasCancelled ? null : "Tidak ada file rekaman yang dihasilkan."),
    });
    log(`selesai tanpa file: ${job.id}`);
    return;
  }

  updateRecording(job.id, {
    status: wasCancelled ? "cancelled" : "ready",
    file_path: final.filePath,
    file_size: final.fileSize,
    duration_sec: final.durationSec,
    ended_at: endedAt,
    progress_speed: null,
    error: wasCancelled ? null : result.error,
  });

  queueUploadIfEnabled(job.id);
  log(`selesai: ${final.filePath}`);

  // Auto-stop = segmen berulang: begitu segmen selesai, antre rekaman baru
  // dengan setelan yang sama. Membatalkan segmen yang berjalan menghentikan rangkaian.
  if (result.autoStopped && !wasCancelled && job.auto_stop_minutes > 0) {
    const next = createRecording({
      id: randomUUID(),
      url: job.url,
      quality: job.quality,
      title: fresh?.title ?? job.title,
      videoId: fresh?.video_id ?? job.video_id,
      fromStart: job.from_start === 1,
      autoStopMinutes: job.auto_stop_minutes,
    });
    log(`auto-stop: mulai segmen berikutnya ${next.id}`);
  }
}

async function processUploads() {
  const info = getUploadInfo();
  if (info.provider === "none" || !info.configured) return;

  const job = claimUpload();
  if (!job) return;

  try {
    const absolute = fromStoredPath(job.file_path!);
    if (!fs.existsSync(absolute)) throw new Error("File rekaman tidak ditemukan di disk.");
    log(`upload ${path.basename(absolute)} ke ${info.provider}`);
    const url = await uploadFile(absolute, path.basename(absolute), mimeForFile(absolute));
    updateRecording(job.id, { upload_status: "done", upload_url: url, upload_error: null });
    log(`upload selesai: ${url}`);
  } catch (error) {
    updateRecording(job.id, { upload_status: "failed", upload_error: errorMessage(error) });
    log(`upload gagal: ${errorMessage(error)}`);
  }
}

async function recoverOrphans() {
  db.prepare("UPDATE recording SET upload_status = 'pending' WHERE upload_status = 'uploading'").run();
  const stuck = db
    .prepare("SELECT * FROM recording WHERE status IN ('resolving', 'waiting', 'recording', 'finalizing')")
    .all() as unknown as Recording[];

  for (const job of stuck) {
    const final = await finalizeFiles(job);
    const endedAt = new Date().toISOString();
    if (final.filePath) {
      updateRecording(job.id, {
        status: job.cancel_requested ? "cancelled" : "ready",
        file_path: final.filePath,
        file_size: final.fileSize,
        duration_sec: final.durationSec,
        ended_at: endedAt,
        pid: null,
        error: "Worker direstart saat rekaman berjalan. File tersimpan.",
      });
      queueUploadIfEnabled(job.id);
    } else {
      updateRecording(job.id, {
        status: job.cancel_requested ? "cancelled" : "failed",
        ended_at: endedAt,
        pid: null,
        error: "Worker berhenti sebelum file rekaman terbentuk.",
      });
    }
  }
  if (stuck.length > 0) log(`${stuck.length} job yang tertinggal dipulihkan.`);
}

async function tick() {
  const settings = loadSettings();
  const maxActive = Math.max(1, Math.min(3, Number(settings.max_concurrent) || 1));

  if (running.size < maxActive) {
    const job = claimNextJob(maxActive);
    if (job) {
      running.add(job.id);
      runJob(job)
        .catch((error) => {
          updateRecording(job.id, {
            status: "failed",
            error: errorMessage(error).slice(0, 500),
            ended_at: new Date().toISOString(),
            pid: null,
          });
          log(`job gagal: ${errorMessage(error)}`);
        })
        .finally(() => running.delete(job.id));
    }
  }

  await processUploads();
}

async function main() {
  const yt = ytdlpVersion();
  const ff = ffmpegVersion();
  log(`yt-dlp: ${yt ?? "TIDAK DITEMUKAN (taruh bin/yt-dlp.exe atau install yt-dlp)"}`);
  log(`ffmpeg: ${ff ?? "TIDAK DITEMUKAN (install ffmpeg dan pastikan ada di PATH)"}`);
  await recoverOrphans();
  log("worker siap, menunggu job…");

  while (!stopping) {
    try {
      await tick();
    } catch (error) {
      console.error(`[worker] loop error: ${errorMessage(error)}`);
    }
    await sleep(1500);
  }
}

function shutdown() {
  if (stopping) return;
  stopping = true;
  log("berhenti, menghentikan rekaman aktif…");
  for (const child of children.values()) killTree(child.pid);
  setTimeout(() => process.exit(0), 1500);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
