const ALLOWED_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
];

export function normalizeYoutubeUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Link YouTube masih kosong." };
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, error: "Format link tidak valid." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Hanya link http/https yang didukung." };
  }
  if (!ALLOWED_HOSTS.includes(parsed.hostname.toLowerCase())) {
    return { ok: false, error: "Hanya link YouTube (youtube.com / youtu.be) yang didukung." };
  }

  const segments = parsed.pathname.toLowerCase().split("/").filter(Boolean);
  const isVideo =
    parsed.hostname === "youtu.be" ||
    parsed.pathname === "/watch" ||
    segments.includes("live") ||
    segments[0] === "shorts";
  if (!isVideo) {
    return { ok: false, error: "Link bukan ke video/live. Contoh: https://www.youtube.com/live/XXXX" };
  }

  return { ok: true, url: parsed.toString() };
}
