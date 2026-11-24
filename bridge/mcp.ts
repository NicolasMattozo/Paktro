import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  convertPackTarget,
  defaultAntigravityTarget,
  defaultChatGptPluginTarget,
  defaultClaudeCodeTarget,
  defaultCodexTarget,
} from "../src/platforms/common/convert";
import { slugify } from "../src/platforms/common/paths";
import { getPlatformAdapter, PLATFORM_ADAPTERS } from "../src/platforms/registry";
import { TARGET_PLATFORMS } from "../src/platforms/types";
import {
  antigravityTargetSchema,
  chatGptPluginTargetSchema,
  claudeCodeEffortEnum,
  claudeCodeMemoryEnum,
  claudeCodeModelEnum,
  claudeCodePermissionModeEnum,
  claudeCodeTargetSchema,
  claudeCodeToolEnum,
  codexModelEnum,
  codexReasoningEffortEnum,
  codexTargetSchema,
  commonMcpSchema,
  commonRuleSchema,
  commonSkillSchema,
  targetPlatformSchema,
} from "../src/schemas/pack";
import { createPack, TEMPLATES } from "../src/templates/catalog";
import { MODEL_IDS, normalizeAntigravityModelId } from "../src/templates/models";
import { TOOL_NAMES } from "../src/templates/tools";
import type { AgentPackV2, CommonRule, TargetPlatform } from "../src/types";
import {
  exportApprovedPack,
  ExportConflictError,
  readLibraryState,
  upsertPackFromAi,
} from "./store";

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

const legacyOrCommonRuleInput = z.union([
  commonRuleSchema,
  z
    .object({
      id: z.string().min(1).max(64),
      name: z.string().min(1).max(100),
      description: z.string().max(500).default(""),
      content: z.string().min(1).max(12000),
      trigger: z.enum(["always_on", "model_decision", "glob", "manual"]),
      globs: z.string().max(500).default(""),
      enabled: z.boolean().default(true),
    })
    .strict(),
]);

function normalizeIncomingRules(
  rules: z.infer<typeof legacyOrCommonRuleInput>[] | undefined,
): CommonRule[] | undefined {
  if (!rules) return undefined;
  return rules.map((r) => {
    if ("activation" in r) return r;
    const activation =
      r.trigger === "always_on"
        ? ({ type: "always" } as const)
        : r.trigger === "model_decision"
          ? ({ type: "automatic", description: r.description } as const)
          : r.trigger === "glob"
            ? ({
                type: "path",
                patterns: r.globs
                  .split(",")
                  .map((p) => p.trim())
                  .filter(Boolean),
              } as const)
            : ({ type: "manual" } as const);
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      content: r.content,
      activation,
      enabled: r.enabled,
    };
  });
}

const basePackFieldsShape = {
  target: targetPlatformSchema.optional(),
  template: z
    .enum(["reviewer", "frontend", "security", "testing", "generic"])
    .optional(),
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(64).optional(),
  description: z.string().max(2000).optional(),
  specialty: z.string().max(300).optional(),
  goal: z.string().max(2000).optional(),
  instructions: z.string().max(12000).optional(),
  model: z.string().max(100).optional(),
  effort: claudeCodeEffortEnum.optional(),
  reasoningEffort: codexReasoningEffortEnum.optional(),
  mainAgent: z.boolean().optional(),
  subagent: z.boolean().optional(),
  exposure: z.enum(["main", "root", "subagent", "both"]).optional(),
  tools: z.array(z.string().max(64)).max(30).optional(),
  disallowedTools: z.array(claudeCodeToolEnum).max(20).optional(),
  commandExecutionPolicy: z
    .enum(["sandbox", "off", "auto", "eager"])
    .optional(),
  permissionMode: claudeCodePermissionModeEnum.optional(),
  isolation: z.enum(["none", "worktree"]).optional(),
  memory: claudeCodeMemoryEnum.optional(),
  maxTurns: z.number().int().min(1).max(1000).optional(),
  omitClaudeMd: z.boolean().optional(),
  shellTool: z.enum(["inherit", "disabled"]).optional(),
  includeClaudeMd: z.boolean().optional(),
  referenceAgentsMd: z.boolean().optional(),
  includeAgentsMd: z.boolean().optional(),
  rules: z.array(legacyOrCommonRuleInput).max(30).optional(),
  skills: z.array(commonSkillSchema).max(30).optional(),
  mcpServers: z
    .array(
      z
        .object({
          id: z.string().min(1).max(64),
          transport: z.enum(["stdio", "http"]),
          command: z.string().max(200).default(""),
          args: z.array(z.string().max(300)).max(30).default([]),
          serverUrl: z.string().max(2000).default(""),
          enabled: z.boolean().default(true),
        })
        .strict(),
    )
    .max(20)
    .optional(),
  tags: z.array(z.string().max(32)).max(10).optional(),
  note: z.string().max(1000).optional(),
};

function applyTargetPatch(
  pack: AgentPackV2,
  target: TargetPlatform,
  args: {
    model?: string;
    effort?: z.infer<typeof claudeCodeEffortEnum>;
    reasoningEffort?: z.infer<typeof codexReasoningEffortEnum>;
    mainAgent?: boolean;
    subagent?: boolean;
    exposure?: "main" | "root" | "subagent" | "both";
    tools?: string[];
    disallowedTools?: z.infer<typeof claudeCodeToolEnum>[];
    commandExecutionPolicy?: "sandbox" | "off" | "auto" | "eager";
    permissionMode?: z.infer<typeof claudeCodePermissionModeEnum>;
    isolation?: "none" | "worktree";
    memory?: z.infer<typeof claudeCodeMemoryEnum>;
    maxTurns?: number;
    omitClaudeMd?: boolean;
    shellTool?: "inherit" | "disabled";
    includeClaudeMd?: boolean;
    referenceAgentsMd?: boolean;
    includeAgentsMd?: boolean;
  },
): AgentPackV2 {
  const next = structuredClone(pack);
  next.target = target;

  if (target === "antigravity") {
    const base = next.targets.antigravity ?? defaultAntigravityTarget();
    if (args.tools) {
      const valid = new Set<string>(TOOL_NAMES);
      const invalid = args.tools.filter((t) => !valid.has(t));
      if (invalid.length > 0) {
        throw new Error(
          `Ferramentas inválidas para Antigravity: ${invalid.join(", ")}.`,
        );
      }
      base.tools = args.tools as typeof TOOL_NAMES[number][];
    }
    if (args.model !== undefined) {
      const normalizedModel = normalizeAntigravityModelId(args.model);
      if (!normalizedModel) {
        throw new Error(`Modelo inválido para Antigravity: "${args.model}".`);
      }
      base.model = normalizedModel;
    }
    if (args.mainAgent !== undefined) base.mainAgent = args.mainAgent;
    if (args.subagent !== undefined) base.subagent = args.subagent;
    if (args.commandExecutionPolicy !== undefined) {
      base.commandExecutionPolicy = args.commandExecutionPolicy;
    }
    next.targets.antigravity = antigravityTargetSchema.parse(base);
  }

  if (target === "claude-code") {
    const base = next.targets.claudeCode ?? defaultClaudeCodeTarget();
    if (args.tools) {
      base.tools = args.tools.map((t) => claudeCodeToolEnum.parse(t));
    }
    if (args.disallowedTools !== undefined) {
      base.disallowedTools = args.disallowedTools;
    }
    if (args.model !== undefined) {
      base.model = claudeCodeModelEnum.parse(args.model);
    }
    if (args.effort !== undefined) base.effort = args.effort;
    if (args.exposure === "main" || args.exposure === "subagent" || args.exposure === "both") {
      base.exposure = args.exposure;
    } else if (args.exposure === "root") {
      base.exposure = "main";
    }
    if (args.permissionMode !== undefined) {
      base.permissionMode = args.permissionMode;
    }
    if (args.isolation !== undefined) base.isolation = args.isolation;
    if (args.memory !== undefined) {
      base.memory = args.memory === "none" ? undefined : args.memory;
    }
    if (args.maxTurns !== undefined) base.maxTurns = args.maxTurns;
    if (args.omitClaudeMd !== undefined) base.omitClaudeMd = args.omitClaudeMd;
    if (args.includeClaudeMd !== undefined) {
      base.includeClaudeMd = args.includeClaudeMd;
    }
    if (args.referenceAgentsMd !== undefined) {
      base.referenceAgentsMd = args.referenceAgentsMd;
    }
    next.targets.claudeCode = claudeCodeTargetSchema.parse(base);
  }

  if (target === "codex") {
    const base = next.targets.codex ?? defaultCodexTarget();
    if (args.tools && args.tools.length > 0) {
      throw new Error(
        "Subagentes Codex (.codex/agents/*.toml) não utilizam lista granular de ferramentas 'tools'; configure 'shellTool' ou instruções em AGENTS.md.",
      );
    }
    if (args.model !== undefined) {
      base.model = codexModelEnum.parse(args.model);
    }
    if (args.reasoningEffort !== undefined) {
      base.reasoningEffort = args.reasoningEffort;
    }
    if (args.exposure === "root" || args.exposure === "subagent" || args.exposure === "both") {
      base.exposure = args.exposure;
    } else if (args.exposure === "main") {
      base.exposure = "root";
    }
    if (args.shellTool !== undefined) base.shellTool = args.shellTool;
    if (args.includeAgentsMd !== undefined) {
      base.includeAgentsMd = args.includeAgentsMd;
    }
    next.targets.codex = codexTargetSchema.parse(base);
  }

  if (target === "chatgpt-plugin") {
    const base = next.targets.chatgptPlugin ?? defaultChatGptPluginTarget();
    next.targets.chatgptPlugin = chatGptPluginTargetSchema.parse(base);
  }

  return next;
}

export function createMcpServer(file: string) {
  const server = new McpServer({
    name: "paktro-bridge",
    version: "2.0.0",
  });

  server.registerTool(
    "get_studio_catalog",
    {
      description:
        "Lista modelos, ferramentas e políticas suportadas para uma plataforma alvo (antigravity por padrão, ou claude-code, codex, chatgpt-plugin). Sempre consulte antes de criar ou editar.",
      inputSchema: {
        target: targetPlatformSchema.optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ target }) => {
      const selected: TargetPlatform = target ?? "antigravity";
      const adapter = getPlatformAdapter(selected);
      return jsonResult({
        target: selected,
        supportedTargets: TARGET_PLATFORMS,
        mappingVersion: adapter.mappingVersion,
        catalog: adapter.catalog,
        templates: TEMPLATES.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
        })),
        // Backward-compatible flat fields for existing Antigravity callers
        validModelIds: adapter.catalog.models.map((m) => m.id),
        validTools: adapter.catalog.tools.map((t) => t.id),
        toolNotes: adapter.catalog.toolNotes,
      });
    },
  );

  server.registerTool(
    "list_packs",
    {
      description:
        "Lista os pacotes configurados na biblioteca local do Paktro com plataforma alvo, versão de mapeamento e status de revisão.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { agents, reviews } = await readLibraryState(file);
      return jsonResult(
        agents.map((a) => ({
          id: a.common.id,
          name: a.common.name,
          slug: a.common.slug,
          target: a.target,
          mappingVersion: PLATFORM_ADAPTERS[a.target].mappingVersion,
          description: a.common.description,
          tags: a.common.tags,
          reviewStatus: reviews[a.common.id]?.effectiveStatus ?? "studio",
          updatedAt: a.common.updatedAt,
        })),
      );
    },
  );

  server.registerTool(
    "get_pack",
    {
      description:
        "Retorna a configuração completa v2 e os arquivos nativos gerados de um pacote específico.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const { agents, reviews } = await readLibraryState(file);
      const pack = agents.find((a) => a.common.id === id);
      if (!pack) return errorResult(`Conjunto "${id}" não encontrado.`);
      const adapter = getPlatformAdapter(pack.target);
      const validation = adapter.validate(pack);
      const files = validation.valid ? adapter.generate(pack) : [];
      return jsonResult({
        target: pack.target,
        mappingVersion: adapter.mappingVersion,
        pack,
        review: reviews[id] ?? null,
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
        files,
      });
    },
  );

  server.registerTool(
    "validate_pack",
    {
      description:
        "Valida um pacote salvo na biblioteca ou um payload v2 explícito contra as regras reais da plataforma alvo.",
      inputSchema: {
        id: z.string().uuid().optional(),
        target: targetPlatformSchema.optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ id, target }) => {
      if (!id) {
        return errorResult("Informe o id do pacote salvo para validar.");
      }
      const { agents } = await readLibraryState(file);
      const pack = agents.find((a) => a.common.id === id);
      if (!pack) return errorResult(`Conjunto "${id}" não encontrado.`);
      const effectiveTarget = target ?? pack.target;
      const candidate =
        effectiveTarget === pack.target
          ? pack
          : convertPackTarget(pack, effectiveTarget).pack;
      const adapter = getPlatformAdapter(effectiveTarget);
      const result = adapter.validate(candidate);
      return jsonResult({
        id,
        target: effectiveTarget,
        mappingVersion: adapter.mappingVersion,
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
        blockers: result.blockers,
        filesPreview: result.valid
          ? adapter.generate(candidate).map((f) => f.path)
          : [],
      });
    },
  );

  server.registerTool(
    "create_agent",
    {
      description:
        "Cria um novo conjunto multiplataforma (antigravity por padrão, ou claude-code, codex, chatgpt-plugin) como 'pending_review'. Requer Dar OK no site antes de exportar.",
      inputSchema: basePackFieldsShape,
      annotations: { readOnlyHint: false },
    },
    async (args) => {
      try {
        const target: TargetPlatform = args.target ?? "antigravity";
        const base = createPack(args.template ?? "generic", target);
        const now = new Date().toISOString();
        const slug = args.slug ? args.slug : slugify(args.name);
        const normalizedRules = normalizeIncomingRules(args.rules);
        const normalizedMcp = args.mcpServers?.map((m) => commonMcpSchema.parse(m));

        let nextPack: AgentPackV2 = {
          ...base,
          target,
          common: {
            ...base.common,
            id: crypto.randomUUID(),
            name: args.name,
            slug,
            description:
              args.description ??
              base.common.description ??
              `Agente ${args.name}.`,
            specialty: args.specialty ?? base.common.specialty,
            goal:
              args.goal ??
              args.description ??
              base.common.goal ??
              `Executar tarefas de ${args.name}.`,
            instructions: args.instructions ?? "",
            rules: normalizedRules ?? base.common.rules,
            skills: args.skills ?? base.common.skills,
            mcpServers: normalizedMcp ?? base.common.mcpServers,
            tags: args.tags ?? base.common.tags,
            updatedAt: now,
          },
        };
        nextPack = applyTargetPatch(nextPack, target, args);

        const adapter = getPlatformAdapter(target);
        const validation = adapter.validate(nextPack);
        if (!validation.valid) {
          return errorResult(validation.errors.join("; "));
        }

        const saved = await upsertPackFromAi({
          file,
          pack: nextPack,
          note: args.note,
        });
        return jsonResult({
          id: saved.pack.common.id,
          name: saved.pack.common.name,
          slug: saved.pack.common.slug,
          target: saved.pack.target,
          mappingVersion: adapter.mappingVersion,
          approvalStatus: saved.review.effectiveStatus,
          filesPreview: adapter.generate(saved.pack).map((f) => f.path),
          warnings: validation.warnings,
          nextStep:
            "Peça ao usuário para revisar o pacote no site Paktro e clicar em 'Dar OK (aprovar para exportar)' antes de chamar export_pack_to_project.",
        });
      } catch (e) {
        return errorResult(
          e instanceof Error ? e.message : "Erro ao criar agente.",
        );
      }
    },
  );

  server.registerTool(
    "update_agent",
    {
      description:
        "Atualiza um pacote existente na biblioteca local e marca a revisão como 'pending_review' (invalida o OK anterior).",
      inputSchema: {
        id: z.string().uuid(),
        ...basePackFieldsShape,
        name: basePackFieldsShape.name.optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => {
      try {
        const { agents } = await readLibraryState(file);
        const existing = agents.find((a) => a.common.id === args.id);
        if (!existing) {
          return errorResult(`Conjunto "${args.id}" não encontrado.`);
        }
        const target: TargetPlatform = args.target ?? existing.target;
        const baseForTarget =
          target === existing.target
            ? existing
            : convertPackTarget(existing, target).pack;
        const normalizedRules = normalizeIncomingRules(args.rules);
        const normalizedMcp = args.mcpServers?.map((m) => commonMcpSchema.parse(m));

        let nextPack: AgentPackV2 = {
          ...baseForTarget,
          target,
          common: {
            ...baseForTarget.common,
            ...(args.name !== undefined ? { name: args.name } : {}),
            ...(args.slug !== undefined ? { slug: args.slug } : {}),
            ...(args.description !== undefined
              ? { description: args.description }
              : {}),
            ...(args.specialty !== undefined
              ? { specialty: args.specialty }
              : {}),
            ...(args.goal !== undefined ? { goal: args.goal } : {}),
            ...(args.instructions !== undefined
              ? { instructions: args.instructions }
              : {}),
            ...(normalizedRules !== undefined ? { rules: normalizedRules } : {}),
            ...(args.skills !== undefined ? { skills: args.skills } : {}),
            ...(normalizedMcp !== undefined
              ? { mcpServers: normalizedMcp }
              : {}),
            ...(args.tags !== undefined ? { tags: args.tags } : {}),
            updatedAt: new Date().toISOString(),
          },
        };
        nextPack = applyTargetPatch(nextPack, target, args);

        const adapter = getPlatformAdapter(target);
        const validation = adapter.validate(nextPack);
        if (!validation.valid) {
          return errorResult(validation.errors.join("; "));
        }

        const saved = await upsertPackFromAi({
          file,
          pack: nextPack,
          note: args.note,
        });
        return jsonResult({
          id: saved.pack.common.id,
          name: saved.pack.common.name,
          slug: saved.pack.common.slug,
          target: saved.pack.target,
          mappingVersion: adapter.mappingVersion,
          approvalStatus: saved.review.effectiveStatus,
          filesPreview: adapter.generate(saved.pack).map((f) => f.path),
          warnings: validation.warnings,
          nextStep:
            "Alterações salvas como pending_review. Solicite novo OK do usuário no site Paktro antes de exportar.",
        });
      } catch (e) {
        return errorResult(
          e instanceof Error ? e.message : "Erro ao atualizar agente.",
        );
      }
    },
  );

  server.registerTool(
    "export_pack_to_project",
    {
      description:
        "Exporta de forma não destrutiva um pacote aprovado (OK dado no site Paktro) para a pasta do projeto. Requer aprovação prévia correspondente à plataforma e conteúdo atuais.",
      inputSchema: {
        id: z.string().uuid(),
        projectPath: z.string().max(4096).optional(),
        conflictResolution: z
          .enum(["abort", "append-managed", "overwrite"])
          .optional(),
        cleanOrphans: z.boolean().optional(),
        orphanPaths: z.array(z.string().max(512)).max(100).optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async ({
      id,
      projectPath,
      conflictResolution,
      cleanOrphans,
      orphanPaths,
    }) => {
      try {
        const result = await exportApprovedPack(file, {
          id,
          projectPath,
          conflictResolution,
          cleanOrphans,
          orphanPaths,
        });
        return jsonResult({
          ok: true,
          ...result,
        });
      } catch (e) {
        if (e instanceof ExportConflictError) {
          return errorResult(
            JSON.stringify({
              error: e.message,
              conflicts: e.conflicts,
              orphans: e.orphans,
            }),
          );
        }
        return errorResult(
          e instanceof Error ? e.message : "Erro ao exportar para o projeto.",
        );
      }
    },
  );

  return server;
}
