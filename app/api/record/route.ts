import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createRecording, db, listRecordings } from "@/lib/db";
import { normalizeYoutubeUrl } from "@/lib/youtube";
import type { Quality } from "@/lib/types";

export const dynamic = "force-dynamic";

const QUALITIES = new Set<Quality>(["best", "1080", "720", "audio"]);
const ACTIVE = ["queued", "resolving", "waiting", "recording", "finalizing"];

export async function GET() {
  const recordings = listRecordings();
  const active = recordings.filter((item) => ACTIVE.includes(item.status)).length;
  return NextResponse.json({ recordings, active });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const raw = typeof body?.url === "string" ? body.url : "";
  const quality = typeof body?.quality === "string" ? (body.quality as Quality) : "best";

  const normalized = normalizeYoutubeUrl(raw);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }
  if (!QUALITIES.has(quality)) {
    return NextResponse.json({ error: "Kualitas rekaman tidak dikenal." }, { status: 400 });
  }

  const duplicate = db
    .prepare(
      `SELECT id FROM recording WHERE url = ? AND status IN (${ACTIVE.map(() => "?").join(",")}) LIMIT 1`,
    )
    .get(normalized.url, ...ACTIVE) as { id: string } | undefined;
  if (duplicate) {
    return NextResponse.json(
      { error: "Link ini sudah punya rekaman yang sedang berjalan.", id: duplicate.id },
      { status: 409 },
    );
  }

  let autoStopMinutes = 0;
  if (body?.autoStopMinutes !== undefined && body?.autoStopMinutes !== null) {
    const requested = Number(body.autoStopMinutes);
    if (!Number.isInteger(requested) || requested < 0 || requested > 1440) {
      return NextResponse.json({ error: "Auto-stop harus 0–1440 menit." }, { status: 400 });
    }
    autoStopMinutes = requested;
  }

  const recording = createRecording({
    id: randomUUID(),
    url: normalized.url,
    quality,
    fromStart: body?.fromStart === true,
    autoStopMinutes,
  });

  return NextResponse.json({ recording }, { status: 201 });
}
