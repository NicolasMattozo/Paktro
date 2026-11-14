import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { assertSafeRelativePath } from "../src/platforms/common/paths";
import type { MergePolicy } from "../src/platforms/types";
import type { AgentPackV2, GeneratedFile, TargetPlatform } from "../src/types";

export type ConflictResolution = "abort" | "append-managed" | "overwrite";

export type ExportConflict = {
  path: string;
  reason: string;
  canAppendManaged?: boolean;
};

export type ExportFileResult = {
  path: string;
  action: "created" | "updated" | "merged" | "unchanged";
};

export type AgexManifestEntry = {
  packId: string;
  target: TargetPlatform;
  mappingVersion: string;
  updatedAt: string;
  files: Record<
    string,
    {
      sha256: string;
      policy: MergePolicy;
    }
  >;
};

export type AgexManifestV1 = {
  format: "agex-manifest";
  version: 1;
  packs: Record<string, AgexManifestEntry>;
};

const MANIFEST_REL_PATH = ".agex/manifest.json";

export function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export async function assertNoSymlinkChain(
  rootDir: string,
  relPath: string,
): Promise<string> {
  assertSafeRelativePath(relPath);
  const absRoot = resolve(rootDir);
  const absTarget = resolve(absRoot, relPath);
  if (absTarget !== absRoot && !absTarget.startsWith(absRoot + sep)) {
    throw new Error(`Caminho fora da pasta do projeto: ${relPath}`);
  }
  const segments = relPath.split("/");
  let current = absRoot;
  for (const seg of segments) {
    current = join(current, seg);
    try {
      const st = await lstat(current);
      if (st.isSymbolicLink()) {
        throw new Error(`Link simbólico bloqueado por segurança: ${relPath}`);
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === "ENOENT") {
        continue;
      }
      throw e;
    }
  }
  return absTarget;
}

async function readOptionalUtf8(absPath: string): Promise<string | null> {
  try {
    return await readFile(absPath, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    throw e;
  }
}

async function readManifest(projectDir: string): Promise<AgexManifestV1> {
  const abs = await assertNoSymlinkChain(projectDir, MANIFEST_REL_PATH);
  const raw = await readOptionalUtf8(abs);
  if (!raw) {
    return { format: "agex-manifest", version: 1, packs: {} };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AgexManifestV1>;
    if (
      parsed &&
      parsed.format === "agex-manifest" &&
      parsed.version === 1 &&
      parsed.packs &&
      typeof parsed.packs === "object"
    ) {
      return {
        format: "agex-manifest",
        version: 1,
        packs: parsed.packs,
      };
    }
  } catch {
    // Corrupted manifest should not allow blind overwrites
    throw new Error(
      "O manifesto .agex/manifest.json existente está corrompido; revise antes de exportar.",
    );
  }
  return { format: "agex-manifest", version: 1, packs: {} };
}

function managedBlockMarkers(packId: string) {
  return {
    begin: `<!-- AGEX:BEGIN pack=${packId} -->`,
    end: `<!-- AGEX:END pack=${packId} -->`,
  };
}

function wrapManagedBlock(packId: string, body: string): string {
  const { begin, end } = managedBlockMarkers(packId);
  return `${begin}\n${body.trimEnd()}\n${end}\n`;
}

function mergeManagedMarkdown(
  existingText: string,
  packId: string,
  body: string,
  resolution: ConflictResolution,
): { content?: string; conflict?: ExportConflict } {
  const { begin, end } = managedBlockMarkers(packId);
  const wrapped = wrapManagedBlock(packId, body);
  const startIdx = existingText.indexOf(begin);
  const endIdx = existingText.indexOf(end);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existingText.slice(0, startIdx);
    const after = existingText.slice(endIdx + end.length).replace(/^\n/, "");
    const next = `${before}${wrapped.trimEnd()}${after ? `\n${after}` : "\n"}`;
    return { content: next };
  }

  if (resolution === "append-managed") {
    const trimmed = existingText.trimEnd();
    return {
      content: trimmed ? `${trimmed}\n\n${wrapped}` : wrapped,
    };
  }
  if (resolution === "overwrite") {
    return { content: wrapped };
  }
  return {
    conflict: {
      path: "",
      reason:
        "Arquivo Markdown existente sem bloco gerenciado Agex. Confirme para anexar o bloco gerenciado ou sobrescrever.",
      canAppendManaged: true,
    },
  };
}

function mergeJsonMcp(existingText: string, incomingText: string): {
  content?: string;
  reason?: string;
} {
  let existingObj: Record<string, unknown>;
  try {
    existingObj = JSON.parse(existingText) as Record<string, unknown>;
  } catch {
    return { reason: "Arquivo JSON de MCP existente está inválido." };
  }
  if (!existingObj || typeof existingObj !== "object" || Array.isArray(existingObj)) {
    return { reason: "Arquivo JSON de MCP existente deve ser um objeto JSON." };
  }
  const incomingObj = JSON.parse(incomingText) as Record<string, unknown>;
  const existingServers =
    existingObj.mcpServers &&
    typeof existingObj.mcpServers === "object" &&
    !Array.isArray(existingObj.mcpServers)
      ? (existingObj.mcpServers as Record<string, unknown>)
      : {};
  const incomingServers =
    incomingObj.mcpServers &&
    typeof incomingObj.mcpServers === "object" &&
    !Array.isArray(incomingObj.mcpServers)
      ? (incomingObj.mcpServers as Record<string, unknown>)
      : {};

  const merged = {
    ...existingObj,
    mcpServers: {
      ...existingServers,
      ...incomingServers,
    },
  };
  return { content: `${JSON.stringify(merged, null, 2)}\n` };
}

function mergeTomlConfig(existingText: string, incomingText: string): {
  content?: string;
  reason?: string;
} {
  let existingObj: Record<string, unknown>;
  try {
    existingObj = parseToml(existingText) as Record<string, unknown>;
  } catch (e) {
    return {
      reason: `Arquivo .codex/config.toml existente possui TOML inválido: ${e instanceof Error ? e.message : "erro de sintaxe"}`,
    };
  }
  const incomingObj = parseToml(incomingText) as Record<string, unknown>;
  const existingServers =
    existingObj.mcp_servers &&
    typeof existingObj.mcp_servers === "object" &&
    !Array.isArray(existingObj.mcp_servers)
      ? (existingObj.mcp_servers as Record<string, unknown>)
      : {};
  const incomingServers =
    incomingObj.mcp_servers &&
    typeof incomingObj.mcp_servers === "object" &&
    !Array.isArray(incomingObj.mcp_servers)
      ? (incomingObj.mcp_servers as Record<string, unknown>)
      : {};

  const merged: Record<string, unknown> = {
    ...existingObj,
    mcp_servers: {
      ...existingServers,
      ...incomingServers,
    },
  };
  return { content: `${stringifyToml(merged).trimEnd()}\n` };
}

export async function exportPackSafely(options: {
  projectDir: string;
  pack: AgentPackV2;
  mappingVersion: string;
  files: GeneratedFile[];
  mergePolicy: (path: string) => MergePolicy;
  conflictResolution?: ConflictResolution;
  cleanOrphans?: boolean;
  orphanPaths?: string[];
}): Promise<{
  files: ExportFileResult[];
  skipped: string[];
  conflicts: ExportConflict[];
  orphans: string[];
  removedOrphans: string[];
}> {
  const {
    projectDir,
    pack,
    mappingVersion,
    files,
    mergePolicy,
    conflictResolution = "abort",
    cleanOrphans = false,
    orphanPaths,
  } = options;

  const packId = pack.common.id;
  const manifest = await readManifest(projectDir);
  const prevEntry = manifest.packs[packId];

  const conflicts: ExportConflict[] = [];
  const plannedWrites: {
    path: string;
    absPath: string;
    content: string;
    action: "created" | "updated" | "merged" | "unchanged";
    policy: MergePolicy;
  }[] = [];

  for (const f of files) {
    const absPath = await assertNoSymlinkChain(projectDir, f.path);
    const policy = mergePolicy(f.path);
    const existingText = await readOptionalUtf8(absPath);

    if (policy === "json-merge") {
      if (existingText === null) {
        plannedWrites.push({
          path: f.path,
          absPath,
          content: f.content,
          action: "created",
          policy,
        });
      } else {
        const merged = mergeJsonMcp(existingText, f.content);
        if (merged.reason || !merged.content) {
          conflicts.push({
            path: f.path,
            reason: merged.reason ?? "Falha ao mesclar JSON.",
          });
        } else {
          plannedWrites.push({
            path: f.path,
            absPath,
            content: merged.content,
            action: merged.content === existingText ? "unchanged" : "merged",
            policy,
          });
        }
      }
      continue;
    }

    if (policy === "toml-merge") {
      if (existingText === null) {
        plannedWrites.push({
          path: f.path,
          absPath,
          content: f.content,
          action: "created",
          policy,
        });
      } else {
        const merged = mergeTomlConfig(existingText, f.content);
        if (merged.reason || !merged.content) {
          conflicts.push({
            path: f.path,
            reason: merged.reason ?? "Falha ao mesclar TOML.",
          });
        } else {
          plannedWrites.push({
            path: f.path,
            absPath,
            content: merged.content,
            action: merged.content === existingText ? "unchanged" : "merged",
            policy,
          });
        }
      }
      continue;
    }

    if (policy === "managed-markdown") {
      const wrapped = wrapManagedBlock(packId, f.content);
      if (existingText === null) {
        plannedWrites.push({
          path: f.path,
          absPath,
          content: wrapped,
          action: "created",
          policy,
        });
      } else {
        const merged = mergeManagedMarkdown(
          existingText,
          packId,
          f.content,
          conflictResolution,
        );
        if (merged.conflict || !merged.content) {
          conflicts.push({
            path: f.path,
            reason:
              merged.conflict?.reason ??
              "Conflito no arquivo Markdown existente.",
            canAppendManaged: true,
          });
        } else {
          plannedWrites.push({
            path: f.path,
            absPath,
            content: merged.content,
            action: merged.content === existingText ? "unchanged" : "merged",
            policy,
          });
        }
      }
      continue;
    }

    if (policy === "create-only" && existingText !== null) {
      plannedWrites.push({
        path: f.path,
        absPath,
        content: existingText,
        action: "unchanged",
        policy,
      });
      continue;
    }

    // replace-owned
    if (existingText === null) {
      plannedWrites.push({
        path: f.path,
        absPath,
        content: f.content,
        action: "created",
        policy,
      });
    } else if (existingText === f.content) {
      plannedWrites.push({
        path: f.path,
        absPath,
        content: f.content,
        action: "unchanged",
        policy,
      });
    } else {
      const recordedSha = prevEntry?.files?.[f.path]?.sha256;
      const diskSha = sha256Text(existingText);
      if (
        (recordedSha && recordedSha === diskSha) ||
        conflictResolution === "overwrite"
      ) {
        plannedWrites.push({
          path: f.path,
          absPath,
          content: f.content,
          action: "updated",
          policy,
        });
      } else {
        conflicts.push({
          path: f.path,
          reason: recordedSha
            ? "Arquivo foi editado manualmente fora do Agex desde a última exportação."
            : "Arquivo já existe no projeto e não foi criado por este pacote Agex.",
        });
      }
    }
  }

  // Detect orphaned owned files from previous exports of the same pack
  const nextPathSet = new Set(files.map((f) => f.path));
  const detectedOrphans: string[] = [];
  if (prevEntry) {
    for (const [oldRelPath, meta] of Object.entries(prevEntry.files)) {
      if (meta.policy !== "replace-owned") continue;
      if (nextPathSet.has(oldRelPath)) continue;
      const absOld = await assertNoSymlinkChain(projectDir, oldRelPath);
      const diskText = await readOptionalUtf8(absOld);
      if (diskText !== null) {
        detectedOrphans.push(oldRelPath);
      }
    }
  }

  if (conflicts.length > 0) {
    return {
      files: [],
      skipped: plannedWrites.filter((w) => w.action === "unchanged").map((w) => w.path),
      conflicts,
      orphans: detectedOrphans,
      removedOrphans: [],
    };
  }

  // Execute safe writes
  const results: ExportFileResult[] = [];
  const skipped: string[] = [];
  const nextManifestFiles: AgexManifestEntry["files"] = {};

  for (const w of plannedWrites) {
    if (w.action !== "unchanged") {
      await mkdir(dirname(w.absPath), { recursive: true });
      await writeFile(w.absPath, w.content, "utf8");
    } else {
      skipped.push(w.path);
    }
    results.push({ path: w.path, action: w.action });
    nextManifestFiles[w.path] = {
      sha256: sha256Text(w.content),
      policy: w.policy,
    };
  }

  // Handle explicit opt-in orphan removal ONLY for tracked Agex-owned paths
  const removedOrphans: string[] = [];
  const remainingOrphans: string[] = [];
  const requestedSet = Array.isArray(orphanPaths) ? new Set(orphanPaths) : null;

  for (const orphanRel of detectedOrphans) {
    const shouldDelete = cleanOrphans || (requestedSet?.has(orphanRel) ?? false);
    if (!shouldDelete) {
      remainingOrphans.push(orphanRel);
      const oldMeta = prevEntry?.files[orphanRel];
      if (oldMeta) {
        nextManifestFiles[orphanRel] = oldMeta;
      }
      continue;
    }
    const absOld = await assertNoSymlinkChain(projectDir, orphanRel);
    const relCheck = relative(resolve(projectDir), absOld);
    if (relCheck.startsWith("..")) {
      throw new Error(`Remoção bloqueada fora do projeto: ${orphanRel}`);
    }
    await rm(absOld, { force: true });
    removedOrphans.push(orphanRel);
  }

  manifest.packs[packId] = {
    packId,
    target: pack.target,
    mappingVersion,
    updatedAt: new Date().toISOString(),
    files: nextManifestFiles,
  };
  const manifestAbs = await assertNoSymlinkChain(projectDir, MANIFEST_REL_PATH);
  await mkdir(dirname(manifestAbs), { recursive: true });
  await writeFile(manifestAbs, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    files: results,
    skipped,
    conflicts: [],
    orphans: remainingOrphans,
    removedOrphans,
  };
}

