import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  agentContentKey,
  reviewsFileSchema,
  type ClientReviewInfo,
  type ReviewMap,
  type ReviewRecord,
} from "../src/features/bridge/review";
import { ensureAgentPackV2 } from "../src/platforms/common/convert";
import { getPlatformAdapter } from "../src/platforms/registry";
import {
  MAX_IMPORT_BYTES,
  parseBackup,
  serializeBackup,
} from "../src/storage/local";
import type { AgentConfig, AgentPackV2 } from "../src/types";
import {
  exportPackSafely,
  type ConflictResolution,
  type ExportConflict,
  type ExportFileResult,
} from "./export";

export class ExportConflictError extends Error {
  conflicts: ExportConflict[];
  orphans: string[];

  constructor(message: string, conflicts: ExportConflict[], orphans: string[]) {
    super(message);
    this.name = "ExportConflictError";
    this.conflicts = conflicts;
    this.orphans = orphans;
  }
}

export function sha256Key(
  agent: AgentPackV2 | AgentConfig,
  targetProject?: string,
): string {
  return createHash("sha256")
    .update(agentContentKey(agent, targetProject), "utf8")
    .digest("hex");
}

function sha256Raw(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function withStoreLock<T>(
  file: string,
  fn: () => Promise<T>,
): Promise<T> {
  const dir = dirname(file);
  const lockDir = `${file}.lock`;
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 5000;
  while (true) {
    try {
      await mkdir(lockDir);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== "EEXIST") throw e;
      try {
        const st = await stat(lockDir);
        if (Date.now() - st.mtimeMs > 15000) {
          await rm(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(
          "Tempo esgotado aguardando acesso exclusivo à biblioteca da ponte.",
        );
      }
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  try {
    return await fn();
  } finally {
    await rm(lockDir, { recursive: true, force: true });
  }
}

function reviewsPathFor(file: string): string {
  return `${file}.reviews.json`;
}

async function readReviewsUnlocked(file: string): Promise<ReviewMap> {
  try {
    const raw = await readFile(reviewsPathFor(file), "utf8");
    return reviewsFileSchema.parse(JSON.parse(raw));
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return {};
    throw e;
  }
}

async function writeReviewsUnlocked(
  file: string,
  reviews: ReviewMap,
): Promise<void> {
  const path = reviewsPathFor(file);
  const parsed = reviewsFileSchema.parse(reviews);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temp, JSON.stringify(parsed, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  const { rename } = await import("node:fs/promises");
  await rename(temp, path);
}

async function readStoreUnlocked(
  file: string,
): Promise<{ agents: AgentPackV2[]; raw: string }> {
  try {
    const raw = await readFile(file, "utf8");
    const parsed = parseBackup(raw);
    return { agents: parsed.agents, raw };
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { agents: [], raw: "" };
    }
    throw e;
  }
}

async function writeStoreUnlocked(
  file: string,
  agents: (AgentPackV2 | AgentConfig)[],
): Promise<string> {
  const content = serializeBackup(agents);
  if (new TextEncoder().encode(content).byteLength > MAX_IMPORT_BYTES) {
    throw new Error("A biblioteca excede o limite de 1 MB.");
  }
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temp, content, { encoding: "utf8", mode: 0o600 });
  const { rename } = await import("node:fs/promises");
  await rename(temp, file);
  return content;
}

function computeCombinedRevision(
  agentsRaw: string,
  reviews: ReviewMap,
): string {
  if (!agentsRaw && Object.keys(reviews).length === 0) return "empty";
  const canonicalReviews = JSON.stringify(
    Object.fromEntries(
      Object.entries(reviews).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
  return sha256Raw(`${agentsRaw}\n::\n${canonicalReviews}`);
}

export async function readStore(file: string): Promise<{
  agents: AgentPackV2[];
  revision: string;
}> {
  const { agents, raw } = await readStoreUnlocked(file);
  return {
    agents,
    revision: raw ? sha256Raw(raw) : "empty",
  };
}

export async function writeStore(
  file: string,
  agents: (AgentPackV2 | AgentConfig)[],
): Promise<string> {
  return withStoreLock(file, async () => {
    const raw = await writeStoreUnlocked(file, agents);
    return sha256Raw(raw);
  });
}

export function enrichReviews(
  agents: AgentPackV2[],
  reviews: ReviewMap,
): Record<string, ClientReviewInfo> {
  const out: Record<string, ClientReviewInfo> = {};
  for (const agent of agents) {
    const rec = reviews[agent.common.id];
    if (!rec) continue;
    let currentHash = "";
    try {
      const boundProject = rec.targetProject?.trim() || undefined;
      currentHash = sha256Key(agent, boundProject);
    } catch {
      currentHash = "invalid";
    }
    const stale =
      rec.status === "approved" &&
      Boolean(rec.approvedHash) &&
      rec.approvedHash !== currentHash;
    out[agent.common.id] = {
      ...rec,
      stale,
      effectiveStatus: stale ? "stale" : rec.status,
    };
  }
  return out;
}

export async function readLibraryState(file: string): Promise<{
  agents: AgentPackV2[];
  reviews: Record<string, ClientReviewInfo>;
  revision: string;
}> {
  const [{ agents, raw }, reviews] = await Promise.all([
    readStoreUnlocked(file),
    readReviewsUnlocked(file),
  ]);
  return {
    agents,
    reviews: enrichReviews(agents, reviews),
    revision: computeCombinedRevision(raw, reviews),
  };
}

export function planMerge(
  existing: (AgentPackV2 | AgentConfig)[],
  incoming: (AgentPackV2 | AgentConfig)[],
) {
  const existingV2 = existing.map(ensureAgentPackV2);
  const incomingV2 = incoming.map(ensureAgentPackV2);

  const byId = new Map(existingV2.map((a) => [a.common.id, a]));
  const incomingIds = new Set(incomingV2.map((a) => a.common.id));
  const added: string[] = [];
  const changed: string[] = [];
  let unchanged = 0;

  for (const agent of incomingV2) {
    const current = byId.get(agent.common.id);
    if (!current) added.push(agent.common.name || agent.common.slug);
    else if (JSON.stringify(current) !== JSON.stringify(agent)) {
      changed.push(agent.common.name || agent.common.slug);
    } else unchanged++;
  }

  return {
    agents: [
      ...incomingV2,
      ...existingV2.filter((a) => !incomingIds.has(a.common.id)),
    ].slice(0, 100),
    added,
    changed,
    unchanged,
  };
}

export async function syncFromUi(
  file: string,
  incoming: (AgentPackV2 | AgentConfig)[],
  expectedRevision?: string,
): Promise<{ conflict: boolean; revision: string }> {
  return withStoreLock(file, async () => {
    const [{ agents, raw }, reviews] = await Promise.all([
      readStoreUnlocked(file),
      readReviewsUnlocked(file),
    ]);
    const currentRevision = computeCombinedRevision(raw, reviews);
    if (expectedRevision && expectedRevision !== currentRevision) {
      return { conflict: true, revision: currentRevision };
    }
    const nextAgents = planMerge(agents, incoming).agents;
    const nextRaw = await writeStoreUnlocked(file, nextAgents);
    return {
      conflict: false,
      revision: computeCombinedRevision(nextRaw, reviews),
    };
  });
}

export async function upsertPackFromAi(options: {
  file: string;
  pack: AgentPackV2;
  note?: string;
}): Promise<{
  pack: AgentPackV2;
  review: ClientReviewInfo;
  revision: string;
}> {
  const { file, pack, note } = options;
  const adapter = getPlatformAdapter(pack.target);
  const check = adapter.validate(pack);
  if (!check.valid) {
    throw new Error(check.errors[0] ?? "Pacote inválido.");
  }

  return withStoreLock(file, async () => {
    const [{ agents }, reviews] = await Promise.all([
      readStoreUnlocked(file),
      readReviewsUnlocked(file),
    ]);
    const nextAgents = [
      pack,
      ...agents.filter((a) => a.common.id !== pack.common.id),
    ].slice(0, 100);
    const now = new Date().toISOString();
    const record: ReviewRecord = {
      status: "pending_review",
      source: "ai",
      ...(note ? { note } : {}),
      ...(reviews[pack.common.id]?.targetProject
        ? { targetProject: reviews[pack.common.id].targetProject }
        : {}),
      updatedAt: now,
    };
    const nextReviews: ReviewMap = { ...reviews, [pack.common.id]: record };
    const nextRaw = await writeStoreUnlocked(file, nextAgents);
    await writeReviewsUnlocked(file, nextReviews);
    const enriched = enrichReviews(nextAgents, nextReviews);
    return {
      pack,
      review: enriched[pack.common.id],
      revision: computeCombinedRevision(nextRaw, nextReviews),
    };
  });
}

export async function approvePackFromUi(
  file: string,
  agent: AgentPackV2 | AgentConfig,
  options: { targetProject?: string; expectedRevision?: string } = {},
): Promise<
  | { conflict: true; currentRevision: string }
  | { conflict: false; revision: string; review: ClientReviewInfo }
> {
  const pack = ensureAgentPackV2(agent);
  const adapter = getPlatformAdapter(pack.target);
  const check = adapter.validate(pack);
  if (!check.valid) {
    throw new Error(check.errors[0] ?? "Agente inválido para aprovação.");
  }

  return withStoreLock(file, async () => {
    const [{ agents, raw }, reviews] = await Promise.all([
      readStoreUnlocked(file),
      readReviewsUnlocked(file),
    ]);
    const currentRevision = computeCombinedRevision(raw, reviews);
    if (
      options.expectedRevision &&
      options.expectedRevision !== currentRevision
    ) {
      return { conflict: true, currentRevision };
    }

    const existing = agents.find((a) => a.common.id === pack.common.id);
    const now = new Date().toISOString();
    const savedPack: AgentPackV2 = {
      ...pack,
      common: {
        ...pack.common,
        updatedAt: now,
      },
    };
    const nextAgents = [
      savedPack,
      ...agents.filter((a) => a.common.id !== savedPack.common.id),
    ].slice(0, 100);

    const prevReview = reviews[savedPack.common.id];
    const trimmedProject = options.targetProject?.trim()
      ? resolve(options.targetProject.trim())
      : prevReview?.targetProject;
    const record: ReviewRecord = {
      status: "approved",
      source: prevReview?.source ?? (existing ? "studio" : "ai"),
      ...(prevReview?.note ? { note: prevReview.note } : {}),
      ...(trimmedProject ? { targetProject: trimmedProject } : {}),
      approvedHash: sha256Key(savedPack, trimmedProject),
      updatedAt: now,
      approvedAt: now,
    };
    const nextReviews: ReviewMap = {
      ...reviews,
      [savedPack.common.id]: record,
    };
    const nextRaw = await writeStoreUnlocked(file, nextAgents);
    await writeReviewsUnlocked(file, nextReviews);
    const enriched = enrichReviews(nextAgents, nextReviews);
    return {
      conflict: false,
      revision: computeCombinedRevision(nextRaw, nextReviews),
      review: enriched[savedPack.common.id],
    };
  });
}

export async function exportApprovedPack(
  file: string,
  options: {
    id: string;
    projectPath?: string;
    conflictResolution?: ConflictResolution;
    cleanOrphans?: boolean;
    orphanPaths?: string[];
  },
): Promise<{
  id: string;
  name: string;
  slug: string;
  target: AgentPackV2["target"];
  mappingVersion: string;
  projectPath: string;
  files: ExportFileResult[];
  skipped: string[];
  conflicts: ExportConflict[];
  orphans: string[];
  removedOrphans: string[];
}> {
  const {
    id,
    projectPath,
    conflictResolution = "abort",
    cleanOrphans = false,
    orphanPaths,
  } = options;

  return withStoreLock(file, async () => {
    const [{ agents }, reviews] = await Promise.all([
      readStoreUnlocked(file),
      readReviewsUnlocked(file),
    ]);
    const pack = agents.find((a) => a.common.id === id);
    if (!pack) {
      throw new Error(`Conjunto "${id}" não encontrado na biblioteca local.`);
    }

    const adapter = getPlatformAdapter(pack.target);
    const validation = adapter.validate(pack);
    if (!validation.valid) {
      throw new Error(validation.errors[0] ?? "Conjunto inválido para exportação.");
    }

    const review = reviews[id];
    if (!review || review.status !== "approved") {
      throw new Error(
        `O conjunto "${pack.common.name}" ainda está aguardando seu OK no site Agex. Revise-o na aba "Ponte local" / Editor, clique em "Dar OK (aprovar para exportar)" e tente novamente.`,
      );
    }

    const destRaw = projectPath?.trim() || review.targetProject?.trim() || "";
    if (!destRaw) {
      throw new Error(
        "Informe o caminho absoluto da pasta do projeto de destino (ou salve-o ao dar o OK no site).",
      );
    }
    const projectDir = resolve(destRaw);

    const boundProject = review.targetProject
      ? resolve(review.targetProject)
      : undefined;
    if (boundProject && boundProject !== projectDir) {
      throw new Error(
        `A aprovação de "${pack.common.name}" foi registrada para "${boundProject}". Clique em "Dar OK" novamente para exportar para "${projectDir}".`,
      );
    }

    const currentHash = sha256Key(pack, boundProject);
    if (!review.approvedHash || review.approvedHash !== currentHash) {
      throw new Error(
        `O conjunto "${pack.common.name}" foi alterado após o último OK (ou mudou de plataforma/versão). Revise no site Agex e clique em "Dar OK" novamente antes de exportar.`,
      );
    }

    const generated = adapter.generate(pack);
    const safeResult = await exportPackSafely({
      projectDir,
      pack,
      mappingVersion: adapter.mappingVersion,
      files: generated,
      mergePolicy: (rel) => adapter.mergePolicy(rel),
      conflictResolution,
      cleanOrphans,
      orphanPaths,
    });

    if (safeResult.conflicts.length > 0) {
      const list = safeResult.conflicts
        .map((c) => `${c.path}: ${c.reason}`)
        .join("; ");
      throw new ExportConflictError(
        `Exportação pausada para proteger arquivos existentes: ${list}`,
        safeResult.conflicts,
        safeResult.orphans,
      );
    }

    return {
      id: pack.common.id,
      name: pack.common.name,
      slug: pack.common.slug,
      target: pack.target,
      mappingVersion: adapter.mappingVersion,
      projectPath: projectDir,
      files: safeResult.files,
      skipped: safeResult.skipped,
      conflicts: [],
      orphans: safeResult.orphans,
      removedOrphans: safeResult.removedOrphans,
    };
  });
}
