import fs from "node:fs";
import { NextResponse } from "next/server";
import { deleteRecordingRow, getRecording } from "@/lib/db";
import { recordingDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

const ACTIVE = ["queued", "resolving", "waiting", "recording", "finalizing"];

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recording = getRecording(id);
  if (!recording) return NextResponse.json({ error: "Rekaman tidak ditemukan." }, { status: 404 });
  return NextResponse.json({ recording });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recording = getRecording(id);
  if (!recording) return NextResponse.json({ error: "Rekaman tidak ditemukan." }, { status: 404 });
  if (ACTIVE.includes(recording.status)) {
    return NextResponse.json({ error: "Hentikan rekaman dulu sebelum menghapus." }, { status: 409 });
  }

  fs.rmSync(recordingDir(id), { recursive: true, force: true });
  deleteRecordingRow(id);
  return NextResponse.json({ ok: true });
}
