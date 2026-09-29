import { api } from "@/lib/api";

export type Brief = {
  project_id: string;
  business_name: string | null;
  product_or_service: string | null;
  product_url: string | null;
  description: string | null;
  differentiators: string | null;
  goal: string | null;
  offer_terms: string | null;
  target_location: string | null;
  language: string;
  brand_voice: string[];
  exclusions: string | null;
  channels: string[];
  start_date: string | null;
  end_date: string | null;
  budget_amount: string | null;
  currency: string;
  summary_confirmed_at: string | null;
  updated_at: string;
};

export type BriefState = { brief: Brief; missing_required: string[] };

/**
 * Only the fields a person edits; language and currency are fixed for this release.
 * Empty is "" rather than null, so every input stays controlled.
 */
export type BriefDraft = {
  business_name: string;
  product_or_service: string;
  product_url: string;
  description: string;
  differentiators: string;
  goal: string;
  offer_terms: string;
  target_location: string;
  brand_voice: string[];
  exclusions: string;
  channels: string[];
  start_date: string;
  end_date: string;
  budget_amount: string;
};

export const getBrief = (projectId: string) => api<BriefState>(`/projects/${projectId}/brief`);

export const saveBrief = (projectId: string, changes: Partial<BriefDraft>) =>
  api<BriefState>(`/projects/${projectId}/brief`, { method: "PATCH", json: changes });

export const GOALS = [
  "Preorders",
  "Sales",
  "Leads",
  "Sign-ups",
  "Bookings",
  "Downloads",
  "Store visits",
  "Awareness",
] as const;

export const BRAND_VOICES = [
  "Clear",
  "Modern",
  "Warm",
  "Bold",
  "Playful",
  "Professional",
  "Friendly",
  "Premium",
] as const;

export const CHANNELS = [
  "Instagram",
  "Facebook",
  "TikTok",
  "YouTube",
  "Google Search",
  "LinkedIn",
  "Email",
  "X",
] as const;

/** Matches REQUIRED_FIELDS on the server, for the checklist in the sidebar. */
export const REQUIRED_LABELS: Record<string, string> = {
  business_name: "Business name",
  product_or_service: "Product or service",
  description: "One sentence description",
  differentiators: "What makes it different",
  goal: "Campaign goal",
  target_location: "Target location",
  budget_amount: "Indicative media budget",
};

export const EMPTY_DRAFT: BriefDraft = {
  business_name: "",
  product_or_service: "",
  product_url: "",
  description: "",
  differentiators: "",
  goal: "",
  offer_terms: "",
  target_location: "",
  brand_voice: [],
  exclusions: "",
  channels: [],
  start_date: "",
  end_date: "",
  budget_amount: "",
};

/** The API uses null for empty; the form uses "" so inputs stay controlled. */
export function toDraft(brief: Brief): BriefDraft {
  return {
    business_name: brief.business_name ?? "",
    product_or_service: brief.product_or_service ?? "",
    product_url: brief.product_url ?? "",
    description: brief.description ?? "",
    differentiators: brief.differentiators ?? "",
    goal: brief.goal ?? "",
    offer_terms: brief.offer_terms ?? "",
    target_location: brief.target_location ?? "",
    brand_voice: brief.brand_voice ?? [],
    exclusions: brief.exclusions ?? "",
    channels: brief.channels ?? [],
    start_date: brief.start_date ?? "",
    end_date: brief.end_date ?? "",
    // The API sends money as "12000.00"; a number field reads better as "12000".
    budget_amount: brief.budget_amount ? String(Number(brief.budget_amount)) : "",
  };
}
