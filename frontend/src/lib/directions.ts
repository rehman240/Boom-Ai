import { api } from "@/lib/api";
import type { Job } from "@/lib/brief";
import type { Item, ReviewFlag } from "@/lib/items";

export type DirectionData = {
  name: string;
  promise: string;
  headline: string;
  key_message: string;
  concept: string;
  channels: string[];
  channel_fit: string;
  risks: string[];
  rationale: string;
  based_on: { source: string; detail: string }[];
  assumptions: string[];
};

export type Direction = Item<DirectionData> & {
  slot: "1" | "2" | "3";
  review_flags: ReviewFlag[];
  outdated: boolean;
};

export type DirectionStage = {
  directions: Direction[];
  job: Job | null;
  slot_jobs: Partial<Record<string, Job>>;
  blocked_reason: string | null;
};

/** The fields a person edits. "Based on" and assumptions come from the AI. */
export type DirectionDraft = Pick<
  DirectionData,
  "name" | "promise" | "headline" | "key_message" | "concept" | "channels" | "channel_fit" | "risks" | "rationale"
>;

export const SLOTS = ["1", "2", "3"] as const;
export const MAX_RISKS = 4;
export const slotLetter = (slot: string) => "ABC"[Number(slot) - 1] ?? slot;

const base = (projectId: string) => `/projects/${projectId}/directions`;

export const getDirections = (projectId: string) => api<DirectionStage>(base(projectId));
export const generateDirections = (projectId: string) => api<Job>(`${base(projectId)}/generate`, { method: "POST" });
export const regenerateDirection = (projectId: string, slot: string) =>
  api<Job>(`${base(projectId)}/${slot}/regenerate`, { method: "POST" });
