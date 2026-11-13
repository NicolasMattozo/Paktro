import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  configSchema,
  slugSchema,
  slugify,
  warnings,
} from "../src/schemas/config";
import { generateFiles, MAPPING_VERSION } from "../src/generators/antigravity";
import { MODEL_FAMILIES, MODEL_IDS } from "../src/templates/models";
import { TOOL_CATALOG, TOOL_NAMES } from "../src/templates/tools";
import {
  createAgent,
  RULES,
  SKILLS,
  TEMPLATES,
} from "../src/templates/catalog";
import type {
  AgentConfig,
  McpServer as McpConfig,
  Rule as RuleConfig,
  Skill as SkillConfig,
} from "../src/types";
import {
  exportApprovedPack,
  readLibraryState,
  upsertPackFromAi,
} from "./store";

const templateIdSchema = z.enum([
  "reviewer",
  "frontend",
  "security",
  "testing",
  "generic",
]);

const ruleInputSchema = z.object({
  id: z.string().max(64).optional(),
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  content: z.string().min(1).max(20000),
  trigger: z.enum(["always_on", "model_decision", "glob", "manual"]).optional(),
  globs: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
});

const skillInputSchema = z.object({
  id: z.string().max(64).optional(),
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  content: z.string().min(1).max(20000),
  enabled: z.boolean().optional(),
});

const mcpInputSchema = z.object({
  id: slugSchema,
  transport: z.enum(["stdio", "http"]).optional(),
  command: z.string().max(500).optional(),
  args: z.array(z.string().max(1000)).max(50).optional(),
  serverUrl: z.string().max(2000).optional(),
  enabled: z.boolean().optional(),
});

function resolveRules(
  base: RuleConfig[],
  ruleIds?: string[],
  customRules?: z.infer<typeof ruleInputSchema>[],
): RuleConfig[] {
  if (ruleIds === undefined && customRules === undefined) return base;
  const fromPresets = (ruleIds ?? []).map((id) => {
    const preset = RULES.find((r) => r.id === id);
    if (!preset) throw new Error(`Regra padrão desconhecida: ${id}`);
    return { ...preset, enabled: true };
  });
  const fromCustom = (customRules ?? []).map((r, index) => {
    const id = slugify(r.id || r.name) || `regra-${index + 1}`;
    return {
      id,
      name: r.name,
      description: r.description?.trim() || r.name,
      content: r.content,
      trigger: r.trigger ?? ("always_on" as const),
      globs: r.globs ?? "",
      enabled: r.enabled ?? true,
    };
  });
  const merged = new Map<string, RuleConfig>();
  for (const r of [...fromPresets, ...fromCustom]) merged.set(r.id, r);
  return [...merged.values()];
}

function resolveSkills(
  base: SkillConfig[],
  skillIds?: string[],
  customSkills?: z.infer<typeof skillInputSchema>[],
): SkillConfig[] {
  if (skillIds === undefined && customSkills === undefined) return base;
  const fromPresets = (skillIds ?? []).map((id) => {
    const preset = SKILLS.find((s) => s.id === id);
    if (!preset) throw new Error(`Skill padrão desconhecida: ${id}`);
    return { ...preset, enabled: true };
  });
  const fromCustom = (customSkills ?? []).map((s, index) => {
    const id = slugify(s.id || s.name) || `skill-${index + 1}`;
    return {
      id,
      name: s.name,
      description: s.description?.trim() || s.name,
      content: s.content,
      enabled: s.enabled ?? true,
    };
  });
  const merged = new Map<string, SkillConfig>();
  for (const s of [...fromPresets, ...fromCustom]) merged.set(s.id, s);
  return [...merged.values()];
}

function resolveMcps(
  base: McpConfig[],
  mcps?: z.infer<typeof mcpInputSchema>[],
): McpConfig[] {
  if (mcps === undefined) return base;
  return mcps.map((m) => ({
    id: m.id,
    transport: m.transport ?? "stdio",
    command: m.command ?? "",
    args: m.args ?? [],
    serverUrl: m.serverUrl ?? "",
    enabled: m.enabled ?? true,
  }));
}

export function createMcpServer(file: string) {
  const server = new McpServer({
    name: "agex-bridge",
    version: "1.0.0",
  });
  const readOnly = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  const writeLibrary = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  };
  const writeProject = {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  };

  const result = (value: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  });
  const errorResult = (message: string) => ({
    isError: true,
    content: [{ type: "text" as const, text: message }],
  });

  async function find(id: string) {
    const state = await readLibraryState(file);
    const agent = state.agents.find((a) => a.id === id);
    if (!agent) throw new Error("Conjunto não encontrado.");
    return { agent, review: state.reviews[id] };
  }

  server.registerTool(
    "get_studio_catalog",
    {
      description:
        "Lista templates, modelos Gemini 4 Hydrogen/Argon, ferramentas válidas, regras universais e skills disponíveis no Agex antes de chamar create_agent ou update_agent.",
      annotations: readOnly,
    },
    async () =>
      result({
        mappingVersion: MAPPING_VERSION,
        templates: TEMPLATES.map((t) => ({
          id: t.id,
          name: t.name,
          specialty: t.specialty,
          goal: t.goal,
          defaultTools: t.tools,
          defaultRuleIds: t.rules,
          defaultSkillIds: t.skills,
        })),
        models: MODEL_FAMILIES,
        validModelIds: MODEL_IDS,
        tools: TOOL_CATALOG,
        toolNotes:
          "Não inclua call_mcp_tool manualmente em tools: o Antigravity injeta call_mcp_tool automaticamente quando há servidores MCP ativos e incluí-la no YAML pode falhar no CLI.",
        presetRules: RULES.map((r) => ({
          id: r.id,
          name: r.name,
          trigger: r.trigger,
          description: r.description,
        })),
        presetSkills: SKILLS.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
        })),
        commandExecutionPolicies: ["off", "auto", "eager", "sandbox"],
        ruleTriggers: ["always_on", "model_decision", "glob", "manual"],
      }),
  );

  server.registerTool(
    "list_packs",
    {
      description:
        "Lista os conjuntos da biblioteca local do Agex e seus status de revisão/aprovação.",
      annotations: readOnly,
    },
    async () => {
      const state = await readLibraryState(file);
      return result(
        state.agents.map((a) => {
          const review = state.reviews[a.id];
          return {
            id: a.id,
            name: a.name,
            slug: a.slug,
            description: a.description,
            model: a.model,
            updatedAt: a.updatedAt,
            approvalStatus: review?.effectiveStatus ?? "draft",
            source: review?.source ?? "studio",
            targetProject: review?.targetProject,
          };
        }),
      );
    },
  );

  server.registerTool(
    "get_pack",
    {
      description:
        "Obtém um conjunto, status de aprovação e seus arquivos gerados. Para exportar diretamente no projeto do usuário após aprovação no site, use export_pack_to_project.",
      inputSchema: { id: z.string().uuid() },
      annotations: readOnly,
    },
    async ({ id }) => {
      const { agent, review } = await find(id);
      const approvalStatus = review?.effectiveStatus ?? "draft";
      return result({
        mappingVersion: MAPPING_VERSION,
        approval: {
          status: approvalStatus,
          stale: review?.stale ?? false,
          source: review?.source ?? "studio",
          targetProject: review?.targetProject,
          approvedAt: review?.approvedAt,
          note: review?.note,
        },
        config: agent,
        files: generateFiles(agent),
        applicationInstructions:
          approvalStatus === "approved"
            ? "Conjunto aprovado pelo usuário no Agex. Você já pode chamar export_pack_to_project com o id e a pasta do projeto (ou aplicar com suas próprias ferramentas)."
            : "Conjunto ainda não aprovado para exportação direta. Peça ao usuário para revisar no site Agex e clicar em 'Dar OK (aprovar para exportar)'.",
      });
    },
  );

  server.registerTool(
    "validate_pack",
    {
      description: "Valida formato, referências e escolhas do conjunto local.",
      inputSchema: { id: z.string().uuid() },
      annotations: readOnly,
    },
    async ({ id }) => {
      const { agent, review } = await find(id);
      const parsed = configSchema.safeParse(agent);
      return result({
        valid: parsed.success,
        approvalStatus: review?.effectiveStatus ?? "draft",
        errors: parsed.success ? [] : parsed.error.issues,
        warnings: warnings(agent),
      });
    },
  );

  server.registerTool(
    "create_agent",
    {
      description:
        "Cria um novo agente no Agex para o usuário revisar visualmente no site antes de aprovar a exportação. Use get_studio_catalog antes se precisar conferir IDs de modelos, ferramentas, regras e skills.",
      inputSchema: {
        template: templateIdSchema.optional(),
        name: z.string().min(1).max(100),
        slug: z.string().max(100).optional(),
        description: z.string().max(2000).optional(),
        specialty: z.string().max(300).optional(),
        goal: z.string().max(2000).optional(),
        instructions: z.string().max(12000).optional(),
        model: z.enum(MODEL_IDS).optional(),
        mainAgent: z.boolean().optional(),
        subagent: z.boolean().optional(),
        tools: z.array(z.enum(TOOL_NAMES)).max(TOOL_NAMES.length).optional(),
        commandExecutionPolicy: z
          .enum(["off", "auto", "eager", "sandbox"])
          .optional(),
        ruleIds: z.array(z.string()).max(30).optional(),
        rules: z.array(ruleInputSchema).max(30).optional(),
        skillIds: z.array(z.string()).max(30).optional(),
        skills: z.array(skillInputSchema).max(30).optional(),
        mcpServers: z.array(mcpInputSchema).max(20).optional(),
        tags: z.array(z.string().max(32)).max(10).optional(),
        note: z.string().max(1000).optional(),
        targetProject: z.string().max(4096).optional(),
      },
      annotations: writeLibrary,
    },
    async (args) => {
      try {
        const base = createAgent(args.template ?? "generic");
        const slug =
          slugify(args.slug || args.name) || base.slug || "custom-agent";
        const goal = args.goal?.trim() || base.goal;
        const candidate: AgentConfig = {
          ...base,
          name: args.name.trim(),
          slug,
          description: args.description?.trim() || goal,
          specialty: args.specialty?.trim() || base.specialty,
          goal,
          instructions: args.instructions ?? base.instructions,
          model: args.model ?? base.model,
          mainAgent: args.mainAgent ?? base.mainAgent,
          subagent: args.subagent ?? base.subagent,
          tools: args.tools ?? base.tools,
          commandExecutionPolicy:
            args.commandExecutionPolicy ?? base.commandExecutionPolicy,
          rules: resolveRules(base.rules, args.ruleIds, args.rules),
          skills: resolveSkills(base.skills, args.skillIds, args.skills),
          mcpServers: resolveMcps(base.mcpServers, args.mcpServers),
          tags: args.tags ?? base.tags,
          updatedAt: new Date().toISOString(),
        };
        const saved = await upsertPackFromAi(file, candidate, {
          note: args.note,
          targetProject: args.targetProject,
        });
        return result({
          id: saved.agent.id,
          name: saved.agent.name,
          slug: saved.agent.slug,
          approvalStatus: saved.review?.status ?? "pending_review",
          warnings: warnings(saved.agent),
          filesPreview: generateFiles(saved.agent).map((f) => f.path),
          nextStepForUser:
            "Agente enviado para o Agex em estado 'pending_review'. Peça ao usuário para abrir o site Agex conectado à ponte, revisar o agente e clicar em 'Dar OK (aprovar para exportar)' antes de chamar export_pack_to_project.",
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
        "Atualiza um agente existente no Agex. Qualquer alteração feita pela IA exige nova revisão e aprovação (Dar OK) do usuário no site antes de exportar.",
      inputSchema: {
        id: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        slug: z.string().max(100).optional(),
        description: z.string().max(2000).optional(),
        specialty: z.string().max(300).optional(),
        goal: z.string().max(2000).optional(),
        instructions: z.string().max(12000).optional(),
        model: z.enum(MODEL_IDS).optional(),
        mainAgent: z.boolean().optional(),
        subagent: z.boolean().optional(),
        tools: z.array(z.enum(TOOL_NAMES)).max(TOOL_NAMES.length).optional(),
        commandExecutionPolicy: z
          .enum(["off", "auto", "eager", "sandbox"])
          .optional(),
        ruleIds: z.array(z.string()).max(30).optional(),
        rules: z.array(ruleInputSchema).max(30).optional(),
        skillIds: z.array(z.string()).max(30).optional(),
        skills: z.array(skillInputSchema).max(30).optional(),
        mcpServers: z.array(mcpInputSchema).max(20).optional(),
        tags: z.array(z.string().max(32)).max(10).optional(),
        note: z.string().max(1000).optional(),
        targetProject: z.string().max(4096).optional(),
      },
      annotations: writeLibrary,
    },
    async (args) => {
      try {
        const { agent: current, review } = await find(args.id);
        const nextName = args.name?.trim() || current.name;
        const nextSlug =
          args.slug !== undefined
            ? slugify(args.slug) || current.slug
            : current.slug;
        const candidate: AgentConfig = {
          ...current,
          name: nextName,
          slug: nextSlug,
          description: args.description?.trim() ?? current.description,
          specialty: args.specialty?.trim() ?? current.specialty,
          goal: args.goal?.trim() ?? current.goal,
          instructions: args.instructions ?? current.instructions,
          model: args.model ?? current.model,
          mainAgent: args.mainAgent ?? current.mainAgent,
          subagent: args.subagent ?? current.subagent,
          tools: args.tools ?? current.tools,
          commandExecutionPolicy:
            args.commandExecutionPolicy ?? current.commandExecutionPolicy,
          rules: resolveRules(current.rules, args.ruleIds, args.rules),
          skills: resolveSkills(current.skills, args.skillIds, args.skills),
          mcpServers: resolveMcps(current.mcpServers, args.mcpServers),
          tags: args.tags ?? current.tags,
          updatedAt: new Date().toISOString(),
        };
        const saved = await upsertPackFromAi(file, candidate, {
          note: args.note ?? review?.note,
          targetProject: args.targetProject ?? review?.targetProject,
        });
        return result({
          id: saved.agent.id,
          name: saved.agent.name,
          slug: saved.agent.slug,
          approvalStatus: saved.review?.status ?? "pending_review",
          warnings: warnings(saved.agent),
          filesPreview: generateFiles(saved.agent).map((f) => f.path),
          nextStepForUser:
            "Alterações salvas no Agex e marcadas para nova revisão ('pending_review'). Peça ao usuário para conferir no site e dar o OK antes de exportar.",
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
        "Exporta os arquivos Antigravity (.agents/ e AGEX-SETUP.md quando aplicável) diretamente para a pasta do projeto de destino. Só executa se o usuário já tiver clicado em 'Dar OK (aprovar para exportar)' nesta exata revisão no site Agex.",
      inputSchema: {
        id: z.string().uuid(),
        projectPath: z.string().max(4096).optional(),
      },
      annotations: writeProject,
    },
    async ({ id, projectPath }) => {
      try {
        const exported = await exportApprovedPack(file, id, projectPath);
        return result({
          exported: true,
          ...exported,
        });
      } catch (e) {
        return errorResult(
          e instanceof Error
            ? e.message
            : "Não foi possível exportar para o projeto.",
        );
      }
    },
  );

  return server;
}
