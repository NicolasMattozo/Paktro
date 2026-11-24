import JSZip from "jszip";
import {
  packToLegacyAntigravity,
} from "../../platforms/common/convert";
import { parseFrontmatterMarkdown } from "../../platforms/common/frontmatter";
import { assertSafeRelativePath } from "../../platforms/common/paths";
import { CLAUDE_CODE_TOOL_NAMES } from "../../platforms/claude-code/adapter";
import {
  getPlatformAdapter,
  PLATFORM_ADAPTERS,
} from "../../platforms/registry";
import { MAX_IMPORT_BYTES } from "../../storage/local";
import type { AgentConfig, AgentPackV2, TargetPlatform } from "../../types";

const CLAUDE_SPECIFIC_META_KEYS = [
  "disallowedTools",
  "permissionMode",
  "effort",
  "isolation",
  "memory",
  "maxTurns",
  "omitClaudeMd",
] as const;

const CLAUDE_MODEL_IDENTIFIERS = new Set([
  "sonnet",
  "opus",
  "haiku",
  "fable",
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-haiku-5-5",
  "claude-fable-5-2",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-haiku-4-5",
]);

const CLAUDE_TOOL_SET = new Set<string>(CLAUDE_CODE_TOOL_NAMES);

function looksLikeClaudeStandaloneMd(content: string): boolean {
  try {
    const { metadata } = parseFrontmatterMarkdown(content);
    if (CLAUDE_SPECIFIC_META_KEYS.some((k) => k in metadata)) return true;
    if (typeof metadata.tools === "string") return true;
    if (
      Array.isArray(metadata.tools) &&
      metadata.tools.length > 0 &&
      metadata.tools.some((t) =>
        CLAUDE_TOOL_SET.has(String(t).replace(/\([\s\S]*\)$/, "").trim()),
      )
    ) {
      return true;
    }
    if (
      typeof metadata.model === "string" &&
      CLAUDE_MODEL_IDENTIFIERS.has(metadata.model)
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export type SafeUploadedFile = {
  path: string;
  content: string;
};

export async function readSafeFilesFromUpload(
  file: File,
): Promise<SafeUploadedFile[]> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error("O arquivo deve ter no máximo 1 MB.");
  }

  const lower = file.name.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".toml") || lower.endsWith(".json")) {
    const text = await file.text();
    if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) {
      throw new Error("O arquivo excede o limite de 1 MB.");
    }
    const baseName = file.name.replace(/\\/g, "/").split("/").pop() || "agent.md";
    return [{ path: baseName, content: text }];
  }

  if (!lower.endsWith(".zip")) {
    throw new Error("Envie um arquivo .zip, .md, .toml ou .json exportado.");
  }

  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files);
  if (entries.length > 200) {
    throw new Error("O arquivo ZIP contém itens demais (máximo 200).");
  }

  let totalBytes = 0;
  const result: SafeUploadedFile[] = [];

  for (const entry of entries) {
    if (entry.dir) continue;
    const unsafeName = (entry as { unsafeOriginalName?: string }).unsafeOriginalName;
    if (unsafeName) {
      assertSafeRelativePath(unsafeName);
    }
    assertSafeRelativePath(entry.name);
    const lower = entry.name.toLowerCase();
    if (
      lower === "paktro.json" ||
      lower === "paktro-setup.md" ||
      lower === "agex.json" ||
      lower === "agex-setup.md"
    ) {
      continue;
    }
    const bytes = await entry.async("uint8array");
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_IMPORT_BYTES) {
      throw new Error(
        "Conteúdo descompactado do ZIP ultrapassa o limite de 1 MB.",
      );
    }
    result.push({
      path: entry.name,
      content: new TextDecoder().decode(bytes),
    });
  }

  return result;
}

export type PlatformImportResult =
  | {
      status: "ok";
      target: TargetPlatform;
      packs: AgentPackV2[];
      warnings: string[];
    }
  | {
      status: "ambiguous";
      candidateTargets: TargetPlatform[];
      files: SafeUploadedFile[];
      warnings: string[];
    };

export function importFromRawFiles(
  files: SafeUploadedFile[],
  targetHint?: TargetPlatform,
): PlatformImportResult {
  if (files.length === 0) {
    throw new Error("Nenhum arquivo reconhecível encontrado para importar.");
  }

  if (targetHint) {
    const adapter = getPlatformAdapter(targetHint);
    const normalizedForHint =
      targetHint === "claude-code" &&
      files.length === 1 &&
      files[0].path.endsWith(".md") &&
      !files[0].path.includes("/") &&
      files[0].path !== "CLAUDE.md" &&
      files[0].path !== "AGENTS.md"
        ? [{ path: `.claude/agents/${files[0].path}`, content: files[0].content }]
        : targetHint === "codex" &&
            files.length === 1 &&
            files[0].path.endsWith(".toml") &&
            !files[0].path.includes("/")
          ? [{ path: `.codex/agents/${files[0].path}`, content: files[0].content }]
          : files;
    const parsed = adapter.importFiles(normalizedForHint);
    if (!parsed || parsed.packs.length === 0) {
      throw new Error(
        `Os arquivos enviados não correspondem à estrutura de ${adapter.catalog.name}.`,
      );
    }
    return {
      status: "ok",
      target: targetHint,
      packs: parsed.packs,
      warnings: parsed.warnings,
    };
  }

  // Explicit platform signatures
  const hasAntigravity = files.some((f) =>
    /^\.agents\/agents\/(?:[^/]+\.md|[^/]+\/agent\.md)$/.test(f.path),
  );
  const hasClaude = files.some(
    (f) =>
      /^\.claude\/(agents|rules)\//.test(f.path) ||
      /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(f.path) ||
      f.path === "CLAUDE.md",
  );
  const hasCodexToml = files.some(
    (f) => /^\.codex\/agents\/[^/]+\.toml$/.test(f.path) || f.path === ".codex/config.toml",
  );
  const hasChatGpt = files.some(
    (f) =>
      f.path === "plugin.json" ||
      f.path === ".codex-plugin/plugin.json" ||
      /^skills\/[^/]+\/SKILL\.md$/.test(f.path),
  );

  const detectedOrder: TargetPlatform[] = [];
  if (hasAntigravity) detectedOrder.push("antigravity");
  if (hasClaude) detectedOrder.push("claude-code");
  if (hasCodexToml) detectedOrder.push("codex");
  if (hasChatGpt) detectedOrder.push("chatgpt-plugin");

  if (detectedOrder.length === 1) {
    const target = detectedOrder[0];
    const res = PLATFORM_ADAPTERS[target].importFiles(files);
    if (res && res.packs.length > 0) {
      return {
        status: "ok",
        target,
        packs: res.packs,
        warnings: res.warnings,
      };
    }
  }

  if (detectedOrder.length > 1) {
    return {
      status: "ambiguous",
      candidateTargets: detectedOrder,
      files,
      warnings: [
        "O arquivo contém estruturas de múltiplas plataformas. Escolha qual plataforma deseja importar.",
      ],
    };
  }

  // Single standalone .md heuristic: check if Claude Code subagent or Antigravity agent
  if (
    files.length === 1 &&
    files[0].path.endsWith(".md") &&
    files[0].path !== "AGENTS.md" &&
    files[0].path !== "CLAUDE.md"
  ) {
    if (looksLikeClaudeStandaloneMd(files[0].content)) {
      const ccRes = PLATFORM_ADAPTERS["claude-code"].importFiles([
        { path: `.claude/agents/${files[0].path}`, content: files[0].content },
      ]);
      if (ccRes && ccRes.packs.length > 0) {
        return {
          status: "ok",
          target: "claude-code",
          packs: ccRes.packs,
          warnings: ccRes.warnings,
        };
      }
    }
    const res = PLATFORM_ADAPTERS.antigravity.importFiles(files);
    if (res && res.packs.length > 0) {
      return {
        status: "ok",
        target: "antigravity",
        packs: res.packs,
        warnings: res.warnings,
      };
    }
  }

  // Ambiguous shared files (.mcp.json, AGENTS.md, .agents/skills/*)
  const hasSharedMcp = files.some((f) => f.path === ".mcp.json");
  const hasAgentsMd = files.some((f) => f.path === "AGENTS.md");
  const hasSharedSkills = files.some((f) =>
    /^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(f.path),
  );
  if (hasSharedMcp || hasAgentsMd || hasSharedSkills) {
    const candidates: TargetPlatform[] = [];
    if (hasAgentsMd || hasSharedSkills) candidates.push("codex");
    if (hasSharedSkills) candidates.push("antigravity");
    if (hasSharedMcp || hasAgentsMd) candidates.push("claude-code");
    const uniqueCandidates = [...new Set(candidates)];
    return {
      status: "ambiguous",
      candidateTargets: uniqueCandidates.length ? uniqueCandidates : ["antigravity", "claude-code", "codex"],
      files,
      warnings: [
        "Os arquivos encontrados (.mcp.json, AGENTS.md ou .agents/skills) são compartilhados por mais de uma plataforma. Escolha o destino antes de importar.",
      ],
    };
  }

  // Fallback check on single TOML or mcp.json
  const codexSingle = PLATFORM_ADAPTERS.codex.importFiles(
    files.length === 1 && files[0].path.endsWith(".toml") && !files[0].path.includes("/")
      ? [{ path: `.codex/agents/${files[0].path}`, content: files[0].content }]
      : files,
  );
  if (codexSingle && codexSingle.packs.length > 0 && codexSingle.detectedTarget === "codex") {
    return {
      status: "ok",
      target: "codex",
      packs: codexSingle.packs,
      warnings: codexSingle.warnings,
    };
  }

  const chatgptMcpOnly =
    files.length === 1 && files[0].path === "mcp.json"
      ? PLATFORM_ADAPTERS["chatgpt-plugin"].importFiles([
          ...files,
          {
            path: "plugin.json",
            content: JSON.stringify({
              name: "chatgpt-plugin",
              version: "1.0.0",
              description: "Plugin importado de mcp.json.",
            }),
          },
        ])
      : null;
  if (chatgptMcpOnly && chatgptMcpOnly.packs.length > 0) {
    return {
      status: "ok",
      target: "chatgpt-plugin",
      packs: chatgptMcpOnly.packs,
      warnings: chatgptMcpOnly.warnings,
    };
  }

  throw new Error(
    "Não foi possível identificar uma estrutura Antigravity, Claude Code, Codex ou ChatGPT Plugin neste arquivo.",
  );
}

export async function importPlatform(
  file: File,
  targetHint?: TargetPlatform,
): Promise<PlatformImportResult> {
  const files = await readSafeFilesFromUpload(file);
  return importFromRawFiles(files, targetHint);
}

export async function importAntigravity(
  file: File,
): Promise<{ agents: AgentConfig[]; warnings: string[] }> {
  const files = await readSafeFilesFromUpload(file);
  const res = PLATFORM_ADAPTERS.antigravity.importFiles(files);
  if (!res || res.packs.length === 0) {
    throw new Error(
      "Nenhum arquivo de agente Antigravity (.agents/agents/*.md ou .md) encontrado.",
    );
  }
  return {
    agents: res.packs.map((pack) => {
      const legacy = packToLegacyAntigravity(pack);
      return {
        ...legacy,
        instructions: legacy.instructions || legacy.goal,
      };
    }),
    warnings: res.warnings,
  };
}
