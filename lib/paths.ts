import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.join(process.cwd(), "data");
export const RECORDINGS_DIR = path.join(DATA_DIR, "recordings");
export const DB_PATH = path.join(DATA_DIR, "app.db");

export function ensureDataDirs() {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

export function recordingDir(id: string) {
  return path.join(RECORDINGS_DIR, id);
}

export function toStoredPath(absolute: string) {
  return path.relative(process.cwd(), absolute).split(path.sep).join("/");
}

export function fromStoredPath(stored: string) {
  const absolute = path.resolve(process.cwd(), stored);
  const root = path.resolve(RECORDINGS_DIR);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw new Error("Path di luar folder rekaman");
  }
  return absolute;
}
