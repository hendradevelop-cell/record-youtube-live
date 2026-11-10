export type RecordingStatus =
  | "queued"
  | "resolving"
  | "waiting"
  | "recording"
  | "finalizing"
  | "ready"
  | "failed"
  | "cancelled";

export type Quality = "best" | "1080" | "720" | "audio";
export type UploadStatus = "idle" | "pending" | "uploading" | "done" | "failed";
export type UploadProvider = "none" | "s3" | "drive";

export interface Recording {
  id: string;
  url: string;
  video_id: string | null;
  title: string | null;
  channel: string | null;
  thumbnail: string | null;
  duration_sec: number | null;
  quality: Quality;
  status: RecordingStatus;
  live_status: string | null;
  from_start: number;
  auto_stop_minutes: number;
  auto_stopped: number;
  file_path: string | null;
  file_size: number | null;
  progress_bytes: number | null;
  progress_speed: number | null;
  pid: number | null;
  cancel_requested: number;
  retries: number;
  error: string | null;
  upload_status: UploadStatus;
  upload_url: string | null;
  upload_error: string | null;
  started_at: string | null;
  record_started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface ResolvedVideo {
  videoId: string;
  url: string;
  title: string;
  channel: string;
  thumbnail: string | null;
  durationSec: number | null;
  isLive: boolean;
  liveStatus: string | null;
}
