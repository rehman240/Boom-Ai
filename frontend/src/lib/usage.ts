import { api } from "@/lib/api";

export type UsageRow = {
  label: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
};

export type UsageReport = {
  recorded_since: string | null;
  price_input_per_mtok: number;
  price_output_per_mtok: number;
  today: UsageRow;
  this_month: UsageRow;
  all_time: UsageRow;
  by_day: UsageRow[];
  by_step: UsageRow[];
  by_project: UsageRow[];
  by_model: UsageRow[];
};

export const getUsage = () => api<UsageReport>("/account/usage");

/** Job kinds as the user knows the steps. */
export const STEP_NAMES: Record<string, string> = {
  brief_summary: "Brief summary",
  audience: "Identify target",
  directions: "Campaign directions",
  assets: "Creative assets",
  field: "Single field regenerate",
  budget: "Budget split",
};

/** Small amounts need more than cents to be useful: one summary is about $0.03. */
export const usd = (n: number) => `$${n.toFixed(n !== 0 && n < 1 ? 4 : 2)}`;

export const tokens = (n: number) => n.toLocaleString("en-US");
