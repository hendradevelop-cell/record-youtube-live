import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { DATA_DIR } from "./paths";
import type { Recording } from "./types";

mkdirSync(DATA_DIR, { recursive: true });

const globalForDb = globalThis as unknown as { __recorderDb?: DatabaseSync };

function createDb() {
  const db = new DatabaseSync(path.join(DATA_DIR, "app.db"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS recording (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      video_id TEXT,
      title TEXT,
      channel TEXT,
      thumbnail TEXT,
      duration_sec REAL,
      quality TEXT NOT NULL DEFAULT 'best',
      status TEXT NOT NULL DEFAULT 'queued',
      live_status TEXT,
      from_start INTEGER NOT NULL DEFAULT 0,
      auto_stop_minutes INTEGER NOT NULL DEFAULT 0,
      auto_stopped INTEGER NOT NULL DEFAULT 0,
      file_path TEXT,
      file_size INTEGER,
      progress_bytes INTEGER,
      progress_speed REAL,
      pid INTEGER,
      cancel_requested INTEGER NOT NULL DEFAULT 0,
      retries INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      upload_status TEXT NOT NULL DEFAULT 'idle',
      upload_url TEXT,
      upload_error TEXT,
      started_at TEXT,
      record_started_at TEXT,
      ended_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_recording_status ON recording(status);
    CREATE INDEX IF NOT EXISTS idx_recording_created ON recording(created_at DESC);
    CREATE TABLE IF NOT EXISTS setting (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const columns = db.prepare("PRAGMA table_info(recording)").all() as unknown as { name: string }[];
  if (!columns.some((column) => column.name === "from_start")) {
    db.exec("ALTER TABLE recording ADD COLUMN from_start INTEGER NOT NULL DEFAULT 0");
  }
  if (!columns.some((column) => column.name === "auto_stop_minutes")) {
    db.exec("ALTER TABLE recording ADD COLUMN auto_stop_minutes INTEGER NOT NULL DEFAULT 0");
  }
  if (!columns.some((column) => column.name === "auto_stopped")) {
    db.exec("ALTER TABLE recording ADD COLUMN auto_stopped INTEGER NOT NULL DEFAULT 0");
  }
  if (!columns.some((column) => column.name === "record_started_at")) {
    db.exec("ALTER TABLE recording ADD COLUMN record_started_at TEXT");
  }
  return db;
}

export const db = globalForDb.__recorderDb ?? (globalForDb.__recorderDb = createDb());

const ACTIVE_STATUSES = ["resolving", "waiting", "recording", "finalizing"];

export function listRecordings(limit = 200): Recording[] {
  return db
    .prepare("SELECT * FROM recording ORDER BY created_at DESC LIMIT ?")
    .all(limit) as unknown as Recording[];
}

export function getRecording(id: string): Recording | null {
  return (db.prepare("SELECT * FROM recording WHERE id = ?").get(id) as unknown as Recording) ?? null;
}

export function createRecording(input: {
  id: string;
  url: string;
  quality: string;
  title?: string | null;
  videoId?: string | null;
  fromStart?: boolean;
  autoStopMinutes?: number;
}): Recording {
  db.prepare(
    `INSERT INTO recording (id, url, quality, title, video_id, from_start, auto_stop_minutes, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?)`,
  ).run(
    input.id,
    input.url,
    input.quality,
    input.title ?? null,
    input.videoId ?? null,
    input.fromStart ? 1 : 0,
    Math.max(0, Math.min(1440, Math.round(input.autoStopMinutes ?? 0))),
    new Date().toISOString(),
  );
  return getRecording(input.id) as Recording;
}

export function countActive(): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM recording WHERE status IN (${ACTIVE_STATUSES.map(() => "?").join(",")})`)
    .get(...ACTIVE_STATUSES) as unknown as { n: number };
  return row.n;
}

export function claimNextJob(maxActive: number): Recording | null {
  if (countActive() >= maxActive) return null;
  const row = db
    .prepare(
      `UPDATE recording SET status = 'resolving', started_at = ?
       WHERE id = (SELECT id FROM recording WHERE status = 'queued' ORDER BY created_at LIMIT 1)
       RETURNING *`,
    )
    .get(new Date().toISOString()) as unknown as Recording | undefined;
  return row ?? null;
}

export function claimUpload(): Recording | null {
  const row = db
    .prepare(
      `UPDATE recording SET upload_status = 'uploading'
       WHERE id = (
         SELECT id FROM recording
         WHERE upload_status = 'pending' AND file_path IS NOT NULL AND status IN ('ready', 'cancelled')
         ORDER BY created_at LIMIT 1
       )
       RETURNING *`,
    )
    .get() as unknown as Recording | undefined;
  return row ?? null;
}

const UPDATABLE = new Set<keyof Recording>([
  "video_id",
  "title",
  "channel",
  "thumbnail",
  "duration_sec",
  "status",
  "live_status",
  "from_start",
  "auto_stop_minutes",
  "auto_stopped",
  "file_path",
  "file_size",
  "progress_bytes",
  "progress_speed",
  "pid",
  "cancel_requested",
  "retries",
  "error",
  "upload_status",
  "upload_url",
  "upload_error",
  "started_at",
  "record_started_at",
  "ended_at",
]);

export function updateRecording(id: string, patch: Partial<Recording>) {
  const entries = Object.entries(patch).filter(
    ([key, value]) => UPDATABLE.has(key as keyof Recording) && value !== undefined,
  );
  if (entries.length === 0) return;
  const sql = `UPDATE recording SET ${entries.map(([key]) => `${key} = ?`).join(", ")} WHERE id = ?`;
  const values = entries.map(([, value]) => (typeof value === "boolean" ? Number(value) : value));
  db.prepare(sql).run(...(values as never[]), id);
}

export function deleteRecordingRow(id: string) {
  db.prepare("UPDATE recording SET pid = NULL WHERE id = ?").run(id);
  db.prepare("DELETE FROM recording WHERE id = ?").run(id);
}

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM setting WHERE key = ?").get(key) as unknown as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function getSettings(): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM setting").all() as unknown as {
    key: string;
    value: string;
  }[];
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export function setSettings(patch: Record<string, string>) {
  const statement = db.prepare(
    "INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  for (const [key, value] of Object.entries(patch)) statement.run(key, value);
}
