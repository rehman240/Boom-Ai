import { api, ApiError } from "@/lib/api";

export type PartKey = "brief" | "target" | "concept" | "assets" | "budget" | "measurement";

export type ChecklistRow = {
  key: PartKey;
  label: string;
  status: "approved" | "waiting" | "missing";
  detail: string; // what is approved, or what to do next
  item_ids: string[]; // the items to approve for this part
  flags: number; // claims in this part that need a human check
};

export type ReviewStage = {
  checklist: ChecklistRow[];
  final: boolean;
  status_note: string;
  not_published: string;
  ai_note: string;
  version_label: string;
};

export type ExportFormat = "pdf" | "docx";

export const getReview = (projectId: string) => api<ReviewStage>(`/projects/${projectId}/review`);

/** Downloads the export as a file. Fetched first, so an error shows on the page
 * instead of a broken download. */
export async function downloadExport(projectId: string, format: ExportFormat) {
  let res: Response;
  try {
    res = await fetch(`/api/projects/${projectId}/export.${format}`, { credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = (body as { detail?: unknown } | null)?.detail;
    throw new ApiError(res.status, typeof detail === "string" ? detail : "The export failed. Please try again.");
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `campaign.${format}`;
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
