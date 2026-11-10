import fs from "node:fs";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { drive } from "@googleapis/drive";
import { GoogleAuth } from "google-auth-library";
import { loadSettings } from "./settings";

export async function uploadFile(file: string, fileName: string, mime: string): Promise<string> {
  const settings = loadSettings();

  if (settings.upload_provider === "s3") {
    const bucket = settings.s3_bucket;
    const region = settings.s3_region || "us-east-1";
    const endpoint = settings.s3_endpoint || undefined;
    const prefixRaw = settings.s3_prefix || "";
    const prefix = prefixRaw && !prefixRaw.endsWith("/") ? `${prefixRaw}/` : prefixRaw;
    const key = `${prefix}${fileName}`;

    const forcePathStyle = process.env.S3_FORCE_PATH_STYLE
      ? process.env.S3_FORCE_PATH_STYLE === "1"
      : Boolean(endpoint);

    const client = new S3Client({
      region,
      endpoint,
      forcePathStyle,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
        sessionToken: process.env.AWS_SESSION_TOKEN || undefined,
      },
    });

    const uploader = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: fs.createReadStream(file),
        ContentType: mime,
      },
    });
    await uploader.done();

    const publicBase = process.env.S3_PUBLIC_BASE_URL?.replace(/\/+$/, "");
    if (publicBase) return `${publicBase}/${encodeURI(key)}`;
    if (endpoint) return `${endpoint.replace(/\/+$/, "")}/${bucket}/${encodeURI(key)}`;
    return `https://${bucket}.s3.${region}.amazonaws.com/${encodeURI(key)}`;
  }

  if (settings.upload_provider === "drive") {
    const auth = new GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });
    const api = drive({ version: "v3", auth });
    const result = await api.files.create({
      requestBody: {
        name: fileName,
        parents: settings.gdrive_folder_id ? [settings.gdrive_folder_id] : undefined,
      },
      media: { mimeType: mime, body: fs.createReadStream(file) },
      fields: "id, webViewLink",
      supportsAllDrives: true,
    });
    return result.data.webViewLink ?? `https://drive.google.com/file/d/${result.data.id}/view`;
  }

  throw new Error("Provider upload belum dikonfigurasi.");
}
