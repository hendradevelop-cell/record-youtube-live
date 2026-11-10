import { NextResponse } from "next/server";
import { getRecording, updateRecording } from "@/lib/db";
import { killTree } from "@/lib/ytdlp";

export const dynamic = "force-dynamic";

const RUNNING = ["resolving", "waiting", "recording", "finalizing"];

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recording = getRecording(id);
  if (!recording) return NextResponse.json({ error: "Rekaman tidak ditemukan." }, { status: 404 });

  if (recording.status === "queued") {
    updateRecording(id, { status: "cancelled", ended_at: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  }

  if (!RUNNING.includes(recording.status)) {
    return NextResponse.json({ error: "Rekaman ini sudah tidak berjalan." }, { status: 409 });
  }

  updateRecording(id, { cancel_requested: 1 });
  if (recording.pid) killTree(recording.pid);
  return NextResponse.json({ ok: true });
}
