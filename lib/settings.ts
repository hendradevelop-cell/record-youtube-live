import { getSettings, setSettings } from "./db";

export const SETTING_DEFAULTS = {
  max_concurrent: "1",
  auto_upload: "0",
  upload_provider: "none",
  s3_bucket: "",
  s3_region: "ap-southeast-1",
  s3_endpoint: "",
  s3_prefix: "recordings/",
  gdrive_folder_id: "",
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export type AppSettings = Record<SettingKey, string>;

export function loadSettings(): AppSettings {
  const stored = getSettings();
  const merged = { ...SETTING_DEFAULTS } as AppSettings;
  for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) {
    if (stored[key] !== undefined) merged[key] = stored[key];
  }
  return merged;
}

export function saveSettings(patch: Record<string, string>) {
  const allowed = new Set<string>(Object.keys(SETTING_DEFAULTS));
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (allowed.has(key) && typeof value === "string") clean[key] = value.slice(0, 500);
  }
  setSettings(clean);
}
