"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Quality, ResolvedVideo } from "@/lib/types";
import { formatDuration, LIVE_LABEL } from "@/lib/format";
import { MicIcon, PlayIcon } from "@/components/icons";

const QUALITY_OPTIONS: { value: Quality; label: string; note: string }[] = [
  { value: "best", label: "Terbaik", note: "Format gabungan tertinggi, paling stabil untuk live." },
  { value: "1080", label: "1080p", note: "Full HD. Butuh ~2–4 GB per jam." },
  { value: "720", label: "720p", note: "Lebih hemat, cocok untuk live panjang." },
  { value: "audio", label: "Audio saja", note: "M4A. Paling hemat ruang." },
];

export function NewRecording() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [quality, setQuality] = useState<Quality>("best");
  const [fromStart, setFromStart] = useState(false);
  const [preview, setPreview] = useState<ResolvedVideo | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullRecording, setFullRecording] = useState(false);
  const [stopMinutes, setStopMinutes] = useState("10");

  const selectedQuality = QUALITY_OPTIONS.find((option) => option.value === quality);

  async function check() {
    if (!url.trim()) return;
    setPreviewing(true);
    setError(null);
    try {
      const response = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json()) as ResolvedVideo & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Gagal mengecek link.");
      setPreview(data);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Gagal mengecek link.");
    } finally {
      setPreviewing(false);
    }
  }

  async function start() {
    if (!url.trim()) return;
    const minutes = Number(stopMinutes);
    if (!fullRecording && (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)) {
      setError("Auto-stop harus 1–1440 menit, atau pilih Rekam penuh.");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const response = await fetch("/api/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          quality,
          fromStart,
          autoStopMinutes: fullRecording ? 0 : minutes,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Gagal memulai rekaman.");
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memulai rekaman.");
      setStarting(false);
    }
  }

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Rekaman baru</p>
          <h1>Rekam YouTube Live</h1>
          <p className="muted">Tempel link, cek metadata, pilih kualitas, lalu mulai.</p>
        </div>
      </section>

      <div className="new-grid">
        <div className="panel pad">
          <label className="field-label" htmlFor="url">
            Link YouTube Live
          </label>
          <div className="url-row">
            <input
              id="url"
              className="input"
              placeholder="https://www.youtube.com/live/…"
              value={url}
              autoFocus
              onChange={(event) => {
                setUrl(event.target.value);
                setPreview(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void check();
              }}
            />
            <button className="btn" onClick={() => void check()} disabled={previewing || !url.trim()}>
              {previewing ? "Mengecek…" : "Cek link"}
            </button>
          </div>
          <p className="hint">Didukung: youtube.com/live/…, youtube.com/watch?v=…, youtu.be/…</p>

          <div className="field-label">Kualitas</div>
          <div className="quality-grid">
            {QUALITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`quality ${quality === option.value ? "selected" : ""}`}
                onClick={() => setQuality(option.value)}
              >
                <span className="quality-title">
                  {option.value === "audio" && <MicIcon />}
                  {option.label}
                </span>
                <span className="quality-note">{option.note}</span>
              </button>
            ))}
          </div>

          {error && <div className="alert err">{error}</div>}

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={fromStart}
              onChange={(event) => setFromStart(event.target.checked)}
            />
            <span className="toggle" aria-hidden="true" />
            <span>
              Rekam dari awal (DVR)
              <span className="hint block">
                Kalau stream menyimpan riwayat, rekaman ikut mengambil bagian awal. Bisa jadi backlog
                hingga 1 jam lebih.
              </span>
            </span>
          </label>

          <div className="field-label">Durasi rekaman</div>
          <div className="quality-grid">
            <button
              type="button"
              className={`quality ${!fullRecording ? "selected" : ""}`}
              onClick={() => setFullRecording(false)}
            >
              <span className="quality-title">Auto-stop & repeat</span>
              <span className="quality-note">Berhenti tiap N menit, lalu mulai segmen baru otomatis.</span>
            </button>
            <button
              type="button"
              className={`quality ${fullRecording ? "selected" : ""}`}
              onClick={() => setFullRecording(true)}
            >
              <span className="quality-title">Rekam penuh</span>
              <span className="quality-note">Sampai live berakhir atau dihentikan manual.</span>
            </button>
          </div>
          <label className="field-label" htmlFor="stop_minutes">
            Durasi tiap segmen (menit)
          </label>
          <input
            id="stop_minutes"
            className="input"
            type="number"
            min={1}
            max={1440}
            step={1}
            value={stopMinutes}
            disabled={fullRecording}
            onChange={(event) => setStopMinutes(event.target.value)}
          />
          <p className="hint">
            Default 10 menit. Tiap segmen berhenti otomatis lalu segmen berikutnya dimulai. Tekan{" "}
            <b>Stop</b> pada rekaman yang berjalan untuk menghentikan rangkaian.
          </p>

          <button
            className="btn primary wide"
            onClick={() => void start()}
            disabled={starting || !url.trim()}
          >
            <PlayIcon /> {starting ? "Menambahkan…" : "Mulai rekam"}
          </button>
          <p className="hint">
            Rekaman berjalan di proses worker. Jangan tutup terminal/worker selama rekaman berlangsung.
          </p>
        </div>

        <aside className="panel pad preview-panel">
          <div className="panel-head inline">
            <span>Pratinjau</span>
            {preview?.liveStatus && (
              <span className={`chip ${preview.isLive ? "rec" : preview.liveStatus === "is_upcoming" ? "wait" : "muted"}`}>
                {preview.isLive && <span className="live-dot" />}
                {LIVE_LABEL[preview.liveStatus] ?? preview.liveStatus}
              </span>
            )}
          </div>

          {previewing ? (
            <div className="preview-skeleton">
              <div className="skeleton thumb-skeleton" />
              <div className="skeleton line" />
              <div className="skeleton line short" />
            </div>
          ) : preview ? (
            <div className="preview-card">
              <div className="preview-thumb">
                {preview.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.thumbnail} alt="" />
                ) : (
                  <div className="thumb-fallback">
                    <PlayIcon />
                  </div>
                )}
                {preview.isLive && <span className="live-pill">LIVE</span>}
              </div>
              <h3 className="preview-title">{preview.title}</h3>
              <p className="muted small">{preview.channel || "Channel tidak diketahui"}</p>
              <div className="preview-meta">
                <span>{QUALITY_OPTIONS.find((option) => option.value === quality)?.label}</span>
                <span>{preview.durationSec ? formatDuration(preview.durationSec) : "durasi live"}</span>
                {fromStart && <span>dari awal</span>}
              </div>
              {!preview.isLive && (
                <div className="alert warn">
                  {preview.liveStatus === "is_upcoming"
                    ? "Stream belum mulai. Worker akan menunggu sampai live dimulai."
                    : preview.liveStatus === "was_live"
                      ? "Live sudah berakhir. Yang direkam adalah rekaman yang tersedia."
                      : "Link ini bukan live aktif. Rekaman mengambil video yang tersedia."}
                </div>
              )}
              <p className="hint">Kualitas terpilih: {selectedQuality?.note}</p>
            </div>
          ) : (
            <div className="preview-empty">
              <div className="empty-orb small">
                <span />
              </div>
              <p className="muted small">
                Tekan <b>Cek link</b> untuk melihat judul, channel, dan status live sebelum mulai.
              </p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
