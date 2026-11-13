import { z } from "zod";
import { configSchema } from "../../schemas/config";
import type { AgentConfig } from "../../types";

export const reviewStatusSchema = z.enum(["pending_review", "approved"]);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

export const reviewSourceSchema = z.enum(["ai", "studio"]);

export const reviewRecordSchema = z
  .object({
    status: reviewStatusSchema,
    source: reviewSourceSchema,
    note: z.string().max(1000).optional(),
    targetProject: z.string().max(4096).optional(),
    approvedHash: z.string().max(128).optional(),
    updatedAt: z.string().max(64),
    approvedAt: z.string().max(64).optional(),
  })
  .strict();

export type ReviewRecord = z.infer<typeof reviewRecordSchema>;

export const reviewsFileSchema = z.record(z.string().uuid(), reviewRecordSchema);
export type ReviewMap = Record<string, ReviewRecord>;

export type ClientReviewInfo = ReviewRecord & {
  stale: boolean;
  effectiveStatus: "pending_review" | "approved" | "stale";
};

export function agentContentKey(agent: AgentConfig): string {
  const normalized = configSchema.parse(agent);
  return JSON.stringify({ ...normalized, updatedAt: "" });
}

