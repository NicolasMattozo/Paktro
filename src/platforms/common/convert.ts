import type {
  AgentConfig,
  AgentPackV2,
  AgentTargetsMap,
  AntigravityTargetConfig,
  CapabilityIntent,
  ChatGptPluginTargetConfig,
  ClaudeCodeTargetConfig,
  ClaudeCodeToolName,
  CodexTargetConfig,
  CommonAgentPack,
  Rule,
  TargetPlatform,
} from "../../types";
import { TOOL_NAMES, type ToolName } from "../../templates/tools";
import { MODEL_IDS, type ModelId } from "../../templates/models";
import {
  activationToLegacyTrigger,
  legacyTriggerToActivation,
} from "./instructions";

export function inferIntentsFromAntigravityTools(
  tools: ToolName[],
  hasMcp = false,
): CapabilityIntent[] {
  const intents = new Set<CapabilityIntent>();
  if (tools.includes("view_file") || tools.includes("list_dir")) {
    intents.add("read-files");
  }
  if (tools.includes("find_by_name") || tools.includes("grep_search")) {
    intents.add("search-files");
  }
  if (
    tools.includes("write_to_file") ||
    tools.includes("replace_file_content") ||
    tools.includes("multi_replace_file_content")
  ) {
    intents.add("edit-files");
  }
  if (tools.includes("run_command")) {
    intents.add("run-commands");
  }
  if (tools.includes("search_web") || tools.includes("read_url_content")) {
    intents.add("use-web");
  }
  if (hasMcp) {
    intents.add("use-mcp");
  }
  return [...intents];
}

export function inferIntentsFromClaudeTools(
  tools: ClaudeCodeToolName[],
  hasMcp = false,
): CapabilityIntent[] {
  const intents = new Set<CapabilityIntent>();
  if (tools.includes("Read")) intents.add("read-files");
  if (tools.includes("Glob") || tools.includes("Grep")) {
    intents.add("search-files");
  }
  if (tools.includes("Edit") || tools.includes("Write")) {
    intents.add("edit-files");
  }
  if (tools.includes("Bash")) intents.add("run-commands");
  if (tools.includes("WebFetch") || tools.includes("WebSearch")) {
    intents.add("use-web");
  }
  if (tools.includes("Agent")) intents.add("delegate");
  if (hasMcp) intents.add("use-mcp");
  return [...intents];
}

export function intentsToAntigravityTools(
  intents: CapabilityIntent[],
): ToolName[] {
  const out = new Set<ToolName>();
  for (const intent of intents) {
    switch (intent) {
      case "read-files":
        out.add("view_file");
        out.add("list_dir");
        break;
      case "search-files":
        out.add("find_by_name");
        out.add("grep_search");
        break;
      case "edit-files":
        out.add("write_to_file");
        out.add("replace_file_content");
        out.add("multi_replace_file_content");
        break;
      case "run-commands":
        out.add("run_command");
        break;
      case "use-web":
        out.add("search_web");
        out.add("read_url_content");
        break;
      default:
        break;
    }
  }
  return TOOL_NAMES.filter((t) => out.has(t));
}

export function intentsToClaudeTools(
  intents: CapabilityIntent[],
): ClaudeCodeToolName[] {
  const order: ClaudeCodeToolName[] = [
    "Read",
    "Glob",
    "Grep",
    "Edit",
    "Write",
    "Bash",
    "WebFetch",
    "WebSearch",
    "Agent",
  ];
  const out = new Set<ClaudeCodeToolName>();
  for (const intent of intents) {
    switch (intent) {
      case "read-files":
        out.add("Read");
        break;
      case "search-files":
        out.add("Glob");
        out.add("Grep");
        break;
      case "edit-files":
        out.add("Edit");
        out.add("Write");
        break;
      case "run-commands":
        out.add("Bash");
        break;
      case "use-web":
        out.add("WebFetch");
        out.add("WebSearch");
        break;
      case "delegate":
        out.add("Agent");
        break;
      default:
        break;
    }
  }
  return order.filter((t) => out.has(t));
}

export function defaultAntigravityTarget(
  intents: CapabilityIntent[] = ["read-files", "search-files"],
): AntigravityTargetConfig {
  const tools = intentsToAntigravityTools(intents);
  return {
    model: "inherit",
    mainAgent: true,
    subagent: true,
    tools: tools.length ? tools : ["view_file", "list_dir", "find_by_name", "grep_search"],
    commandExecutionPolicy: "sandbox",
  };
}

export function defaultClaudeCodeTarget(
  intents: CapabilityIntent[] = ["read-files", "search-files"],
): ClaudeCodeTargetConfig {
  const tools = intentsToClaudeTools(intents);
  return {
    exposure: "both",
    model: "inherit",
    effort: "inherit",
    tools: tools.length ? tools : ["Read", "Glob", "Grep"],
    disallowedTools: [],
    permissionMode: "default",
    isolation: "none",
    includeClaudeMd: false,
    referenceAgentsMd: false,
    disableModelInvocationSkills: [],
  };
}

export function defaultCodexTarget(): CodexTargetConfig {
  return {
    exposure: "both",
    model: "inherit",
    reasoningEffort: "inherit",
    shellTool: "inherit",
    includeAgentsMd: true,
  };
}

export function defaultChatGptPluginTarget(): ChatGptPluginTargetConfig {
  return {
    version: "1.0.0",
  };
}

export function migrateV1ToV2(v1: AgentConfig): AgentPackV2 {
  const validModel = (MODEL_IDS as readonly string[]).includes(v1.model)
    ? v1.model
    : ("inherit" as ModelId);
  const common: CommonAgentPack = {
    id: v1.id,
    name: v1.name,
    slug: v1.slug,
    description: v1.description,
    specialty: v1.specialty,
    goal: v1.goal,
    instructions: v1.instructions,
    capabilityIntents: inferIntentsFromAntigravityTools(
      v1.tools,
      v1.mcpServers.some((m) => m.enabled),
    ),
    rules: v1.rules.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      content: r.content,
      activation: legacyTriggerToActivation(r.trigger, r.globs, r.description),
      enabled: r.enabled,
    })),
    skills: v1.skills.map((s) => ({ ...s })),
    mcpServers: v1.mcpServers.map((m) => ({
      ...m,
      args: [...m.args],
    })),
    tags: [...v1.tags],
    updatedAt: v1.updatedAt,
  };

  return {
    schemaVersion: 2,
    target: "antigravity",
    common,
    targets: {
      antigravity: {
        model: validModel,
        mainAgent: v1.mainAgent,
        subagent: v1.subagent,
        tools: [...v1.tools],
        commandExecutionPolicy: v1.commandExecutionPolicy,
      },
    },
  };
}

export function isAgentPackV2(value: unknown): value is AgentPackV2 {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as { schemaVersion?: unknown }).schemaVersion === 2 &&
    typeof (value as { target?: unknown }).target === "string" &&
    typeof (value as { common?: unknown }).common === "object"
  );
}

export function ensureAgentPackV2(value: AgentPackV2 | AgentConfig): AgentPackV2 {
  return isAgentPackV2(value) ? value : migrateV1ToV2(value);
}

export function packToLegacyAntigravity(pack: AgentPackV2): AgentConfig {
  const ag = pack.targets.antigravity ?? defaultAntigravityTarget(pack.common.capabilityIntents);
  const rules: Rule[] = pack.common.rules.map((r) => {
    const legacy = activationToLegacyTrigger(r.activation);
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      content: r.content,
      trigger: legacy.trigger,
      globs: legacy.globs,
      enabled: r.enabled,
    };
  });
  return {
    id: pack.common.id,
    name: pack.common.name,
    slug: pack.common.slug,
    description: pack.common.description,
    specialty: pack.common.specialty,
    goal: pack.common.goal,
    instructions: pack.common.instructions,
    model: ag.model,
    mainAgent: ag.mainAgent,
    subagent: ag.subagent,
    tools: [...ag.tools],
    commandExecutionPolicy: ag.commandExecutionPolicy,
    rules,
    skills: pack.common.skills.map((s) => ({ ...s })),
    mcpServers: pack.common.mcpServers.map((m) => ({
      ...m,
      args: [...m.args],
    })),
    tags: [...pack.common.tags],
    updatedAt: pack.common.updatedAt,
  };
}

export function ensureTargetConfig(
  pack: AgentPackV2,
  target: TargetPlatform,
): AgentTargetsMap {
  const nextTargets: AgentTargetsMap = { ...pack.targets };
  if (target === "antigravity" && !nextTargets.antigravity) {
    nextTargets.antigravity = defaultAntigravityTarget(pack.common.capabilityIntents);
  }
  if (target === "claude-code" && !nextTargets.claudeCode) {
    nextTargets.claudeCode = defaultClaudeCodeTarget(pack.common.capabilityIntents);
  }
  if (target === "codex" && !nextTargets.codex) {
    nextTargets.codex = defaultCodexTarget();
  }
  if (target === "chatgpt-plugin" && !nextTargets.chatgptPlugin) {
    nextTargets.chatgptPlugin = defaultChatGptPluginTarget();
  }
  return nextTargets;
}

export function convertPackTarget(
  pack: AgentPackV2,
  nextTarget: TargetPlatform,
): { pack: AgentPackV2; notes: string[]; losses: string[] } {
  if (pack.target === nextTarget) {
    return { pack, notes: [], losses: [] };
  }

  const notes: string[] = [];
  const losses: string[] = [];

  // Derive portable intents from the source target before switching
  let intents = [...pack.common.capabilityIntents];
  const hasMcp = pack.common.mcpServers.some((m) => m.enabled);
  if (pack.target === "antigravity" && pack.targets.antigravity) {
    intents = inferIntentsFromAntigravityTools(pack.targets.antigravity.tools, hasMcp);
  } else if (pack.target === "claude-code" && pack.targets.claudeCode) {
    intents = inferIntentsFromClaudeTools(pack.targets.claudeCode.tools, hasMcp);
  }

  const nextTargets: AgentTargetsMap = { ...pack.targets };

  if (nextTarget === "antigravity") {
    if (!nextTargets.antigravity) {
      nextTargets.antigravity = defaultAntigravityTarget(intents);
      notes.push("Ferramentas Antigravity preenchidas pelas capacidades equivalentes, com política inicial 'sandbox'.");
    }
    if (
      pack.target === "claude-code" &&
      pack.targets.claudeCode?.permissionMode === "bypassPermissions"
    ) {
      losses.push(
        "O modo 'bypassPermissions' do Claude Code não é promovido automaticamente para 'eager' no Antigravity; mantida a política segura 'sandbox'.",
      );
    }
    if (
      pack.target === "claude-code" &&
      pack.targets.claudeCode?.model &&
      pack.targets.claudeCode.model !== "inherit"
    ) {
      losses.push(
        `O modelo '${pack.targets.claudeCode.model}' do Claude Code não existe nativamente no YAML do Antigravity; modelo inicial definido como 'inherit'.`,
      );
    }
    if (
      pack.target === "codex" &&
      pack.targets.codex?.model &&
      pack.targets.codex.model !== "inherit"
    ) {
      losses.push(
        `O modelo '${pack.targets.codex.model}' do Codex não é usado diretamente no Antigravity; modelo inicial definido como 'inherit'.`,
      );
    }
  }

  if (nextTarget === "claude-code") {
    if (!nextTargets.claudeCode) {
      nextTargets.claudeCode = defaultClaudeCodeTarget(intents);
      notes.push("Ferramentas nativas do Claude Code sugeridas a partir das capacidades do agente.");
    }
    if (
      pack.target === "antigravity" &&
      pack.targets.antigravity?.commandExecutionPolicy === "eager"
    ) {
      losses.push(
        "A política 'eager' do Antigravity não é promovida automaticamente para 'bypassPermissions' no Claude Code; permissionMode foi iniciado como 'default'.",
      );
    }
    if (
      pack.target === "antigravity" &&
      pack.targets.antigravity?.model &&
      pack.targets.antigravity.model !== "inherit"
    ) {
      losses.push(
        `O modelo '${pack.targets.antigravity.model}' do Antigravity não é um ID de modelo do Claude Code; modelo inicial definido como 'inherit'.`,
      );
    }
    if (
      pack.common.rules.some(
        (r) => r.enabled && (r.activation.type === "automatic" || r.activation.type === "manual"),
      )
    ) {
      notes.push(
        "Regras com ativação automática/manual são geradas como skills sob demanda (.claude/skills/) para evitar aplicação incondicional em .claude/rules/.",
      );
    }
  }

  if (nextTarget === "codex") {
    if (!nextTargets.codex) {
      nextTargets.codex = defaultCodexTarget();
    }
    if (intents.length > 0) {
      losses.push(
        "Subagentes Codex (.codex/agents/*.toml) não usam lista granular de ferramentas por agente; as permissões vêm do sandbox/sessão principal.",
      );
    }
    if (pack.common.rules.some((r) => r.enabled && r.activation.type === "path")) {
      losses.push(
        "Regras por glob/caminho não viram AGENTS.override.md na raiz do Codex; elas são anotadas em AGENTS.md com o escopo sugerido.",
      );
    }
  }

  if (nextTarget === "chatgpt-plugin") {
    if (!nextTargets.chatgptPlugin) {
      nextTargets.chatgptPlugin = defaultChatGptPluginTarget();
    }
    if (pack.target !== "chatgpt-plugin") {
      losses.push(
        "Pacotes/plugins para ChatGPT não possuem papéis locais (mainAgent/subagent) nem seletor de modelo de IDE; as instruções viram skills em skills/<slug>/SKILL.md.",
      );
    }
    if (pack.common.mcpServers.some((m) => m.enabled && m.transport === "stdio")) {
      losses.push(
        "Há servidor(es) MCP 'stdio' local(is) ativo(s): o ChatGPT Web aceita apenas MCP remoto 'streamable-http' (HTTPS). Converta ou desative o stdio antes de exportar.",
      );
    }
  }

  return {
    pack: {
      schemaVersion: 2,
      target: nextTarget,
      common: {
        ...pack.common,
        capabilityIntents: intents,
      },
      targets: nextTargets,
    },
    notes,
    losses,
  };
}
