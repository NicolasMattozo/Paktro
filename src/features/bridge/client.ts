import type {
  AgentConfig,
  AgentPackV2,
  TargetPlatform,
} from "../../types";
import { ensureAgentPackV2 } from "../../platforms/common/convert";
import type { ClientReviewInfo } from "./review";

export type BridgePlan = {
  revision: string;
  added: string[];
  changed: string[];
  unchanged: number;
};

export type BridgeLibraryResponse =
  | { changed: false; revision: string }
  | {
      changed: true;
      revision: string;
      agents: AgentPackV2[];
      reviews: Record<string, ClientReviewInfo>;
    };

export type ExportConflictClient = {
  path: string;
  reason: string;
  canAppendManaged?: boolean;
};

export type BridgeExportResult = {
  ok: boolean;
  id: string;
  name: string;
  slug: string;
  target?: TargetPlatform;
  mappingVersion?: string;
  projectPath: string;
  files: { path: string; action: string }[];
  skipped?: string[];
  conflicts?: ExportConflictClient[];
  orphans?: string[];
  removedOrphans?: string[];
};

export class BridgeConflictClientError extends Error {
  conflicts: ExportConflictClient[];
  orphans: string[];

  constructor(
    message: string,
    conflicts: ExportConflictClient[],
    orphans: string[],
  ) {
    super(message);
    this.name = "BridgeConflictClientError";
    this.conflicts = conflicts;
    this.orphans = orphans;
  }
}

function validatePortAndToken(port: string, token: string): number {
  const n = Number(port);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) {
    throw new Error("Informe uma porta entre 1024 e 65535.");
  }
  if (!token.trim()) {
    throw new Error("Cole o token da ponte exibido no terminal.");
  }
  return n;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    conflicts?: ExportConflictClient[];
    orphans?: string[];
  } & T;
  if (!res.ok) {
    if (res.status === 409 && Array.isArray(data.conflicts)) {
      throw new BridgeConflictClientError(
        data.error || "Conflito detectado ao exportar arquivos.",
        data.conflicts,
        data.orphans ?? [],
      );
    }
    throw new Error(
      data.error || `A ponte retornou erro HTTP ${res.status}.`,
    );
  }
  return data;
}

export async function fetchBridgeLibrary(options: {
  port: string;
  token: string;
  since?: string;
}): Promise<BridgeLibraryResponse> {
  const portNum = validatePortAndToken(options.port, options.token);
  const qs = options.since
    ? `?since=${encodeURIComponent(options.since)}`
    : "";
  const res = await fetch(`http://127.0.0.1:${portNum}/library${qs}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${options.token.trim()}`,
    },
  });
  const raw = await handleResponse<BridgeLibraryResponse>(res);
  if (!raw.changed) return raw;
  return {
    ...raw,
    agents: raw.agents.map(ensureAgentPackV2),
  };
}

export async function requestBridgeSync(options: {
  port: string;
  token: string;
  action: "preview" | "sync";
  backupJson: string;
  expectedRevision?: string;
}): Promise<BridgePlan | { ok: boolean; revision: string }> {
  const portNum = validatePortAndToken(options.port, options.token);
  const res = await fetch(`http://127.0.0.1:${portNum}/${options.action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.token.trim()}`,
    },
    body: JSON.stringify({
      backup: JSON.parse(options.backupJson),
      ...(options.expectedRevision
        ? { expectedRevision: options.expectedRevision }
        : {}),
    }),
  });
  return handleResponse(res);
}

export async function approveBridgeAgent(options: {
  port: string;
  token: string;
  agent: AgentPackV2 | AgentConfig;
  targetProject?: string;
  expectedRevision?: string;
}): Promise<{
  ok: boolean;
  id: string;
  revision: string;
  review: ClientReviewInfo;
}> {
  const portNum = validatePortAndToken(options.port, options.token);
  const res = await fetch(`http://127.0.0.1:${portNum}/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.token.trim()}`,
    },
    body: JSON.stringify({
      agent: ensureAgentPackV2(options.agent),
      ...(options.targetProject ? { targetProject: options.targetProject } : {}),
      ...(options.expectedRevision
        ? { expectedRevision: options.expectedRevision }
        : {}),
    }),
  });
  return handleResponse(res);
}

export async function exportBridgeAgent(options: {
  port: string;
  token: string;
  id: string;
  projectPath?: string;
  conflictResolution?: "abort" | "append-managed" | "overwrite";
  cleanOrphans?: boolean;
  orphanPaths?: string[];
}): Promise<BridgeExportResult> {
  const portNum = validatePortAndToken(options.port, options.token);
  const res = await fetch(`http://127.0.0.1:${portNum}/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.token.trim()}`,
    },
    body: JSON.stringify({
      id: options.id,
      ...(options.projectPath ? { projectPath: options.projectPath } : {}),
      ...(options.conflictResolution
        ? { conflictResolution: options.conflictResolution }
        : {}),
      ...(options.cleanOrphans !== undefined
        ? { cleanOrphans: options.cleanOrphans }
        : {}),
      ...(options.orphanPaths ? { orphanPaths: options.orphanPaths } : {}),
    }),
  });
  return handleResponse<BridgeExportResult>(res);
}
