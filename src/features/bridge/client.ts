import type { AgentConfig } from "@/types";
import type { ClientReviewInfo } from "./review";
import { serializeBackup } from "@/storage/local";

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
      agents: AgentConfig[];
      reviews: Record<string, ClientReviewInfo>;
    };

export type BridgeExportResult = {
  ok: true;
  id: string;
  name: string;
  slug: string;
  projectPath: string;
  files: Array<{
    path: string;
    action: "created" | "updated" | "merged" | "unchanged";
  }>;
};

export function assertBridgeCredentials(port: string, token: string) {
  if (!/^\d+$/.test(port) || +port < 1024 || +port > 65535)
    throw Error("Informe uma porta entre 1024 e 65535.");
  if (token.length < 32)
    throw Error(
      "Informe o token configurado na ponte (mínimo de 32 caracteres).",
    );
}

function normalizeBridgeError(e: unknown): Error {
  if (e instanceof Error && e.name !== "TypeError") return e;
  return Error(
    "Não foi possível acessar a ponte. Confira o programa local, a origem autorizada e as permissões de rede local do navegador.",
  );
}

export async function fetchBridgeLibrary({
  port,
  token,
  since,
}: {
  port: string;
  token: string;
  since?: string;
}): Promise<BridgeLibraryResponse> {
  assertBridgeCredentials(port, token);
  try {
    const query = since ? `?since=${encodeURIComponent(since)}` : "";
    const response = await fetch(
      `http://127.0.0.1:${port}/library${query}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(10000),
      },
    );
    const result = await response.json();
    if (!response.ok)
      throw Error(result.error ?? "A ponte recusou a consulta.");
    return result as BridgeLibraryResponse;
  } catch (e) {
    throw normalizeBridgeError(e);
  }
}

export async function requestBridgeSync({
  port,
  token,
  action,
  backupJson,
  expectedRevision,
}: {
  port: string;
  token: string;
  action: "preview" | "sync";
  backupJson: string;
  expectedRevision?: string;
}) {
  assertBridgeCredentials(port, token);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        backup: JSON.parse(backupJson),
        ...(action === "sync" ? { expectedRevision } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(result.error ?? "A ponte recusou a solicitação.");
    return result;
  } catch (e) {
    throw normalizeBridgeError(e);
  }
}

export async function approveBridgeAgent({
  port,
  token,
  agent,
  targetProject,
  expectedRevision,
}: {
  port: string;
  token: string;
  agent: AgentConfig;
  targetProject?: string;
  expectedRevision?: string;
}): Promise<{
  ok: true;
  id: string;
  revision: string;
  review: ClientReviewInfo;
}> {
  assertBridgeCredentials(port, token);
  try {
    const cleanBackup = JSON.parse(serializeBackup([agent])).agents[0];
    const response = await fetch(`http://127.0.0.1:${port}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        agent: cleanBackup,
        ...(targetProject?.trim()
          ? { targetProject: targetProject.trim() }
          : {}),
        ...(expectedRevision ? { expectedRevision } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(result.error ?? "Não foi possível aprovar na ponte.");
    return result;
  } catch (e) {
    throw normalizeBridgeError(e);
  }
}

export async function exportBridgeAgent({
  port,
  token,
  id,
  projectPath,
}: {
  port: string;
  token: string;
  id: string;
  projectPath?: string;
}): Promise<BridgeExportResult> {
  assertBridgeCredentials(port, token);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id,
        ...(projectPath?.trim() ? { projectPath: projectPath.trim() } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(result.error ?? "Não foi possível exportar para o projeto.");
    return result as BridgeExportResult;
  } catch (e) {
    throw normalizeBridgeError(e);
  }
}

