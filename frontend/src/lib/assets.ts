import { api } from "@/lib/api";
import type { Job } from "@/lib/brief";
import type { Item, ReviewFlag } from "@/lib/items";

export type FieldSpec = {
  key: string;
  label: string;
  guidance: number; // characters that read well on the channel
  limit: number; // the most a save accepts
  multiline: boolean;
  hint: string;
};

export type AssetSpec = { key: string; label: string; description: string; fields: FieldSpec[] };

export type Asset = Item<Record<string, string>> & { review_flags: ReviewFlag[]; outdated: boolean };

export type AssetStage = {
  spec: AssetSpec[];
  assets: Asset[];
  job: Job | null;
  field_jobs: Partial<Record<string, Job>>; // keyed "<asset id>:<field>"
  blocked_reason: string | null;
};

const base = (projectId: string) => `/projects/${projectId}/assets`;

export const getAssets = (projectId: string) => api<AssetStage>(base(projectId));
export const generateAssets = (projectId: string) => api<Job>(`${base(projectId)}/generate`, { method: "POST" });
export const regenerateField = (projectId: string, assetId: string, field: string) =>
  api<Job>(`${base(projectId)}/${assetId}/fields/${field}/regenerate`, { method: "POST" });

export const approveAsset = (projectId: string, assetId: string) =>
  api<Item>(`/projects/${projectId}/items/${assetId}/approve`, { method: "POST" });
export const unapproveAsset = (projectId: string, assetId: string) =>
  api<Item>(`/projects/${projectId}/items/${assetId}/approve`, { method: "DELETE" });

export const fieldKey = (assetId: string, field: string) => `${assetId}:${field}`;

/** The asset as plain text, for copying into another tool. */
export function assetText(spec: AssetSpec, data: Record<string, string>) {
  return [spec.label, "", ...spec.fields.flatMap((f) => [`${f.label}:`, data[f.key] ?? "", ""])].join("\n").trim();
}

export type AssetStatus = "approved" | "outdated" | "edited" | "draft" | "missing";

export function assetStatus(asset: Asset | undefined): AssetStatus {
  if (!asset) return "missing";
  if (asset.approved_at) return "approved";
  if (asset.outdated) return "outdated";
  if (asset.unsaved_changes || asset.version > 1) return "edited";
  return "draft";
}

export const STATUS_LABELS: Record<AssetStatus, string> = {
  approved: "Approved",
  outdated: "Outdated",
  edited: "Edited",
  draft: "Draft",
  missing: "Not written",
};
