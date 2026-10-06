import { api } from "@/lib/api";

/** One audience card, direction or asset. `data` is the working copy the user edits. */
export type Item<T = Record<string, unknown>> = {
  id: string;
  kind: "audience" | "direction" | "asset";
  key: string;
  position: number;
  data: T;
  origin: "ai" | "user";
  selected: boolean;
  approved_at: string | null;
  version: number;
  unsaved_changes: boolean;
  updated_at: string;
};

export type Revision<T = Record<string, unknown>> = {
  number: number;
  source: "generated" | "field_regenerated" | "saved" | "kept_edits" | "restored" | "created" | "copied";
  label: string | null;
  field: string | null;
  restored_from: number | null;
  project_version: number;
  provider: string | null;
  model: string | null;
  prompt_version: string | null;
  created_at: string;
  data: T;
};

export type ReviewFlag = { claim: string; category: string; reason: string };

const base = (projectId: string, itemId: string) => `/projects/${projectId}/items/${itemId}`;

export const editItem = <T>(projectId: string, itemId: string, data: Partial<T>) =>
  api<Item<T>>(base(projectId, itemId), { method: "PATCH", json: { data } });
export const selectItem = (projectId: string, itemId: string) =>
  api<Item>(`${base(projectId, itemId)}/select`, { method: "POST" });
export const listVersions = (projectId: string, itemId: string) => api<Revision[]>(`${base(projectId, itemId)}/versions`);
export const saveVersion = (projectId: string, itemId: string, label?: string) =>
  api<Revision>(`${base(projectId, itemId)}/versions`, { method: "POST", json: { label: label ?? null } });
export const restoreVersion = (projectId: string, itemId: string, number: number) =>
  api<Item>(`${base(projectId, itemId)}/versions/${number}/restore`, { method: "POST" });

/** Why a version exists, in words. */
export function revisionLabel(r: Revision): string {
  switch (r.source) {
    case "generated":
      return "Written by AI";
    case "field_regenerated":
      return `AI rewrote ${r.field ? r.field.replaceAll("_", " ") : "one field"}`;
    case "saved":
      return "Saved by you";
    case "kept_edits":
      return "Your edits, kept";
    case "restored":
      return r.restored_from ? `Restored version ${r.restored_from}` : "Restored";
    case "created":
      return "Written by you";
    case "copied":
      return "Copied from another campaign";
  }
}

export const FLAG_LABELS: Record<string, string> = {
  health: "Health claim",
  finance: "Financial claim",
  performance: "Performance claim",
  sensitive: "Sensitive trait",
  legal: "Legal",
  other: "Check this",
};
