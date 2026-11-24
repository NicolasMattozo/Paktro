import { ZodError } from "zod";
import {
  ensureAgentPackV2,
  migrateV1ToV2,
} from "../platforms/common/convert";
import { backupSchema } from "../schemas/config";
import { backupV2Schema } from "../schemas/pack";
import type { AgentConfig, AgentPackV2 } from "../types";

export const STORAGE_KEY = "paktro:library:v2";
export const LEGACY_STORAGE_KEYS = [
  "agex:library:v2",
  "agex:library:v1",
  "agent-studio:library:v1",
] as const;
export const LEGACY_STORAGE_KEY = "agent-studio:library:v1";
export const MAX_IMPORT_BYTES = 1024 * 1024;

export function serializeBackup(agents: (AgentPackV2 | AgentConfig)[]): string {
  const v2Agents = agents.map(ensureAgentPackV2);
  const payload = backupV2Schema.parse({
    format: "paktro",
    version: 2,
    agents: v2Agents,
  });
  return JSON.stringify(payload, null, 2);
}

export type ParsedBackup = {
  format: "paktro";
  version: 2;
  agents: AgentPackV2[];
  migratedFromVersion?: 1;
};

export function parseBackup(raw: string): ParsedBackup {
  if (new TextEncoder().encode(raw).byteLength > MAX_IMPORT_BYTES) {
    throw new Error("O arquivo de backup deve ter no máximo 1 MB.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("O arquivo JSON não pôde ser lido. Verifique o formato.");
  }

  const version =
    parsed && typeof parsed === "object"
      ? (parsed as { version?: unknown }).version
      : undefined;

  try {
    if (version === 2) {
      const v2 = backupV2Schema.parse(parsed);
      return {
        format: "paktro",
        version: 2,
        agents: v2.agents,
      };
    }
    if (version === 1) {
      const legacy = backupSchema.parse(parsed);
      return {
        format: "paktro",
        version: 2,
        agents: legacy.agents.map(migrateV1ToV2),
        migratedFromVersion: 1,
      };
    }
    throw new Error(
      "Formato de backup não suportado. Use um arquivo exportado pelo Paktro (v1 ou v2).",
    );
  } catch (e) {
    if (e instanceof ZodError) {
      throw new Error(
        `Backup inválido ou incompatível: ${e.issues[0]?.message ?? "estrutura incorreta."}`,
      );
    }
    throw e;
  }
}

export type LibraryReadResult = {
  agents: AgentPackV2[];
  error?: string;
  migratedFromKey?: string;
  legacyRawBackup?: string;
};

export function readLibrary(
  storage: Pick<Storage, "getItem">,
): LibraryReadResult {
  try {
    const v2Raw = storage.getItem(STORAGE_KEY);
    if (v2Raw !== null) {
      if (!v2Raw) return { agents: [] };
      return { agents: parseBackup(v2Raw).agents };
    }

    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      const legacyRaw = storage.getItem(legacyKey);
      if (legacyRaw === null) continue;
      if (!legacyRaw) return { agents: [] };
      const migrated = parseBackup(legacyRaw);
      return {
        agents: migrated.agents,
        migratedFromKey: legacyKey,
        legacyRawBackup: legacyRaw,
      };
    }

    return { agents: [] };
  } catch {
    return {
      agents: [],
      error:
        "Não foi possível ler os agentes salvos. Os dados existentes foram preservados para evitar perda. Faça backup antes de continuar.",
    };
  }
}

export function saveLibrary(
  storage: Pick<Storage, "setItem">,
  agents: (AgentPackV2 | AgentConfig)[],
): string | undefined {
  try {
    storage.setItem(STORAGE_KEY, serializeBackup(agents));
    return undefined;
  } catch {
    return "Não foi possível salvar no navegador (armazenamento cheio ou indisponível). Exporte um backup em JSON agora para não perder alterações.";
  }
}
