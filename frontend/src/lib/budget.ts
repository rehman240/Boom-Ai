import { api } from "@/lib/api";
import type { Job } from "@/lib/brief";
import type { Item, ReviewFlag } from "@/lib/items";

export type BudgetLine = { id: string; channel: string; role: string; amount_cents: number; locked: boolean };
export type ProductionLine = { id: string; item: string; amount_cents: number | null };

export type BudgetData = {
  total_cents: number;
  lines: BudgetLine[];
  reasoning: string;
  assumptions: string[];
  based_on: { source: string; detail: string }[];
  production: ProductionLine[];
};

export type BudgetPlan = Item<BudgetData> & {
  percents: Record<string, number>;
  review_flags: ReviewFlag[];
  outdated: boolean;
  total_changed: boolean;
};

export type BudgetStage = {
  plan: BudgetPlan | null;
  job: Job | null;
  blocked_reason: string | null;
  total_cents: number;
  start_date: string | null;
  end_date: string | null;
  channels: string[];
};

export const MAX_LINES = 8;
export const MAX_PRODUCTION = 10;

const base = (projectId: string) => `/projects/${projectId}/budget`;

export const getBudget = (projectId: string) => api<BudgetStage>(base(projectId));
export const generateBudget = (projectId: string) => api<Job>(`${base(projectId)}/generate`, { method: "POST" });
export const changeLine = (
  projectId: string,
  lineId: string,
  change: Partial<Pick<BudgetLine, "amount_cents" | "locked" | "channel" | "role">>,
) => api<BudgetPlan>(`${base(projectId)}/lines/${lineId}`, { method: "PATCH", json: change });
export const addLine = (projectId: string, channel: string) =>
  api<BudgetPlan>(`${base(projectId)}/lines`, { method: "POST", json: { channel } });
export const removeLine = (projectId: string, lineId: string) =>
  api<BudgetPlan>(`${base(projectId)}/lines/${lineId}`, { method: "DELETE" });
export const fitToBrief = (projectId: string) => api<BudgetPlan>(`${base(projectId)}/fit`, { method: "POST" });
/** The AI's latest mix comes back; production costs the user entered stay. */
export const resetSuggestion = (projectId: string) => api<BudgetPlan>(`${base(projectId)}/reset`, { method: "POST" });

/** $12,000 or $12,000.50: cents only when there are some. */
export function money(cents: number): string {
  const whole = cents % 100 === 0;
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** What the user typed in a money box, in cents, or null if it isn't an amount. "$1,200.5" is fine. */
export function parseMoney(text: string): number | null {
  const clean = text.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** The amount as it sits in an input: no symbol, cents only when there are some. */
export const inputValue = (cents: number | null) =>
  cents === null ? "" : cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);

/** Days from start to end, both included, or null if the dates aren't set. */
export function campaignDays(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  return days > 0 ? days : null;
}
