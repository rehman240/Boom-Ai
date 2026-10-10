import { api } from "@/lib/api";
import type { Item } from "@/lib/items";

export type ChecklistStep = { id: string; text: string; done: boolean };
export type Cadence = "daily" | "twice_weekly" | "weekly" | "every_two_weeks" | "end_only";

export type MeasurementData = {
  goal: string;
  landing_url: string;
  checklist: ChecklistStep[];
  review_cadence: Cadence;
};

export type MeasurementPlan = Item<MeasurementData> & { review_dates: string[] };

export type Entry = {
  id: string;
  period: string;
  spend_cents: number | null;
  leads: number | null;
  sales: number | null;
  revenue_cents: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type EntryInput = Omit<Entry, "id" | "created_at" | "updated_at">;

export type Result = {
  key: string;
  label: string;
  unit: "money" | "percent" | "ratio";
  value: number | null;
  definition: string;
  missing: string | null;
  note: string | null;
};

export type ConversionStage = {
  plan: MeasurementPlan | null;
  entries: Entry[];
  totals: { spend_cents: number | null; leads: number | null; sales: number | null; revenue_cents: number | null };
  results: Result[];
  blocked_reason: string | null;
  media_budget_cents: number;
  start_date: string | null;
  end_date: string | null;
};

export const CADENCES: { value: Cadence; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "twice_weekly", label: "Twice a week" },
  { value: "weekly", label: "Every week" },
  { value: "every_two_weeks", label: "Every two weeks" },
  { value: "end_only", label: "Only at the end" },
];
export const MAX_CHECKLIST = 15;

const base = (projectId: string) => `/projects/${projectId}/conversions`;

export const getConversions = (projectId: string) => api<ConversionStage>(base(projectId));
export const createPlan = (projectId: string) => api<ConversionStage>(`${base(projectId)}/plan`, { method: "POST" });
export const tickStep = (projectId: string, stepId: string, done: boolean) =>
  api<ConversionStage>(`${base(projectId)}/plan/checklist/${stepId}`, { method: "PUT", json: { done } });
export const addEntry = (projectId: string, entry: EntryInput) =>
  api<ConversionStage>(`${base(projectId)}/entries`, { method: "POST", json: entry });
export const changeEntry = (projectId: string, entryId: string, entry: EntryInput) =>
  api<ConversionStage>(`${base(projectId)}/entries/${entryId}`, { method: "PUT", json: entry });
export const deleteEntry = (projectId: string, entryId: string) =>
  api<ConversionStage>(`${base(projectId)}/entries/${entryId}`, { method: "DELETE" });

/** A result's value in words: $20, 20%, 3.6x. */
export function formatResult(r: Result, money: (cents: number) => string): string {
  if (r.value === null) return "";
  if (r.unit === "money") return money(Math.round(r.value));
  if (r.unit === "percent") return `${r.value.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
  return `${r.value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}x`;
}

/** A whole number the user typed, or null if the box is empty. Undefined means it isn't a number. */
export function parseCount(text: string): number | null | undefined {
  const clean = text.replace(/[,\s]/g, "");
  if (clean === "") return null;
  return /^\d+$/.test(clean) ? Number(clean) : undefined;
}

export const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
