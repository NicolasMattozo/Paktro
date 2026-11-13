import { backupSchema, type AgentConfig, type Backup } from "../schemas/config";
export const STORAGE_KEY = "agex:library:v1";
export const LEGACY_STORAGE_KEY = "agent-studio:library:v1";
export const MAX_IMPORT_BYTES = 1024 * 1024;
export function serializeBackup(agents: AgentConfig[]): string {
  return (
    JSON.stringify(
      backupSchema.parse({ format: "agex", version: 1, agents }),
      null,
      2,
    ) + "\n"
  );
}
export function parseBackup(source: string): Backup {
  if (new TextEncoder().encode(source).byteLength > MAX_IMPORT_BYTES)
    throw new Error("O backup deve ter no máximo 1 MB.");
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    throw new Error("O arquivo não contém JSON válido.");
  }
  const parsed = backupSchema.safeParse(data);
  if (!parsed.success)
    throw new Error(
      "Backup inválido ou de uma versão incompatível. Use um JSON exportado pelo Agex v1 (ou Agent Studio v1).",
    );
  return parsed.data;
}
export function readLibrary(storage: Pick<Storage, "getItem">): {
  agents: AgentConfig[];
  error?: string;
} {
  try {
    const data =
      storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY);
    return { agents: data ? parseBackup(data).agents : [] };
  } catch {
    return {
      agents: [],
      error:
        "Não foi possível ler os rascunhos. Os dados existentes foram preservados. Exporte um backup antes de tentar salvar novamente.",
    };
  }
}
export function saveLibrary(
  storage: Pick<Storage, "setItem">,
  agents: AgentConfig[],
): string | null {
  try {
    const data = serializeBackup(agents);
    if (new TextEncoder().encode(data).byteLength > MAX_IMPORT_BYTES)
      return "A biblioteca atingiu 1 MB. Exporte um backup e remova itens para continuar salvando.";
    storage.setItem(STORAGE_KEY, data);
    return null;
  } catch {
    return "Não foi possível salvar neste navegador. O armazenamento pode estar indisponível ou cheio. Exporte um backup JSON para guardar seu trabalho.";
  }
}
