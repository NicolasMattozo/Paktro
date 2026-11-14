import { z } from "zod";
import { slugSchema } from "../platforms/common/paths";
import { isValidHttpUrl } from "../platforms/common/mcp";
import { MODEL_IDS } from "../templates/models";
import { TOOL_NAMES } from "../templates/tools";
import type { AgentPackV2 } from "../types";

export const targetPlatformSchema = z.enum([
  "antigravity",
  "claude-code",
  "codex",
  "chatgpt-plugin",
]);

export const capabilityIntentSchema = z.enum([
  "read-files",
  "search-files",
  "edit-files",
  "run-commands",
  "use-web",
  "delegate",
  "use-mcp",
]);

export const instructionActivationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("always") }).strict(),
  z
    .object({
      type: z.literal("automatic"),
      description: z.string().max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal("path"),
      patterns: z.array(z.string().trim().min(1).max(200)).max(30),
    })
    .strict(),
  z.object({ type: z.literal("manual") }).strict(),
]);

export const commonRuleSchema = z
  .object({
    id: slugSchema,
    name: z.string().min(1, "Informe o título da regra.").max(100),
    description: z.string().max(500),
    content: z.string().min(1, "Escreva o conteúdo da regra.").max(12000),
    activation: instructionActivationSchema,
    enabled: z.boolean(),
  })
  .strict()
  .superRefine((rule, ctx) => {
    if (
      rule.enabled &&
      rule.activation.type === "path" &&
      rule.activation.patterns.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["activation"],
        message: "Informe pelo menos um padrão de arquivo para a regra por caminho.",
      });
    }
  });

export const commonRuleDraftSchema = z
  .object({
    id: slugSchema,
    name: z.string().max(100),
    description: z.string().max(500),
    content: z.string().max(12000),
    activation: instructionActivationSchema,
    enabled: z.boolean(),
  })
  .strict();

export const commonSkillSchema = z
  .object({
    id: slugSchema,
    name: z.string().min(1, "Informe o título da skill.").max(100),
    description: z
      .string()
      .min(1, "Informe quando usar esta skill.")
      .max(1000),
    content: z.string().min(1, "Escreva as instruções da skill.").max(12000),
    enabled: z.boolean(),
  })
  .strict();

export const commonSkillDraftSchema = z
  .object({
    id: slugSchema,
    name: z.string().max(100),
    description: z.string().max(1000),
    content: z.string().max(12000),
    enabled: z.boolean(),
  })
  .strict();

export const commonMcpSchema = z
  .object({
    id: slugSchema,
    transport: z.enum(["stdio", "http"]),
    command: z.string().max(200),
    args: z.array(z.string().max(300)).max(30),
    serverUrl: z.string().max(2000),
    enabled: z.boolean(),
  })
  .strict()
  .superRefine((mcp, ctx) => {
    if (!mcp.enabled) return;
    if (mcp.transport === "stdio" && !mcp.command.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["command"],
        message: `Informe o comando do servidor MCP "${mcp.id}".`,
      });
    }
    if (mcp.transport === "http" && !isValidHttpUrl(mcp.serverUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["serverUrl"],
        message: `Informe uma URL HTTP/HTTPS válida para o servidor MCP "${mcp.id}".`,
      });
    }
  });

export const commonMcpDraftSchema = z
  .object({
    id: slugSchema,
    transport: z.enum(["stdio", "http"]),
    command: z.string().max(200),
    args: z.array(z.string().max(300)).max(30),
    serverUrl: z.string().max(2000),
    enabled: z.boolean(),
  })
  .strict();

const antigravityModelEnum = z.enum(MODEL_IDS);
const antigravityToolEnum = z.enum(TOOL_NAMES);

export const antigravityTargetSchema = z
  .object({
    model: antigravityModelEnum,
    mainAgent: z.boolean(),
    subagent: z.boolean(),
    tools: z.array(antigravityToolEnum),
    commandExecutionPolicy: z.enum(["sandbox", "off", "auto", "eager"]),
  })
  .strict();

export const claudeCodeToolEnum = z.enum([
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep",
  "Bash",
  "WebFetch",
  "WebSearch",
  "Agent",
]);

export const claudeCodeModelEnum = z.enum([
  "inherit",
  "sonnet",
  "opus",
  "haiku",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-haiku-4-5",
]);

export const claudeCodeEffortEnum = z.enum([
  "inherit",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

export const claudeCodePermissionModeEnum = z.enum([
  "default",
  "acceptEdits",
  "auto",
  "dontAsk",
  "bypassPermissions",
  "plan",
]);

export const claudeCodeTargetSchema = z
  .object({
    exposure: z.enum(["main", "subagent", "both"]),
    model: claudeCodeModelEnum,
    effort: claudeCodeEffortEnum,
    tools: z.array(claudeCodeToolEnum),
    disallowedTools: z.array(claudeCodeToolEnum),
    permissionMode: claudeCodePermissionModeEnum,
    isolation: z.enum(["none", "worktree"]),
    includeClaudeMd: z.boolean(),
    referenceAgentsMd: z.boolean(),
    disableModelInvocationSkills: z.array(slugSchema).max(30),
  })
  .strict();

export const codexModelEnum = z.enum([
  "inherit",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "gpt-5-codex",
]);

export const codexReasoningEffortEnum = z.enum([
  "inherit",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

export const codexTargetSchema = z
  .object({
    exposure: z.enum(["root", "subagent", "both"]),
    model: codexModelEnum,
    reasoningEffort: codexReasoningEffortEnum,
    shellTool: z.enum(["inherit", "disabled"]),
    includeAgentsMd: z.boolean(),
  })
  .strict();

export const chatGptPluginTargetSchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "Use versão SemVer (ex.: 1.0.0).").max(32),
  })
  .strict();

const commonAgentObject = {
  id: z.string().uuid(),
  name: z.string().min(1, "Informe o nome do agente.").max(100),
  slug: slugSchema,
  description: z.string().min(1, "Informe a descrição do agente.").max(2000),
  specialty: z.string().max(300),
  goal: z.string().min(1, "Informe o objetivo principal.").max(2000),
  instructions: z.string().max(12000),
  capabilityIntents: z.array(capabilityIntentSchema).max(10),
  rules: z.array(commonRuleSchema).max(30),
  skills: z.array(commonSkillSchema).max(30),
  mcpServers: z.array(commonMcpSchema).max(20),
  tags: z.array(z.string().max(32)).max(10),
  updatedAt: z.string().max(64),
};

const commonAgentDraftObject = {
  id: z.string().uuid(),
  name: z.string().max(100),
  slug: z.string().max(64),
  description: z.string().max(2000),
  specialty: z.string().max(300),
  goal: z.string().max(2000),
  instructions: z.string().max(12000),
  capabilityIntents: z.array(capabilityIntentSchema).max(10),
  rules: z.array(commonRuleDraftSchema).max(30),
  skills: z.array(commonSkillDraftSchema).max(30),
  mcpServers: z.array(commonMcpDraftSchema).max(20),
  tags: z.array(z.string().max(32)).max(10),
  updatedAt: z.string().max(64),
};

const targetsMapSchema = z
  .object({
    antigravity: antigravityTargetSchema.optional(),
    claudeCode: claudeCodeTargetSchema.optional(),
    codex: codexTargetSchema.optional(),
    chatgptPlugin: chatGptPluginTargetSchema.optional(),
  })
  .strict();

export const packDraftSchema = z
  .object({
    schemaVersion: z.literal(2),
    target: targetPlatformSchema,
    common: z.object(commonAgentDraftObject).strict(),
    targets: targetsMapSchema,
  })
  .strict();

export const packSchema = z
  .object({
    schemaVersion: z.literal(2),
    target: targetPlatformSchema,
    common: z.object(commonAgentObject).strict(),
    targets: targetsMapSchema,
  })
  .strict()
  .superRefine((pack, ctx) => {
    const checkUnique = (items: { id: string }[], label: string, field: string) => {
      const seen = new Set<string>();
      for (const item of items) {
        if (seen.has(item.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["common", field],
            message: `ID duplicado em ${label}: "${item.id}".`,
          });
        }
        seen.add(item.id);
      }
    };
    checkUnique(pack.common.rules, "regras", "rules");
    checkUnique(pack.common.skills, "skills", "skills");
    checkUnique(pack.common.mcpServers, "servidores MCP", "mcpServers");

    if (pack.target === "antigravity") {
      const ag = pack.targets.antigravity;
      if (!ag) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targets", "antigravity"],
          message: "Configuração Antigravity ausente.",
        });
      } else if (!ag.mainAgent && !ag.subagent) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targets", "antigravity"],
          message: "Selecione ao menos um papel: agente principal ou subagente.",
        });
      }
    }

    if (pack.target === "claude-code") {
      const cc = pack.targets.claudeCode;
      if (!cc) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targets", "claudeCode"],
          message: "Configuração Claude Code ausente.",
        });
      } else {
        const disallowedSet = new Set(cc.disallowedTools);
        const overlap = cc.tools.filter((t) => disallowedSet.has(t));
        if (overlap.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["targets", "claudeCode", "disallowedTools"],
            message: `Ferramenta(s) em conflito entre permitidas e bloqueadas: ${overlap.join(", ")}.`,
          });
        }
      }
    }

    if (pack.target === "codex" && !pack.targets.codex) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targets", "codex"],
        message: "Configuração Codex ausente.",
      });
    }

    if (pack.target === "chatgpt-plugin") {
      if (!pack.targets.chatgptPlugin) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targets", "chatgptPlugin"],
          message: "Configuração do plugin ChatGPT ausente.",
        });
      }
      for (const mcp of pack.common.mcpServers) {
        if (mcp.enabled && mcp.transport === "stdio") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["common", "mcpServers"],
            message: `Servidor MCP stdio local "${mcp.id}" não funciona no ChatGPT Web; mude para Streamable HTTP ou desative-o.`,
          });
        }
      }
    }
  });

export const backupV2Schema = z
  .object({
    format: z.literal("agex"),
    version: z.literal(2),
    agents: z.array(packDraftSchema).max(100),
  })
  .strict();

export function validatePackSchema(pack: AgentPackV2): {
  valid: boolean;
  errors: string[];
} {
  const result = packSchema.safeParse(pack);
  return result.success
    ? { valid: true, errors: [] }
    : { valid: false, errors: result.error.issues.map((i) => i.message) };
}

