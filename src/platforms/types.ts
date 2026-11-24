import type {
  AgentPackV2,
  CapabilityIntent,
  GeneratedFile,
  TargetPlatform,
} from "../types";

export const TARGET_PLATFORMS: readonly TargetPlatform[] = [
  "antigravity",
  "claude-code",
  "codex",
  "chatgpt-plugin",
] as const;

export const MAPPING_VERSIONS: Record<TargetPlatform, string> = {
  antigravity: "antigravity-2026-11-24",
  "claude-code": "claude-code-2026-11-24",
  codex: "codex-2026-11-24",
  "chatgpt-plugin": "chatgpt-plugin-2026-11-24",
};

export type MergePolicy =
  | "json-merge"
  | "toml-merge"
  | "managed-markdown"
  | "replace-owned"
  | "create-only";

export type PlatformModelOption = {
  id: string;
  label: string;
  badge?: string;
  group?: string;
  notes?: string;
};

export type PlatformToolOption = {
  id: string;
  name: string;
  description: string;
  group: string;
  capabilityIntent?: CapabilityIntent;
};

export type PlatformPermissionOption = {
  id: string;
  label: string;
  description: string;
  highRisk?: boolean;
};

export type PlatformCatalog = {
  id: TargetPlatform;
  name: string;
  shortName: string;
  vendorGroup: "google" | "anthropic" | "openai";
  summary: string;
  docsUrl: string;
  docsVerifiedAt: string;
  mappingVersion: string;
  supportsRoles: boolean;
  supportsModels: boolean;
  models: PlatformModelOption[];
  efforts?: { id: string; label: string }[];
  tools: PlatformToolOption[];
  permissionModes: PlatformPermissionOption[];
  toolNotes?: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  blockers: string[];
};

export type ImportedCandidate = {
  packs: AgentPackV2[];
  detectedTarget: TargetPlatform | "ambiguous";
  candidateTargets?: TargetPlatform[];
  warnings: string[];
  losses?: string[];
};

export type PlatformAdapter = {
  id: TargetPlatform;
  mappingVersion: string;
  catalog: PlatformCatalog;
  validate: (pack: AgentPackV2) => ValidationResult;
  warnings: (pack: AgentPackV2) => string[];
  generate: (pack: AgentPackV2) => GeneratedFile[];
  importFiles: (files: { path: string; content: string }[]) => ImportedCandidate | null;
  mergePolicy: (relativePath: string) => MergePolicy;
  setupGuide: (pack: AgentPackV2) => string;
  approvalSignaturePayload: (pack: AgentPackV2) => unknown;
};

