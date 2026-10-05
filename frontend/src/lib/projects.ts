import { api } from "@/lib/api";
import type { AiEngine, UserRole } from "@/lib/brief";

export type ProjectStatus = "draft" | "in_progress" | "ready";

export type Project = {
  id: string;
  name: string;
  status: ProjectStatus;
  stage: string;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
};

export type Dashboard = {
  projects: Project[];
  stats: { active_campaigns: number; assets_drafted: number; ready_to_export: number };
};

export const getDashboard = () => api<Dashboard>("/projects");
export const createProject = (name: string, user_role: UserRole, ai_engine: AiEngine) =>
  api<Project>("/projects", { method: "POST", json: { name, user_role, ai_engine } });
export const renameProject = (id: string, name: string) =>
  api<Project>(`/projects/${id}`, { method: "PATCH", json: { name } });
export const duplicateProject = (id: string) => api<Project>(`/projects/${id}/duplicate`, { method: "POST" });
export const deleteProject = (id: string) => api<void>(`/projects/${id}`, { method: "DELETE" });

/** Where a campaign opens. Every stage is a page under the campaign. */
export const projectHref = (p: Pick<Project, "id" | "stage">) => `/projects/${p.id}/${p.stage}`;

const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  in_progress: "In progress",
  ready: "Ready",
};

const STATUS_STYLES: Record<ProjectStatus, string> = {
  draft: "border-border-strong bg-surface-3 text-muted",
  in_progress: "border-primary/40 bg-primary/15 text-cyan",
  ready: "border-success/40 bg-success/15 text-success",
};

export const statusLabel = (s: ProjectStatus) => STATUS_LABELS[s] ?? s;
export const statusStyle = (s: ProjectStatus) => STATUS_STYLES[s] ?? STATUS_STYLES.draft;

const STAGE_LABELS: Record<string, string> = {
  brief: "Campaign brief",
  target: "Identify target",
  campaign: "Campaign direction",
  creative: "Creative workspace",
  budget: "Budget",
  conversions: "Conversions",
  review: "Review and export",
};

export const stageLabel = (stage: string) => STAGE_LABELS[stage] ?? "Campaign brief";

/** Guards the /projects/[id]/[stage] URL, so a typed-in stage can't render a broken page. */
export const isStage = (stage: string) => stage in STAGE_LABELS;

/** "today", "yesterday", "12 Sep", "12 Sep 2025". Runs in the browser, so it uses local time. */
export function editedWhen(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "recently";

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86_400_000);

  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;

  const sameYear = then.getFullYear() === new Date().getFullYear();
  return then.toLocaleDateString("en-US", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}
