import {
  readFile,
  stat,
  lstat,
  realpath,
  mkdir,
  open,
  rename,
  unlink,
} from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  parseBackup,
  serializeBackup,
  MAX_IMPORT_BYTES,
} from "../src/storage/local";
import { configSchema } from "../src/schemas/config";
import { generateFiles } from "../src/generators/antigravity";
import {
  agentContentKey,
  reviewsFileSchema,
  type ClientReviewInfo,
  type ReviewMap,
  type ReviewRecord,
} from "../src/features/bridge/review";
import type { AgentConfig } from "../src/types";

export function sha256Key(agent: AgentConfig): string {
  return createHash("sha256").update(agentContentKey(agent)).digest("hex");
}

export function reviewsPath(path: string): string {
  return `${path}.reviews.json`;
}

export async function withStoreLock<T>(
  path: string,
  fn: () => Promise<T>,
): Promise<T> {
  const parent = dirname(path);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const lockPath = `${path}.lock`;
  const deadline = Date.now() + 5000;
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  while (!handle) {
    try {
      handle = await open(lockPath, "wx", 0o600);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const info = await stat(lockPath).catch(() => null);
      if (info && Date.now() - info.mtimeMs > 15000) {
        await unlink(lockPath).catch(() => {});
        continue;
      }
      if (Date.now() >= deadline)
        throw new Error("Aguardando acesso concorrente à biblioteca da ponte.");
      await delay(25);
    }
  }
  try {
    return await fn();
  } finally {
    await handle.close().catch(() => {});
    await unlink(lockPath).catch(() => {});
  }
}

export async function readStore(path: string) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_IMPORT_BYTES)
      throw new Error("Arquivo de biblioteca inválido ou maior que 1 MB.");
    const raw = await readFile(path, "utf8");
    return {
      agents: parseBackup(raw).agents,
      revision: createHash("sha256").update(raw).digest("hex"),
    };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      return { agents: [] as AgentConfig[], revision: "empty" };
    throw e;
  }
}

export async function readReviews(path: string): Promise<ReviewMap> {
  const file = reviewsPath(path);
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_IMPORT_BYTES)
      throw new Error("Arquivo de revisões inválido ou maior que 1 MB.");
    const raw = await readFile(file, "utf8");
    return reviewsFileSchema.parse(JSON.parse(raw));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}

async function atomicWriteText(path: string, content: string) {
  const parent = dirname(path);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const info = await stat(parent);
  if (!info.isDirectory()) throw new Error("Pasta da biblioteca inválida.");
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(content, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

export async function writeStore(path: string, agents: AgentConfig[]) {
  await atomicWriteText(path, serializeBackup(agents));
}

export async function writeReviews(path: string, reviews: ReviewMap) {
  await atomicWriteText(
    reviewsPath(path),
    JSON.stringify(reviewsFileSchema.parse(reviews), null, 2) + "\n",
  );
}

export function resolveClientReview(
  agent: AgentConfig,
  review: ReviewRecord | undefined,
): ClientReviewInfo | undefined {
  if (!review) return undefined;
  const stale =
    review.status === "approved" && review.approvedHash !== sha256Key(agent);
  return {
    ...review,
    stale,
    effectiveStatus: stale ? "stale" : review.status,
  };
}

export async function readLibraryState(path: string) {
  const [store, reviews] = await Promise.all([
    readStore(path),
    readReviews(path),
  ]);
  const clientReviews: Record<string, ClientReviewInfo> = {};
  for (const agent of store.agents) {
    const resolved = resolveClientReview(agent, reviews[agent.id]);
    if (resolved) clientReviews[agent.id] = resolved;
  }
  const combinedRevision = createHash("sha256")
    .update(store.revision)
    .update("\n")
    .update(JSON.stringify(clientReviews))
    .digest("hex");
  return {
    agents: store.agents,
    reviews: clientReviews,
    rawReviews: reviews,
    storeRevision: store.revision,
    revision: combinedRevision,
  };
}

export function planMerge(existing: AgentConfig[], incoming: AgentConfig[]) {
  const byId = new Map(existing.map((a) => [a.id, a]));
  const added: string[] = [];
  const changed: string[] = [];
  let unchanged = 0;
  for (const a of incoming) {
    const previous = byId.get(a.id);
    if (!previous) added.push(a.name);
    else if (JSON.stringify(previous) !== JSON.stringify(a))
      changed.push(a.name);
    else unchanged++;
    byId.set(a.id, a);
  }
  if (byId.size > 100)
    throw new Error("A biblioteca resultante excederia 100 agentes.");
  const agents = [...byId.values()];
  const content = serializeBackup(agents);
  if (Buffer.byteLength(content) > MAX_IMPORT_BYTES)
    throw new Error("A biblioteca resultante excederia 1 MB.");
  return { agents, added, changed, unchanged };
}

export async function upsertPackFromAi(
  path: string,
  agentInput: AgentConfig,
  { note, targetProject }: { note?: string; targetProject?: string } = {},
) {
  const agent = configSchema.parse(agentInput);
  return withStoreLock(path, async () => {
    const state = await readLibraryState(path);
    const merged = planMerge(state.agents, [agent]);
    const now = new Date().toISOString();
    const nextReviews: ReviewMap = {
      ...state.rawReviews,
      [agent.id]: {
        status: "pending_review",
        source: "ai",
        ...(note?.trim() ? { note: note.trim().slice(0, 1000) } : {}),
        ...(targetProject?.trim()
          ? { targetProject: targetProject.trim().slice(0, 4096) }
          : {}),
        updatedAt: now,
      },
    };
    await writeStore(path, merged.agents);
    await writeReviews(path, nextReviews);
    const updated = await readLibraryState(path);
    return {
      agent,
      created: merged.added.length > 0,
      revision: updated.revision,
      review: updated.reviews[agent.id],
    };
  });
}

export async function approvePackFromUi(
  path: string,
  agentInput: AgentConfig,
  {
    targetProject,
    expectedRevision,
  }: { targetProject?: string; expectedRevision?: string } = {},
): Promise<
  | {
      conflict: true;
      revision: string;
    }
  | {
      conflict: false;
      revision: string;
      review: ClientReviewInfo;
      agent: AgentConfig;
    }
> {
  const agent = configSchema.parse(agentInput);
  return withStoreLock(path, async () => {
    const state = await readLibraryState(path);
    if (expectedRevision && expectedRevision !== state.revision)
      return { conflict: true, revision: state.revision };
    const merged = planMerge(state.agents, [agent]);
    const prev = state.rawReviews[agent.id];
    const now = new Date().toISOString();
    const cleanedTarget = targetProject?.trim()
      ? targetProject.trim().slice(0, 4096)
      : undefined;
    const nextReviews: ReviewMap = {
      ...state.rawReviews,
      [agent.id]: {
        status: "approved",
        source: prev?.source ?? "studio",
        ...(prev?.note ? { note: prev.note } : {}),
        ...(cleanedTarget ? { targetProject: cleanedTarget } : {}),
        approvedHash: sha256Key(agent),
        updatedAt: now,
        approvedAt: now,
      },
    };
    await writeStore(path, merged.agents);
    await writeReviews(path, nextReviews);
    const updated = await readLibraryState(path);
    return {
      conflict: false,
      revision: updated.revision,
      review: updated.reviews[agent.id]!,
      agent,
    };
  });
}

async function assertNoSymlinkChain(root: string, relativePath: string) {
  const parts = relativePath.split("/").filter(Boolean);
  let cursor = root;
  for (const part of parts) {
    cursor = resolve(cursor, part);
    if (cursor !== root && !cursor.startsWith(root + sep))
      throw new Error(`Caminho fora do projeto de destino: ${relativePath}`);
    const info = await lstat(cursor).catch(() => null);
    if (info?.isSymbolicLink())
      throw new Error(`Link simbólico não permitido em: ${relativePath}`);
  }
}

export async function exportApprovedPack(
  path: string,
  id: string,
  requestedProjectPath?: string,
) {
  return withStoreLock(path, async () => {
    const state = await readLibraryState(path);
    const agent = state.agents.find((a) => a.id === id);
    if (!agent) throw new Error("Conjunto não encontrado na biblioteca.");
    const review = state.reviews[id];
    if (!review || review.effectiveStatus !== "approved") {
      const reason =
        review?.effectiveStatus === "stale"
          ? "O agente foi modificado após a aprovação anterior."
          : "Este agente ainda aguarda sua revisão e aprovação (OK) no site Agex.";
      throw new Error(
        `${reason} Abra o Agex conectado à ponte, confira o conjunto "${agent.name}" (${agent.slug}) e clique em "Dar OK (aprovar para exportar)".`,
      );
    }
    const targetInput =
      requestedProjectPath?.trim() || review.targetProject?.trim() || "";
    if (!targetInput)
      throw new Error(
        "Informe o caminho absoluto da pasta do projeto de destino (projectPath).",
      );
    if (!isAbsolute(targetInput))
      throw new Error(
        "O caminho do projeto de destino precisa ser absoluto.",
      );
    const targetInfo = await stat(targetInput).catch(() => null);
    if (!targetInfo || !targetInfo.isDirectory())
      throw new Error(
        "A pasta do projeto de destino precisa existir e ser um diretório real.",
      );
    const realProject = await realpath(targetInput);
    const realHome = await realpath(homedir()).catch(() => homedir());
    if (dirname(realProject) === realProject || realProject === realHome)
      throw new Error(
        "Escolha uma pasta específica do projeto, não a raiz do sistema ou o diretório home.",
      );
    if (review.targetProject?.trim()) {
      const approvedTargetReal = await realpath(review.targetProject).catch(
        () => resolve(review.targetProject!),
      );
      if (
        requestedProjectPath?.trim() &&
        approvedTargetReal !== realProject
      ) {
        throw new Error(
          `Este conjunto foi aprovado para a pasta ${review.targetProject}, diferente de ${requestedProjectPath}. Aprove novamente no site para o novo destino.`,
        );
      }
    }

    const generated = generateFiles(agent);
    const results: Array<{
      path: string;
      action: "created" | "updated" | "merged" | "unchanged";
    }> = [];

    for (const file of generated) {
      if (file.path.includes("..") || isAbsolute(file.path))
        throw new Error(`Caminho inválido gerado: ${file.path}`);
      await assertNoSymlinkChain(realProject, file.path);
      const dest = resolve(realProject, file.path);
      if (!dest.startsWith(realProject + sep))
        throw new Error(`Caminho fora do projeto: ${file.path}`);

      let content = file.content;
      let action: "created" | "updated" | "merged" | "unchanged" = "created";
      const existingRaw = await readFile(dest, "utf8").catch((e) => {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      });

      if (file.path === ".agents/mcp_config.json" && existingRaw !== null) {
        let existingJson: unknown;
        try {
          existingJson = JSON.parse(existingRaw);
        } catch {
          throw new Error(
            ".agents/mcp_config.json existente não é um JSON válido; corrija antes de exportar.",
          );
        }
        if (
          !existingJson ||
          typeof existingJson !== "object" ||
          Array.isArray(existingJson)
        )
          throw new Error(".agents/mcp_config.json existente tem formato inválido.");
        const existingObj = existingJson as Record<string, unknown>;
        const existingServers =
          existingObj.mcpServers &&
          typeof existingObj.mcpServers === "object" &&
          !Array.isArray(existingObj.mcpServers)
            ? (existingObj.mcpServers as Record<string, unknown>)
            : {};
        const incomingObj = JSON.parse(file.content) as {
          mcpServers: Record<string, unknown>;
        };
        const mergedConfig = {
          ...existingObj,
          mcpServers: {
            ...existingServers,
            ...incomingObj.mcpServers,
          },
        };
        content = JSON.stringify(mergedConfig, null, 2) + "\n";
        action = existingRaw === content ? "unchanged" : "merged";
      } else if (existingRaw !== null) {
        action = existingRaw === content ? "unchanged" : "updated";
      }

      if (action !== "unchanged") await atomicWriteText(dest, content);
      results.push({ path: file.path, action });
    }

    return {
      id: agent.id,
      name: agent.name,
      slug: agent.slug,
      projectPath: realProject,
      files: results,
    };
  });
}
