import { api } from "@/lib/api";
import type { Job } from "@/lib/brief";
import type { Item, ReviewFlag } from "@/lib/items";

export type AudienceData = {
  name: string;
  definition: string;
  need: string;
  motivation: string;
  objection: string;
  message_angle: string;
  channels: string[];
  based_on: { source: string; detail: string }[];
  assumptions: string[];
};

export type AudienceCard = Item<AudienceData> & { review_flags: ReviewFlag[] };

export type AudienceStage = {
  cards: AudienceCard[];
  exclusions: string[];
  job: Job | null;
  blocked_reason: string | null;
};

/** The fields a person writes or edits. "Based on" and assumptions come from the AI. */
export type AudienceDraft = Pick<
  AudienceData,
  "name" | "definition" | "need" | "motivation" | "objection" | "message_angle" | "channels"
>;

export const EMPTY_AUDIENCE: AudienceDraft = {
  name: "",
  definition: "",
  need: "",
  motivation: "",
  objection: "",
  message_angle: "",
  channels: [],
};

export const MAX_CHANNELS = 5;
export const MAX_EXCLUSIONS = 10;

const base = (projectId: string) => `/projects/${projectId}/audiences`;

export const getAudiences = (projectId: string) => api<AudienceStage>(base(projectId));
export const generateAudiences = (projectId: string) => api<Job>(`${base(projectId)}/generate`, { method: "POST" });
export const addOwnAudience = (projectId: string, draft: AudienceDraft) =>
  api<AudienceCard>(base(projectId), { method: "POST", json: draft });
export const removeAudience = (projectId: string, itemId: string) =>
  api<void>(`${base(projectId)}/${itemId}`, { method: "DELETE" });
export const setExclusions = (projectId: string, exclusions: string[]) =>
  api<AudienceStage>(`${base(projectId)}/exclusions`, { method: "PUT", json: { exclusions } });
