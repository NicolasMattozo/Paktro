import { z } from "zod";
import { ensureAgentPackV2 } from "../../platforms/common/convert";
import { getPlatformAdapter } from "../../platforms/registry";
import type { AgentConfig, AgentPackV2 } from "../../types";

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

export function agentContentKey(
  agent: AgentPackV2 | AgentConfig,
  targetProject?: string,
): string {
  const pack = ensureAgentPackV2(agent);
  const adapter = getPlatformAdapter(pack.target);
  const validation = adapter.validate(pack);
  if (!validation.valid) {
    throw new Error(validation.errors[0] ?? "Pacote inválido.");
  }
  return JSON.stringify({
    payload: adapter.approvalSignaturePayload(pack),
    ...(targetProject ? { targetProject } : {}),
  });
}
