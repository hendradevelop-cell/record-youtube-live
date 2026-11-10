"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Recording } from "@/lib/types";
import type { UploadInfo } from "@/lib/upload-info";
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  formatElapsed,
  formatSpeed,
  LIVE_LABEL,
  QUALITY_LABEL,
  STATUS_LABEL,
} from "@/lib/format";
import { CloudIcon, CloseIcon, DownloadIcon, ExternalIcon, PlayIcon, RefreshIcon, StopIcon, TrashIcon } from "@/components/icons";

interface SystemInfo {
  ytdlpVersion: string | null;
  ffmpegVersion: string | null;
  diskFreeBytes: number | null;
  diskTotalBytes: number | null;
  activeCount: number;
  upload: UploadInfo;
}

const ACTIVE = ["queued", "resolving", "waiting", "recording", "finalizing"];
const CHIP: Record<string, string> = {
  queued: "wait",
  resolving: "wait",
  waiting: "wait",
  recording: "rec",
  finalizing: "info",
  ready: "ok",
  failed: "err",
  cancelled: "muted",
};

function statusDetail(recording: Recording): string {
  const autoStop =
    recording.auto_stop_minutes > 0 ? ` · auto-stop ${recording.auto_stop_minutes} mnt` : "";
  switch (recording.status) {
    case "recording":
      return `${formatElapsed(recording.record_started_at ?? recording.started_at, null)} · ${formatBytes(
        recording.progress_bytes,
      )} · ${formatSpeed(recording.progress_speed)}${autoStop}`;
    case "waiting":
      return "stream belum mulai";
    case "resolving":
      return "membaca metadata";
    case "finalizing":
      return "menyusun file mp4";
    case "ready":
      return `${recording.duration_sec ? formatDuration(recording.duration_sec) : "selesai"}${
        recording.auto_stopped ? ` · auto-stop ${recording.auto_stop_minutes} mnt` : ""
      }`;
    case "cancelled":
      return "file parsial disimpan";
    default:
      return "";
  }
}

export function Dashboard() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [active, setActive] = useState(0);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [player, setPlayer] = useState<Recording | null>(null);

  const loadRecordings = useCallback(async () => {
    try {
      const response = await fetch("/api/record", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { recordings: Recording[]; active: number };
      setRecordings(data.recordings);
      setActive(data.active);
      setLoadError(null);
    } catch {
      setLoadError("Tidak bisa memuat daftar rekaman. Pastikan server berjalan.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSystem = useCallback(async () => {
    try {
      const response = await fetch("/api/system", { cache: "no-store" });
      if (!response.ok) return;
      setSystem((await response.json()) as SystemInfo);
    } catch {
      /* diabaikan, status engine opsional */
    }
  }, []);

  useEffect(() => {
    void loadRecordings();
    void loadSystem();
    const listTimer = setInterval(() => void loadRecordings(), 2000);
    const systemTimer = setInterval(() => void loadSystem(), 15000);
    return () => {
      clearInterval(listTimer);
      clearInterval(systemTimer);
    };
  }, [loadRecordings, loadSystem]);

  const totals = useMemo(() => {
    const stored = recordings.reduce(
      (sum, item) => sum + (item.file_size ?? item.progress_bytes ?? 0),
      0,
    );
    return { stored, count: recordings.length };
  }, [recordings]);

  async function act(id: string, path: string, method: "POST" | "DELETE") {
    setBusyId(id);
    setActionError(null);
    try {
      const response = await fetch(path, { method });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Aksi gagal.");
      }
      await loadRecordings();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Aksi gagal.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(recording: Recording) {
    if (!window.confirm(`Hapus rekaman "${recording.title ?? recording.url}" beserta filenya?`)) return;
    await act(recording.id, `/api/record/${recording.id}`, "DELETE");
  }

  async function stop(recording: Recording) {
    if (!window.confirm("Hentikan rekaman? Bagian yang sudah terekam tetap disimpan.")) return;
    await act(recording.id, `/api/record/${recording.id}/cancel`, "POST");
  }

  const missingYtdlp = system !== null && !system.ytdlpVersion;
  const missingFfmpeg = system !== null && !system.ffmpegVersion;

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Ruang kerja</p>
          <h1>Rekaman</h1>
          <p className="muted">
            Tempel link live, pantau progress, lalu unduh atau kirim ke cloud.
          </p>
        </div>
        <Link href="/new" className="btn primary">
          <PlayIcon /> Rekam live
        </Link>
      </section>

      <div className="stats">
        <div className="stat">
          <span className="stat-label">Sedang berjalan</span>
          <span className="stat-value">{active}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Total rekaman</span>
          <span className="stat-value">{totals.count}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Tersimpan lokal</span>
          <span className="stat-value">{formatBytes(totals.stored)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Disk bebas</span>
          <span className="stat-value">{system ? formatBytes(system.diskFreeBytes) : "—"}</span>
        </div>
      </div>

      {missingYtdlp && (
        <div className="alert err">
          <b>yt-dlp belum terdeteksi.</b> Taruh <code>yt-dlp.exe</code> di folder <code>bin/</code> project, atau
          install lewat <code>winget install yt-dlp</code> lalu restart worker.
        </div>
      )}
      {missingFfmpeg && (
        <div className="alert err">
          <b>ffmpeg belum terdeteksi.</b> Install ffmpeg dan pastikan tersedia di PATH agar file bisa di-remux ke mp4.
        </div>
      )}
      {actionError && <div className="alert err">{actionError}</div>}
      {loadError && <div className="alert err">{loadError}</div>}

      <div className="panel">
        <div className="panel-head">
          <span>Daftar rekaman</span>
          <span className="muted small">
            {system?.ytdlpVersion ? `yt-dlp ${system.ytdlpVersion}` : "yt-dlp —"} ·{" "}
            {system?.ffmpegVersion ? `ffmpeg ${system.ffmpegVersion}` : "ffmpeg —"}
          </span>
        </div>

        {loading ? (
          <div className="empty">Memuat rekaman…</div>
        ) : recordings.length === 0 ? (
          <div className="empty">
            <div className="empty-orb">
              <span />
            </div>
            <h3>Belum ada rekaman</h3>
            <p className="muted">Mulai dengan menempel link YouTube Live. Rekaman berjalan di background.</p>
            <Link href="/new" className="btn primary">
              <PlayIcon /> Rekam live pertama
            </Link>
          </div>
        ) : (
          <div className="rec-list">
            <div className="rec-header" aria-hidden="true">
              <span>Video</span>
              <span>Status</span>
              <span>Ukuran</span>
              <span>Cloud</span>
              <span className="right">Aksi</span>
            </div>
            {recordings.map((item) => {
              const isActive = ACTIVE.includes(item.status);
              const hasFile = Boolean(item.file_path);
              return (
                <div className="rec-row" key={item.id}>
                  <div className="rec-video">
                    <div className="thumb">
                      {item.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.thumbnail} alt="" loading="lazy" />
                      ) : (
                        <div className="thumb-fallback">
                          <PlayIcon />
                        </div>
                      )}
                      {item.live_status === "is_live" && <span className="live-pill">LIVE</span>}
                    </div>
                    <div className="rec-meta">
                      <div className="rec-title" title={item.title ?? item.url}>
                        {item.title ?? "Menyiapkan judul…"}
                      </div>
                      <div className="rec-sub">
                        {item.channel ? `${item.channel} · ` : ""}
                        {QUALITY_LABEL[item.quality] ?? item.quality} · {formatDateTime(item.created_at)}
                      </div>
                      {item.error && item.status !== "failed" && (
                        <div className="rec-warn" title={item.error}>
                          {item.error}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rec-status">
                    <span className={`chip ${CHIP[item.status] ?? "muted"}`}>
                      {item.status === "recording" && <span className="live-dot" />}
                      {STATUS_LABEL[item.status] ?? item.status}
                    </span>
                    <div className={`progress ${item.status === "recording" ? "indeterminate" : ""}`}>
                      <span style={{ width: item.status === "recording" ? undefined : "100%" }} />
                    </div>
                    <div className="rec-sub">
                      {statusDetail(item)}
                      {isActive && item.status !== "recording" && item.started_at
                        ? ` · ${formatElapsed(item.started_at, item.ended_at)}`
                        : ""}
                    </div>
                    {item.status === "failed" && item.error && (
                      <div className="rec-warn" title={item.error}>
                        {item.error}
                      </div>
                    )}
                  </div>

                  <div className="rec-size">
                    <span className="strong">{formatBytes(item.file_size ?? item.progress_bytes)}</span>
                    <span className="rec-sub">
                      {item.duration_sec ? formatDuration(item.duration_sec) : item.live_status ? LIVE_LABEL[item.live_status] ?? "" : "—"}
                    </span>
                  </div>

                  <div className="rec-cloud">
                    {item.upload_status === "done" && item.upload_url ? (
                      <a className="cloud-link" href={item.upload_url} target="_blank" rel="noreferrer">
                        <ExternalIcon /> Buka
                      </a>
                    ) : item.upload_status === "failed" ? (
                      <>
                        <span className="chip err">Gagal</span>
                        <button
                          className="btn ghost sm"
                          disabled={busyId === item.id}
                          onClick={() => void act(item.id, `/api/record/${item.id}/upload`, "POST")}
                          title={item.upload_error ?? "Coba upload lagi"}
                        >
                          <RefreshIcon /> Ulang
                        </button>
                      </>
                    ) : item.upload_status === "pending" || item.upload_status === "uploading" ? (
                      <span className="chip info">
                        <CloudIcon /> {item.upload_status === "pending" ? "Menunggu" : "Upload…"}
                      </span>
                    ) : (
                      <span className="muted small">—</span>
                    )}
                  </div>

                  <div className="rec-actions">
                    {isActive ? (
                      <button
                        className="btn danger sm"
                        disabled={busyId === item.id}
                        onClick={() => void stop(item)}
                        title="Hentikan rekaman"
                      >
                        <StopIcon /> Stop
                      </button>
                    ) : (
                      <>
                        {hasFile && (
                          <>
                            <button className="icon-btn" onClick={() => setPlayer(item)} title="Putar">
                              <PlayIcon />
                            </button>
                            <a
                              className="icon-btn"
                              href={`/api/record/${item.id}/file?download=1`}
                              title="Unduh"
                            >
                              <DownloadIcon />
                            </a>
                          </>
                        )}
                        <button
                          className="icon-btn danger"
                          disabled={busyId === item.id}
                          onClick={() => void remove(item)}
                          title="Hapus rekaman"
                        >
                          <TrashIcon />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {player && (
        <div className="modal" onClick={() => setPlayer(null)}>
          <div className="modal-body" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="modal-title">{player.title ?? "Rekaman"}</div>
                <div className="muted small">
                  {player.channel ?? ""} {player.file_size ? `· ${formatBytes(player.file_size)}` : ""}
                </div>
              </div>
              <button className="icon-btn" onClick={() => setPlayer(null)} aria-label="Tutup">
                <CloseIcon />
              </button>
            </div>
            {player.quality === "audio" ? (
              <audio controls autoPlay src={`/api/record/${player.id}/file`} style={{ width: "100%" }} />
            ) : (
              <video
                controls
                autoPlay
                playsInline
                src={`/api/record/${player.id}/file`}
                className="player"
              />
            )}
            <div className="modal-foot">
              <a className="btn sm" href={`/api/record/${player.id}/file?download=1`}>
                <DownloadIcon /> Unduh file
              </a>
              {player.upload_url && (
                <a className="btn sm" href={player.upload_url} target="_blank" rel="noreferrer">
                  <ExternalIcon /> Buka di cloud
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
