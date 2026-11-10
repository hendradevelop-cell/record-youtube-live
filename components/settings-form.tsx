"use client";

import { useState } from "react";
import type { AppSettings } from "@/lib/settings";
import type { UploadInfo } from "@/lib/upload-info";
import { formatBytes } from "@/lib/format";
import { CloudIcon } from "@/components/icons";

interface EngineInfo {
  ytdlp: string | null;
  ffmpeg: string | null;
  diskFreeBytes: number | null;
  diskTotalBytes: number | null;
}

interface Props {
  initialSettings: AppSettings;
  initialUpload: UploadInfo;
  engine: EngineInfo;
  recordingsPath: string;
}

const ENV_HINTS: Record<string, string> = {
  s3: `# .env.local
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
# opsional untuk R2 / MinIO / Backblaze:
S3_ENDPOINT=https://xxxx.r2.cloudflarestorage.com
S3_FORCE_PATH_STYLE=1
S3_PUBLIC_BASE_URL=https://cdn.contoh.com`,
  drive: `# .env.local
GOOGLE_APPLICATION_CREDENTIALS=C:\\path\\service-account.json

# Share folder Drive ke email service account (akses Editor)`,
  none: "",
};

export function SettingsForm({ initialSettings, initialUpload, engine, recordingsPath }: Props) {
  const [form, setForm] = useState<AppSettings>(initialSettings);
  const [upload, setUpload] = useState<UploadInfo>(initialUpload);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof AppSettings>(key: K, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as { error?: string; settings?: AppSettings; upload?: UploadInfo };
      if (!response.ok) throw new Error(data.error ?? "Gagal menyimpan pengaturan.");
      if (data.settings) setForm(data.settings);
      if (data.upload) setUpload(data.upload);
      setMessage("Pengaturan tersimpan. Worker memakainya pada job berikutnya.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan pengaturan.");
    } finally {
      setSaving(false);
    }
  }

  const provider = form.upload_provider;

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Konfigurasi</p>
          <h1>Pengaturan</h1>
          <p className="muted">Atur kualitas kerja worker dan tujuan upload cloud.</p>
        </div>
        <button className="btn primary" onClick={() => void save()} disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan pengaturan"}
        </button>
      </section>

      {message && <div className="alert ok">{message}</div>}
      {error && <div className="alert err">{error}</div>}

      <div className="settings-grid">
        <section className="panel pad">
          <div className="panel-head inline">
            <span>Worker</span>
          </div>
          <label className="field-label" htmlFor="max_concurrent">
            Maksimal rekaman bersamaan
          </label>
          <input
            id="max_concurrent"
            className="input"
            type="number"
            min={1}
            max={3}
            value={form.max_concurrent}
            onChange={(event) => update("max_concurrent", event.target.value)}
          />
          <p className="hint">
            Setiap rekaman 1080p memakai ~3–8 Mbps. Mulai dari 1 kalau koneksi terbatas.
          </p>

          <div className="divider" />

          <div className="panel-head inline">
            <span>Engine</span>
            <span className="muted small">dibaca saat halaman dimuat</span>
          </div>
          <ul className="status-list">
            <li>
              <span>yt-dlp</span>
              <span className={engine.ytdlp ? "ok-text" : "err-text"}>
                {engine.ytdlp ?? "belum terpasang (bin/yt-dlp.exe)"}
              </span>
            </li>
            <li>
              <span>ffmpeg</span>
              <span className={engine.ffmpeg ? "ok-text" : "err-text"}>
                {engine.ffmpeg ?? "belum terpasang di PATH"}
              </span>
            </li>
            <li>
              <span>Disk bebas</span>
              <span>
                {formatBytes(engine.diskFreeBytes)}
                {engine.diskTotalBytes ? ` / ${formatBytes(engine.diskTotalBytes)}` : ""}
              </span>
            </li>
            <li>
              <span>Folder rekaman</span>
              <code>{recordingsPath}</code>
            </li>
          </ul>
        </section>

        <section className="panel pad">
          <div className="panel-head inline">
            <span>Upload cloud</span>
            <CloudIcon />
          </div>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={form.auto_upload === "1"}
              onChange={(event) => update("auto_upload", event.target.checked ? "1" : "0")}
            />
            <span className="toggle" aria-hidden="true" />
            <span>
              Upload otomatis setelah rekaman selesai
              <span className="hint block">Bisa juga upload manual dari dashboard kalau gagal.</span>
            </span>
          </label>

          <label className="field-label" htmlFor="upload_provider">
            Provider
          </label>
          <select
            id="upload_provider"
            className="input"
            value={provider}
            onChange={(event) => update("upload_provider", event.target.value)}
          >
            <option value="none">Nonaktif (simpan lokal saja)</option>
            <option value="s3">S3-compatible (AWS, R2, MinIO, Backblaze)</option>
            <option value="drive">Google Drive (service account)</option>
          </select>

          {provider === "s3" && (
            <div className="field-stack">
              <label className="field-label" htmlFor="s3_bucket">
                Bucket
              </label>
              <input
                id="s3_bucket"
                className="input"
                placeholder="nama-bucket"
                value={form.s3_bucket}
                onChange={(event) => update("s3_bucket", event.target.value)}
              />
              <div className="two-col">
                <div>
                  <label className="field-label" htmlFor="s3_region">
                    Region
                  </label>
                  <input
                    id="s3_region"
                    className="input"
                    placeholder="ap-southeast-1"
                    value={form.s3_region}
                    onChange={(event) => update("s3_region", event.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="s3_prefix">
                    Prefix
                  </label>
                  <input
                    id="s3_prefix"
                    className="input"
                    placeholder="recordings/"
                    value={form.s3_prefix}
                    onChange={(event) => update("s3_prefix", event.target.value)}
                  />
                </div>
              </div>
              <label className="field-label" htmlFor="s3_endpoint">
                Endpoint (opsional)
              </label>
              <input
                id="s3_endpoint"
                className="input"
                placeholder="https://xxxx.r2.cloudflarestorage.com"
                value={form.s3_endpoint}
                onChange={(event) => update("s3_endpoint", event.target.value)}
              />
            </div>
          )}

          {provider === "drive" && (
            <div className="field-stack">
              <label className="field-label" htmlFor="gdrive_folder_id">
                Folder ID Google Drive
              </label>
              <input
                id="gdrive_folder_id"
                className="input"
                placeholder="1AbC…"
                value={form.gdrive_folder_id}
                onChange={(event) => update("gdrive_folder_id", event.target.value)}
              />
              <p className="hint">
                Ambil dari URL folder: drive.google.com/drive/folders/<b>FOLDER_ID</b>. Folder harus di-share ke
                service account sebagai Editor.
              </p>
            </div>
          )}

          {provider !== "none" && provider !== upload.provider && (
            <div className="alert warn spaced">
              <b>Belum disimpan.</b> Simpan pengaturan untuk memeriksa kredensial provider ini.
            </div>
          )}

          {provider !== "none" && provider === upload.provider && (
            <div className={`alert ${upload.configured ? "ok" : "warn"} spaced`}>
              <b>{upload.configured ? "Kredensial siap." : "Kredensial belum lengkap."}</b>
              {!upload.configured && upload.missing.length > 0 && (
                <span> Kurang: {upload.missing.join(", ")}.</span>
              )}
              <div className="small">{upload.note}</div>
            </div>
          )}

          {provider !== "none" && (
            <>
              <div className="field-label">Environment yang dibutuhkan</div>
              <pre className="code-block">{ENV_HINTS[provider]}</pre>
              <p className="hint">
                Kredensial dibaca worker dari <code>.env.local</code>. Restart worker setelah mengubah file itu.
              </p>
            </>
          )}
        </section>
      </div>

      <div className="settings-actions">
        <button className="btn primary" onClick={() => void save()} disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan pengaturan"}
        </button>
      </div>
    </>
  );
}
