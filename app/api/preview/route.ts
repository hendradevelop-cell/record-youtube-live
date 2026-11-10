import { NextResponse } from "next/server";
import { normalizeYoutubeUrl } from "@/lib/youtube";
import { resolveVideo } from "@/lib/ytdlp";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const raw = typeof body?.url === "string" ? body.url : "";
  const normalized = normalizeYoutubeUrl(raw);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  try {
    const video = await resolveVideo(normalized.url);
    return NextResponse.json(video);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal mengambil metadata video.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
