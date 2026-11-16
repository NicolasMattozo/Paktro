import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { validatePackSchema } from "../../schemas/pack";
import type {
  AgentPackV2,
  CodexTargetConfig,
  CommonMcpServer,
  CommonRule,
  CommonSkill,
  GeneratedFile,
} from "../../types";
import { defaultCodexTarget } from "../common/convert";
import { parseAgentBodySections, renderAgentBody } from "../common/frontmatter";
import { isInsecureHttpRemoteUrl } from "../common/mcp";
import { assertSafeRelativePath, SLUG_REGEX, slugify } from "../common/paths";
import { parseSkillMarkdown, renderSkillMarkdown } from "../common/skills";
import { MAPPING_VERSIONS, type MergePolicy, type PlatformAdapter } from "../types";

const CODEX_MODELS = [
  {
    id: "inherit",
    label: "Herdar da sessão Codex (padrão)",
    badge: "Padrão",
    group: "Sessão",
  },
  {
    id: "gpt-5.4",
    label: "GPT-5.4",
    badge: "Frontier",
    group: "OpenAI Codex",
  },
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    badge: "Rápido",
    group: "OpenAI Codex",
  },
  {
    id: "gpt-5.3-codex",
    label: "GPT-5.3 Codex",
    badge: "Código",
    group: "OpenAI Codex",
  },
  {
    id: "gpt-5-codex",
    label: "GPT-5 Codex",
    badge: "Código",
    group: "OpenAI Codex",
  },
];

function effectiveConfig(pack: AgentPackV2): CodexTargetConfig {
  return pack.targets.codex ?? defaultCodexTarget();
}

function renderAgentsMd(pack: AgentPackV2): string {
  const sections: string[] = [renderAgentBody(pack.common)];

  const alwaysRules = pack.common.rules.filter(
    (r) => r.enabled && r.activation.type === "always",
  );
  const pathRules = pack.common.rules.filter(
    (r) => r.enabled && r.activation.type === "path",
  );

  if (alwaysRules.length > 0 || pathRules.length > 0) {
    sections.push("## Regras do projeto");
    for (const r of alwaysRules) {
      sections.push(`### ${r.name}\n\n${r.content.trim()}`);
    }
    for (const r of pathRules) {
      const patterns =
        r.activation.type === "path" ? r.activation.patterns.join(", ") : "";
      sections.push(
        `### ${r.name}\n\n> Escopo sugerido de arquivos: \`${patterns}\`\n\n${r.content.trim()}`,
      );
    }
  }

  return `${sections.join("\n\n")}\n`;
}

function buildCodexSetupGuide(pack: AgentPackV2, cx: CodexTargetConfig): string {
  const lines = [
    `# Configuração no OpenAI Codex — ${pack.common.name}`,
    "",
    "## Estrutura gerada",
    "",
  ];
  if (cx.exposure === "root" || cx.exposure === "both" || cx.includeAgentsMd) {
    lines.push("- `AGENTS.md` — instruções e diretrizes do projeto (bloco gerenciado `<!-- AGEX:BEGIN -->`)");
  }
  if (cx.exposure === "subagent" || cx.exposure === "both") {
    lines.push(`- \`.codex/agents/${pack.common.slug}.toml\` — definição nativa do subagente Codex`);
  }
  lines.push("- `.agents/skills/<skill>/SKILL.md` — skills Agent Skills descobertas pelo Codex");
  if (pack.common.mcpServers.some((m) => m.enabled)) {
    lines.push("- `.codex/config.toml` — entradas `[mcp_servers.<id>]` mescladas estruturalmente via TOML");
  }
  lines.push(
    "",
    "## Permissões e sandbox",
    "",
    "- Subagentes no Codex herdam as políticas de sandbox e aprovação da sessão principal.",
    "- Não há lista de ferramentas individuais no `.toml` do subagente; use `shell_tool = false` em `[features]` apenas quando quiser desativar o shell naquele subagente.",
    "- Regras por caminho (`glob`) não geram `AGENTS.override.md` na raiz do projeto; para override por pasta específica no Codex, mova manualmente um `AGENTS.override.md` apenas para o subdiretório desejado.",
    "- Invoque skills explícitas no Codex com `$nome-da-skill`.",
  );
  return `${lines.join("\n")}\n`;
}

export const codexAdapter: PlatformAdapter = {
  id: "codex",
  mappingVersion: MAPPING_VERSIONS.codex,
  catalog: {
    id: "codex",
    name: "OpenAI Codex (Projeto / CLI)",
    shortName: "Codex",
    vendorGroup: "openai",
    summary:
      "Projeto Codex com AGENTS.md, .codex/agents/*.toml, .agents/skills/ e .codex/config.toml.",
    docsUrl: "https://developers.openai.com/codex/subagents",
    docsVerifiedAt: "2026-11-13",
    mappingVersion: MAPPING_VERSIONS.codex,
    supportsRoles: true,
    supportsModels: true,
    models: CODEX_MODELS,
    efforts: [
      { id: "inherit", label: "Padrão da sessão" },
      { id: "low", label: "Low" },
      { id: "medium", label: "Medium" },
      { id: "high", label: "High" },
      { id: "xhigh", label: "XHigh" },
      { id: "max", label: "Max" },
    ],
    tools: [],
    permissionModes: [
      {
        id: "inherit",
        label: "Herdar sandbox e aprovações da sessão (recomendado)",
        description: "Subagente herda a política ativa no Codex CLI / IDE.",
      },
      {
        id: "disabled",
        label: "Desabilitar shell_tool neste subagente",
        description: "Grava [features] shell_tool = false no .codex/agents/<slug>.toml.",
      },
    ],
    toolNotes:
      "O Codex controla permissões de edição, rede e terminal no nível da sessão/sandbox (config.toml ou flags do CLI), não por lista de ferramentas dentro do arquivo do subagente.",
  },
  validate(pack: AgentPackV2) {
    const base = validatePackSchema(pack);
    const errors = [...base.errors];
    const cx = effectiveConfig(pack);
    if (
      cx.exposure === "root" &&
      !cx.includeAgentsMd &&
      !pack.common.skills.some((s) => s.enabled) &&
      !pack.common.mcpServers.some((m) => m.enabled)
    ) {
      errors.push(
        "Com exposição apenas no projeto raiz, mantenha AGENTS.md habilitado ou ative skills/MCP.",
      );
    }
    return {
      valid: errors.length === 0,
      errors,
      warnings: this.warnings(pack),
      blockers: [],
    };
  },
  warnings(pack: AgentPackV2): string[] {
    const out: string[] = [];
    const cx = effectiveConfig(pack);
    if (cx.exposure === "subagent" || cx.exposure === "both") {
      out.push(
        "Subagentes Codex (.codex/agents/*.toml) herdam sandbox e aprovações da sessão principal.",
      );
    }
    for (const rule of pack.common.rules) {
      if (!rule.enabled) continue;
      if (rule.activation.type === "path") {
        out.push(
          `Regra por caminho "${rule.id}" não gera AGENTS.override.md; ela é documentada em AGENTS.md com os padrões sugeridos.`,
        );
      } else if (rule.activation.type === "automatic") {
        out.push(
          `Regra sob demanda "${rule.id}" foi gerada como skill em .agents/skills/${rule.id}/SKILL.md para descoberta por contexto no Codex.`,
        );
      } else if (rule.activation.type === "manual") {
        out.push(
          `Regra manual "${rule.id}" foi gerada em .agents/skills/${rule.id}/SKILL.md (invoque explicitamente com $${rule.id}).`,
        );
      }
    }
    for (const mcp of pack.common.mcpServers) {
      if (mcp.enabled && mcp.transport === "http" && isInsecureHttpRemoteUrl(mcp.serverUrl)) {
        out.push(`O servidor MCP "${mcp.id}" usa HTTP sem TLS; prefira HTTPS.`);
      }
    }
    return out;
  },
  generate(pack: AgentPackV2): GeneratedFile[] {
    const check = this.validate(pack);
    if (!check.valid) {
      throw new Error(check.errors[0]);
    }
    const cx = effectiveConfig(pack);
    const files: GeneratedFile[] = [];

    if (cx.exposure === "root" || cx.exposure === "both" || cx.includeAgentsMd) {
      assertSafeRelativePath("AGENTS.md");
      files.push({
        path: "AGENTS.md",
        kind: "agent",
        content: renderAgentsMd(pack),
      });
    }

    if (cx.exposure === "subagent" || cx.exposure === "both") {
      const subagentPath = `.codex/agents/${pack.common.slug}.toml`;
      assertSafeRelativePath(subagentPath);
      const tomlData: Record<string, unknown> = {
        name: pack.common.slug,
        description: pack.common.description,
        developer_instructions: renderAgentBody(pack.common),
      };
      if (cx.model !== "inherit") {
        tomlData.model = cx.model;
      }
      if (cx.reasoningEffort !== "inherit") {
        tomlData.model_reasoning_effort = cx.reasoningEffort;
      }
      if (cx.shellTool === "disabled") {
        tomlData.features = { shell_tool: false };
      }
      files.push({
        path: subagentPath,
        kind: "agent",
        content: `${stringifyToml(tomlData).trimEnd()}\n`,
      });
    }

    const usedSkillIds = new Set<string>();
    for (const skill of pack.common.skills.filter((s) => s.enabled)) {
      usedSkillIds.add(skill.id);
      const skillPath = `.agents/skills/${skill.id}/SKILL.md`;
      assertSafeRelativePath(skillPath);
      files.push({
        path: skillPath,
        kind: "skill",
        content: renderSkillMarkdown(skill),
      });
    }

    for (const rule of pack.common.rules.filter(
      (r) =>
        r.enabled &&
        (r.activation.type === "automatic" || r.activation.type === "manual"),
    )) {
      if (!usedSkillIds.has(rule.id)) {
        usedSkillIds.add(rule.id);
        const skillPath = `.agents/skills/${rule.id}/SKILL.md`;
        assertSafeRelativePath(skillPath);
        const desc =
          rule.activation.type === "automatic"
            ? rule.activation.description || rule.description || rule.name
            : rule.description || rule.name;
        files.push({
          path: skillPath,
          kind: "skill",
          content: renderSkillMarkdown({
            id: rule.id,
            name: rule.name,
            description: desc,
            content: `# ${rule.name}\n\n${rule.content.trim()}`,
            enabled: true,
          }),
        });
      }
    }

    const enabledMcp = pack.common.mcpServers.filter((m) => m.enabled);
    if (enabledMcp.length > 0) {
      const mcpServers: Record<string, unknown> = {};
      for (const m of enabledMcp) {
        mcpServers[m.id] =
          m.transport === "stdio"
            ? { command: m.command, args: [...m.args] }
            : { url: m.serverUrl, enabled: true };
      }
      assertSafeRelativePath(".codex/config.toml");
      files.push({
        path: ".codex/config.toml",
        kind: "mcp",
        content: `${stringifyToml({ mcp_servers: mcpServers }).trimEnd()}\n`,
      });
    }

    files.push({
      path: "AGEX-SETUP.md",
      kind: "guide",
      content: buildCodexSetupGuide(pack, cx),
    });

    return files;
  },
  importFiles(files) {
    const agentTomls = files.filter((f) =>
      /^\.codex\/agents\/[^/]+\.toml$/.test(f.path),
    );
    const hasConfigToml = files.some((f) => f.path === ".codex/config.toml");
    const hasAgentsMd = files.some((f) => f.path === "AGENTS.md");
    const codexSkills = files.filter((f) =>
      /^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(f.path),
    );
    const hasAntigravityAgents = files.some((f) =>
      /^\.agents\/agents\/[^/]+\.md$/.test(f.path),
    );

    // Avoid hijacking Antigravity packages when they contain .agents/agents/*.md
    if (hasAntigravityAgents) return null;
    if (agentTomls.length === 0 && !hasConfigToml && !hasAgentsMd) {
      return null;
    }

    const warnings: string[] = [];
    const skills: CommonSkill[] = [];
    for (const sf of codexSkills) {
      const id = sf.path.replace(/^\.agents\/skills\/|\/SKILL\.md$/g, "");
      skills.push(parseSkillMarkdown(id, sf.content).skill);
    }

    const mcpServers: CommonMcpServer[] = [];
    const configToml = files.find((f) => f.path === ".codex/config.toml");
    if (configToml) {
      const parsed = parseToml(configToml.content) as Record<string, unknown>;
      const servers = parsed.mcp_servers;
      if (servers && typeof servers === "object" && !Array.isArray(servers)) {
        for (const [rawId, rawCfg] of Object.entries(servers)) {
          if (
            rawId === "__proto__" ||
            rawId === "constructor" ||
            rawId === "prototype" ||
            !rawCfg ||
            typeof rawCfg !== "object" ||
            Array.isArray(rawCfg)
          ) {
            continue;
          }
          const cfg = rawCfg as Record<string, unknown>;
          if (
            cfg.env ||
            cfg.http_headers ||
            cfg.env_http_headers ||
            cfg.bearer_token_env_var
          ) {
            warnings.push(
              `Referências de credenciais em [mcp_servers.${rawId}] (.codex/config.toml) foram ignoradas no backup por segurança.`,
            );
          }
          const id = SLUG_REGEX.test(rawId) ? rawId : slugify(rawId);
          if (typeof cfg.command === "string") {
            mcpServers.push({
              id,
              transport: "stdio",
              command: cfg.command,
              args: Array.isArray(cfg.args) ? cfg.args.map(String) : [],
              serverUrl: "",
              enabled: cfg.enabled !== false,
            });
          } else if (typeof cfg.url === "string") {
            mcpServers.push({
              id,
              transport: "http",
              command: "",
              args: [],
              serverUrl: cfg.url,
              enabled: cfg.enabled !== false,
            });
          }
        }
      }
    }

    const validModelsSet = new Set(CODEX_MODELS.map((m) => m.id));
    const validEffortsSet = new Set([
      "inherit",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);

    const packs: AgentPackV2[] = [];
    if (agentTomls.length > 0) {
      for (const tf of agentTomls) {
        const parsed = parseToml(tf.content) as Record<string, unknown>;
        const rawName =
          typeof parsed.name === "string"
            ? parsed.name
            : tf.path.split("/").pop()!.replace(/\.toml$/, "");
        const slug = SLUG_REGEX.test(rawName) ? rawName : slugify(rawName);
        const description =
          typeof parsed.description === "string"
            ? parsed.description
            : "Subagente Codex importado.";
        const devInstructions =
          typeof parsed.developer_instructions === "string"
            ? parsed.developer_instructions
            : "";
        const sections = parseAgentBodySections(devInstructions);
        const rawModel = typeof parsed.model === "string" ? parsed.model : "inherit";
        const model = (validModelsSet.has(rawModel)
          ? rawModel
          : "inherit") as CodexTargetConfig["model"];
        if (typeof parsed.model === "string" && !validModelsSet.has(rawModel)) {
          warnings.push(`Modelo Codex "${rawModel}" ajustado para "inherit".`);
        }
        const rawEffort =
          typeof parsed.model_reasoning_effort === "string"
            ? parsed.model_reasoning_effort
            : "inherit";
        const reasoningEffort = (validEffortsSet.has(rawEffort)
          ? rawEffort
          : "inherit") as CodexTargetConfig["reasoningEffort"];
        const features =
          parsed.features && typeof parsed.features === "object" && !Array.isArray(parsed.features)
            ? (parsed.features as Record<string, unknown>)
            : {};
        const shellTool =
          features.shell_tool === false ? "disabled" : "inherit";

        packs.push({
          schemaVersion: 2,
          target: "codex",
          common: {
            id: crypto.randomUUID(),
            name: sections.name || slug,
            slug,
            description,
            specialty: sections.specialty,
            goal: sections.goal || description,
            instructions: sections.instructions,
            capabilityIntents: mcpServers.length > 0 ? ["use-mcp"] : [],
            rules: [],
            skills,
            mcpServers,
            tags: ["codex"],
            updatedAt: new Date().toISOString(),
          },
          targets: {
            codex: {
              exposure: hasAgentsMd ? "both" : "subagent",
              model,
              reasoningEffort,
              shellTool,
              includeAgentsMd: hasAgentsMd,
            },
          },
        });
      }
    } else {
      const agentsMd = files.find((f) => f.path === "AGENTS.md");
      const sections = agentsMd
        ? parseAgentBodySections(agentsMd.content)
        : { name: "Agente Codex", specialty: "", goal: "", instructions: "" };
      const rules: CommonRule[] = [];
      if (hasAgentsMd && agentsMd) {
        rules.push({
          id: "agents-md",
          name: "Instruções AGENTS.md",
          description: "Conteúdo importado de AGENTS.md.",
          content: sections.instructions || agentsMd.content.trim(),
          activation: { type: "always" },
          enabled: true,
        });
      }
      packs.push({
        schemaVersion: 2,
        target: "codex",
        common: {
          id: crypto.randomUUID(),
          name: sections.name || "Projeto Codex",
          slug: slugify(sections.name || "codex-agent"),
          description: "Configuração importada de projeto Codex.",
          specialty: sections.specialty,
          goal: sections.goal || "Executar tarefas no projeto seguindo AGENTS.md.",
          instructions: sections.instructions,
          capabilityIntents: mcpServers.length > 0 ? ["use-mcp"] : [],
          rules,
          skills,
          mcpServers,
          tags: ["codex"],
          updatedAt: new Date().toISOString(),
        },
        targets: {
          codex: {
            ...defaultCodexTarget(),
            exposure: "root",
            includeAgentsMd: true,
          },
        },
      });
    }

    return {
      packs,
      detectedTarget:
        agentTomls.length > 0 || hasConfigToml ? "codex" : "ambiguous",
      candidateTargets:
        agentTomls.length > 0 || hasConfigToml
          ? undefined
          : ["codex", "claude-code", "antigravity"],
      warnings,
    };
  },
  mergePolicy(relativePath: string): MergePolicy {
    if (relativePath === ".codex/config.toml") return "toml-merge";
    if (relativePath === "AGENTS.md") return "managed-markdown";
    return "replace-owned";
  },
  setupGuide(pack: AgentPackV2): string {
    return buildCodexSetupGuide(pack, effectiveConfig(pack));
  },
  approvalSignaturePayload(pack: AgentPackV2) {
    return {
      schemaVersion: pack.schemaVersion,
      target: pack.target,
      mappingVersion: this.mappingVersion,
      common: { ...pack.common, updatedAt: "" },
      targetConfig: pack.targets.codex,
      files: this.generate(pack),
    };
  },
};

