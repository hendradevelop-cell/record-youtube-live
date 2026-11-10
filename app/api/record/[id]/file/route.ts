import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { getRecording } from "@/lib/db";
import { fromStoredPath } from "@/lib/paths";
import { mimeForFile } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recording = getRecording(id);
  if (!recording?.file_path) {
    return new Response("Rekaman tidak ditemukan.", { status: 404 });
  }

  let absolute: string;
  try {
    absolute = fromStoredPath(recording.file_path);
  } catch {
    return new Response("Path tidak valid.", { status: 403 });
  }
  if (!fs.existsSync(absolute)) {
    return new Response("File rekaman sudah tidak ada di disk.", { status: 404 });
  }

  const stat = fs.statSync(absolute);
  const mime = mimeForFile(absolute);
  const filename = path.basename(absolute);
  const download = new URL(request.url).searchParams.get("download") === "1";
  const disposition = `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(filename)}`;
  const range = request.headers.get("range");

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : stat.size - 1;
    if (!Number.isFinite(start) || start >= stat.size || end < start) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${stat.size}` },
      });
    }
    const stream = fs.createReadStream(absolute, { start, end });
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      status: 206,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Disposition": disposition,
      },
    });
  }

  const stream = fs.createReadStream(absolute);
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Content-Disposition": disposition,
    },
  });
}
