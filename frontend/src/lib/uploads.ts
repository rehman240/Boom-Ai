import { api } from "@/lib/api";

export type UploadKind = "logo" | "reference";

export type Upload = {
  id: string;
  kind: UploadKind;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
};

/** Mirrors the server. Both check, so a slow or edited page can't get past the rules. */
export const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
export const MAX_MB = 5;
export const MAX_FILES = 10;

export const listUploads = (projectId: string) => api<Upload[]>(`/projects/${projectId}/uploads`);

export function uploadFile(projectId: string, file: File, kind: UploadKind) {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", kind);
  return api<Upload>(`/projects/${projectId}/uploads`, { method: "POST", body });
}

export const deleteUpload = (projectId: string, uploadId: string) =>
  api<void>(`/projects/${projectId}/uploads/${uploadId}`, { method: "DELETE" });

/** Files are private, so they are served by the API rather than from a public bucket. */
export const fileUrl = (projectId: string, uploadId: string) =>
  `/api/projects/${projectId}/uploads/${uploadId}/file`;

export const isImage = (contentType: string) => contentType.startsWith("image/");

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The same complaint the server would make, but without the round trip. */
export function checkFile(file: File): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_MB * 1024 * 1024) return `That file is larger than ${MAX_MB} MB.`;
  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    return "SVG files aren't accepted. Please use a PNG, JPEG or WebP.";
  }
  if (!ALLOWED_TYPES.includes(file.type)) return "Please choose a PNG, JPEG, WebP or PDF file.";
  return null;
}
