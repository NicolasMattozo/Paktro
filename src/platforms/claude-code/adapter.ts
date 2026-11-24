import { validatePackSchema } from "../../schemas/pack";
import type {
  AgentPackV2,
  ClaudeCodeMemoryScope,
  ClaudeCodeTargetConfig,
  ClaudeCodeToolName,
  CommonMcpServer,
  CommonRule,
  CommonSkill,
  GeneratedFile,
} from "../../types";
import {
  defaultClaudeCodeTarget,
  inferIntentsFromClaudeTools,
} from "../common/convert";
import {
  parseAgentBodySections,
  parseFrontmatterMarkdown,
  renderAgentBody,
  renderFrontmatterMarkdown,
} from "../common/frontmatter";
import { isInsecureHttpRemoteUrl } from "../common/mcp";
import { assertSafeRelativePath, parsePatterns, SLUG_REGEX, slugify } from "../common/paths";
import { parseSkillMarkdown, renderSkillMarkdown } from "../common/skills";
import { MAPPING_VERSIONS, type MergePolicy, type PlatformAdapter } from "../types";

export const CLAUDE_CODE_TOOL_NAMES: readonly ClaudeCodeToolName[] = [
  "Read",
  "Glob",
  "Grep",
  "LSP",
  "Edit",
  "Write",
  "NotebookEdit",
  "Bash",
  "PowerShell",
  "Monitor",
  "WebFetch",
  "WebSearch",
  "Agent",
  "Skill",
  "ToolSearch",
  "SendMessage",
  "TaskStop",
  "TodoWrite",
] as const;

export const CLAUDE_CODE_TOOLS = [
  {
    id: "Read",
    name: "Ler arquivos (Read)",
    description: "Lê arquivos, imagens e trechos do workspace.",
    group: "files",
    capabilityIntent: "read-files" as const,
  },
  {
    id: "Edit",
    name: "Editar trechos (Edit)",
    description: "Faz edições localizadas por correspondência exata em arquivos.",
    group: "files",
    capabilityIntent: "edit-files" as const,
  },
  {
    id: "Write",
    name: "Criar/sobrescrever arquivo (Write)",
    description: "Cria novos arquivos ou grava conteúdo completo em UTF-8.",
    group: "files",
    capabilityIntent: "edit-files" as const,
  },
  {
    id: "NotebookEdit",
    name: "Editar Jupyter Notebook (NotebookEdit)",
    description: "Modifica células de cadernos Jupyter (.ipynb).",
    group: "files",
    capabilityIntent: "edit-files" as const,
  },
  {
    id: "Glob",
    name: "Buscar por padrão (Glob)",
    description: "Localiza arquivos por padrão de caminho.",
    group: "search",
    capabilityIntent: "search-files" as const,
  },
  {
    id: "Grep",
    name: "Buscar conteúdo (Grep)",
    description: "Pesquisa texto ou regex no código.",
    group: "search",
    capabilityIntent: "search-files" as const,
  },
  {
    id: "LSP",
    name: "Inteligência de linguagem (LSP)",
    description: "Ir para definição, referências e diagnósticos via Language Server.",
    group: "search",
    capabilityIntent: "search-files" as const,
  },
  {
    id: "Bash",
    name: "Executar terminal (Bash)",
    description: "Executa comandos de shell no ambiente do Claude Code.",
    group: "commands",
    capabilityIntent: "run-commands" as const,
  },
  {
    id: "PowerShell",
    name: "Executar PowerShell (PowerShell)",
    description: "Executa comandos nativos no PowerShell quando disponível.",
    group: "commands",
    capabilityIntent: "run-commands" as const,
  },
  {
    id: "Monitor",
    name: "Monitorar processo/stream (Monitor)",
    description: "Acompanha logs ou eventos contínuos em segundo plano.",
    group: "commands",
    capabilityIntent: "run-commands" as const,
  },
  {
    id: "WebFetch",
    name: "Baixar URL (WebFetch)",
    description: "Busca conteúdo de URLs permitidas.",
    group: "web",
    capabilityIntent: "use-web" as const,
  },
  {
    id: "WebSearch",
    name: "Pesquisar na web (WebSearch)",
    description: "Executa buscas na web quando habilitado na sessão.",
    group: "web",
    capabilityIntent: "use-web" as const,
  },
  {
    id: "Agent",
    name: "Delegar subagentes (Agent)",
    description: "Permite invocar subagentes definidos em .claude/agents/.",
    group: "orchestration",
    capabilityIntent: "delegate" as const,
  },
  {
    id: "Skill",
    name: "Invocar skill (Skill)",
    description: "Executa skills sob demanda durante a tarefa.",
    group: "orchestration",
  },
  {
    id: "ToolSearch",
    name: "Buscar ferramentas MCP diferidas (ToolSearch)",
    description: "Descobre e carrega schemas de ferramentas MCP sob demanda.",
    group: "orchestration",
    capabilityIntent: "use-mcp" as const,
  },
  {
    id: "SendMessage",
    name: "Enviar mensagem entre agentes (SendMessage)",
    description: "Comunica com teammates, subagentes retomados ou sessões.",
    group: "orchestration",
  },
  {
    id: "TaskStop",
    name: "Encerrar tarefa em background (TaskStop)",
    description: "Interrompe comandos ou agentes em execução por ID.",
    group: "orchestration",
  },
  {
    id: "TodoWrite",
    name: "Checklist de tarefas (TodoWrite)",
    description: "Atualiza lista de acompanhamento quando habilitada na sessão.",
    group: "orchestration",
  },
];

function effectiveConfig(pack: AgentPackV2): ClaudeCodeTargetConfig {
  return pack.targets.claudeCode ?? defaultClaudeCodeTarget(pack.common.capabilityIntents);
}

function buildClaudeSetupGuide(pack: AgentPackV2, cc: ClaudeCodeTargetConfig): string {
  const lines = [
    `# Configuração no Claude Code — ${pack.common.name}`,
    "",
    "## Onde os arquivos ficam",
    "",
  ];
  if (cc.exposure === "subagent" || cc.exposure === "both") {
    lines.push(`- Subagente: \`.claude/agents/${pack.common.slug}.md\``);
  }
  lines.push("- Regras por projeto/caminho: `.claude/rules/<regra>.md`");
  lines.push("- Skills e comandos sob demanda: `.claude/skills/<skill>/SKILL.md`");
  if (pack.common.mcpServers.some((m) => m.enabled)) {
    lines.push("- MCP de projeto: `.mcp.json` (mesclagem não destrutiva de `mcpServers`)");
  }
  if (cc.includeClaudeMd) {
    lines.push("- Instruções principais: `CLAUDE.md` (via bloco gerenciado `<!-- PAKTRO:BEGIN -->`)");
  } else {
    lines.push(
      "- Nota sobre `AGENTS.md`: no Claude Code v2.1.277+, se não houver `CLAUDE.md`, um `AGENTS.md` existente já é lido automaticamente.",
    );
  }
  lines.push(
    "",
    "## Como ativar no terminal",
    "",
    "```bash",
  );
  if (cc.exposure === "subagent" || cc.exposure === "both") {
    lines.push(`claude --agent ${pack.common.slug}`);
  } else {
    lines.push("claude");
  }
  lines.push(
    "```",
    "",
    "## Observações de segurança e permissões",
    "",
    `- \`permissionMode\` configurado: \`${cc.permissionMode}\`.`,
  );
  if (cc.permissionMode === "bypassPermissions") {
    lines.push(
      "- **Atenção**: `bypassPermissions` pula prompts de aprovação; use apenas em ambientes estritamente isolados.",
    );
  }
  lines.push(
    "- Regras com ativação automática ou manual são geradas como skills em `.claude/skills/`, pois `.claude/rules/` sem `paths:` sempre carrega na sessão inteira.",
    "- Credenciais nunca são gravadas no `paktro.json`; configure tokens e variáveis de ambiente fora dos arquivos versionados.",
  );
  return `${lines.join("\n")}\n`;
}

export const claudeCodeAdapter: PlatformAdapter = {
  id: "claude-code",
  mappingVersion: MAPPING_VERSIONS["claude-code"],
  catalog: {
    id: "claude-code",
    name: "Claude Code",
    shortName: "Claude Code",
    vendorGroup: "anthropic",
    summary:
      "Pacotes nativos com .claude/agents/*.md, .claude/rules/, .claude/skills/ e .mcp.json.",
    docsUrl: "https://code.claude.com/docs/en/sub-agents",
    docsVerifiedAt: "2026-11-24",
    mappingVersion: MAPPING_VERSIONS["claude-code"],
    supportsRoles: true,
    supportsModels: true,
    models: [
      {
        id: "inherit",
        label: "Herdar da sessão (inherit)",
        badge: "Padrão",
        group: "Aliases oficiais",
      },
      {
        id: "sonnet",
        label: "Sonnet (alias oficial)",
        badge: "Alias → 5.5",
        group: "Aliases oficiais",
      },
      {
        id: "opus",
        label: "Opus (alias oficial)",
        badge: "Alias → 5.5",
        group: "Aliases oficiais",
      },
      {
        id: "haiku",
        label: "Haiku (alias oficial)",
        badge: "Alias → 5.5",
        group: "Aliases oficiais",
      },
      {
        id: "fable",
        label: "Fable (alias oficial)",
        badge: "Alias → 5.2",
        group: "Aliases oficiais",
      },
      {
        id: "claude-sonnet-5-5",
        label: "Claude Sonnet 5.5",
        badge: "ID completo",
        group: "Modelos diretos (atuais)",
      },
      {
        id: "claude-opus-5-5",
        label: "Claude Opus 5.5",
        badge: "ID completo",
        group: "Modelos diretos (atuais)",
      },
      {
        id: "claude-haiku-5-5",
        label: "Claude Haiku 5.5",
        badge: "ID completo",
        group: "Modelos diretos (atuais)",
      },
      {
        id: "claude-fable-5-2",
        label: "Claude Fable 5.2",
        badge: "ID completo",
        group: "Modelos diretos (atuais)",
      },
      {
        id: "claude-sonnet-4-6",
        label: "Claude Sonnet 4.6",
        badge: "4.x / Cloud",
        group: "Versões anteriores / provedores",
      },
      {
        id: "claude-opus-4-6",
        label: "Claude Opus 4.6",
        badge: "4.x / Cloud",
        group: "Versões anteriores / provedores",
      },
      {
        id: "claude-haiku-4-5",
        label: "Claude Haiku 4.5",
        badge: "4.x / Cloud",
        group: "Versões anteriores / provedores",
      },
    ],
    efforts: [
      { id: "inherit", label: "Padrão do modelo" },
      { id: "low", label: "Low" },
      { id: "medium", label: "Medium" },
      { id: "high", label: "High" },
      { id: "xhigh", label: "XHigh" },
      { id: "max", label: "Max" },
    ],
    tools: CLAUDE_CODE_TOOLS,
    permissionModes: [
      {
        id: "default",
        label: "default — pedir permissão padrão",
        description: "Mantém os prompts normais de permissão do Claude Code.",
      },
      {
        id: "acceptEdits",
        label: "acceptEdits — aceitar edições de arquivo",
        description: "Aprova edições locais automaticamente mantendo controle sobre comandos.",
      },
      {
        id: "auto",
        label: "auto — classificador automático",
        description: "Usa a verificação automática de segurança da sessão.",
      },
      {
        id: "dontAsk",
        label: "dontAsk — recusar ações sem permissão prévia",
        description: "Não interrompe com prompts e nega ações fora das regras permitidas.",
      },
      {
        id: "plan",
        label: "plan — somente planejamento/leitura",
        description: "Ideal para análise e planos antes de editar código.",
      },
      {
        id: "bypassPermissions",
        label: "bypassPermissions — pular checagens (alto risco)",
        description: "Pula prompts de permissão; use somente em containers ou sandboxes descartáveis.",
        highRisk: true,
      },
    ],
    toolNotes:
      "Ferramentas nativas de subagentes Claude Code (Read, Edit, Write, NotebookEdit, Glob, Grep, LSP, Bash, PowerShell, Monitor, WebFetch, WebSearch, Agent, Skill, ToolSearch, SendMessage, TaskStop, TodoWrite). Omitir tools herda todas as ferramentas disponíveis.",
  },
  validate(pack: AgentPackV2) {
    const base = validatePackSchema(pack);
    const errors = [...base.errors];
    const cc = effectiveConfig(pack);
    if (
      cc.exposure === "main" &&
      !cc.includeClaudeMd &&
      !pack.common.rules.some((r) => r.enabled) &&
      !pack.common.skills.some((s) => s.enabled)
    ) {
      errors.push(
        "Com exposição apenas como agente principal e sem CLAUDE.md, ative ao menos uma regra, skill ou marque 'Gerar CLAUDE.md'.",
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
    const cc = effectiveConfig(pack);
    if (cc.permissionMode === "bypassPermissions") {
      out.push(
        "permissionMode: bypassPermissions pula aprovações no Claude Code. Use apenas em ambientes totalmente isolados.",
      );
    }
    if (
      (cc.exposure === "subagent" || cc.exposure === "both") &&
      cc.tools.length === 0
    ) {
      out.push(
        "Nenhuma ferramenta específica marcada em tools: no Claude Code, omitir tools faz o subagente herdar todas as ferramentas disponíveis (exceto disallowedTools).",
      );
    }
    if (cc.model === "fable" || cc.model === "claude-fable-5-2") {
      out.push(
        "Modelos Fable podem consumir créditos extras de uso (usage credits) conforme o plano da sua conta no Claude Code.",
      );
    }
    if (cc.tools.includes("Bash") && cc.permissionMode === "plan") {
      out.push(
        "A ferramenta Bash está listada junto com permissionMode 'plan'; o modo plano restringe execução na sessão.",
      );
    }
    for (const rule of pack.common.rules) {
      if (!rule.enabled) continue;
      if (rule.activation.type === "automatic") {
        out.push(
          `Regra sob demanda "${rule.id}" foi gerada em .claude/skills/${rule.id}/SKILL.md para evitar carregamento incondicional em .claude/rules/.`,
        );
      }
      if (rule.activation.type === "manual") {
        out.push(
          `Regra manual "${rule.id}" foi gerada em .claude/skills/${rule.id}/SKILL.md com disable-model-invocation: true (use /${rule.id}).`,
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
    const cc = effectiveConfig(pack);
    const files: GeneratedFile[] = [];
    const skillIds = new Set<string>();

    const activeSkills = pack.common.skills.filter((s) => s.enabled);
    for (const skill of activeSkills) {
      skillIds.add(skill.id);
      const skillPath = `.claude/skills/${skill.id}/SKILL.md`;
      assertSafeRelativePath(skillPath);
      const disableAuto = cc.disableModelInvocationSkills.includes(skill.id);
      files.push({
        path: skillPath,
        kind: "skill",
        content: renderSkillMarkdown(
          skill,
          disableAuto ? { "disable-model-invocation": true } : undefined,
        ),
      });
    }

    for (const rule of pack.common.rules.filter((r) => r.enabled)) {
      if (rule.activation.type === "always") {
        const rulePath = `.claude/rules/${rule.id}.md`;
        assertSafeRelativePath(rulePath);
        files.push({
          path: rulePath,
          kind: "rule",
          content: `# ${rule.name}\n\n${rule.content.trim()}\n`,
        });
      } else if (rule.activation.type === "path") {
        const rulePath = `.claude/rules/${rule.id}.md`;
        assertSafeRelativePath(rulePath);
        files.push({
          path: rulePath,
          kind: "rule",
          content: renderFrontmatterMarkdown(
            { paths: rule.activation.patterns },
            `# ${rule.name}\n\n${rule.content.trim()}`,
          ),
        });
      } else {
        // Automatic and manual rules become skills rather than unconditional .claude/rules/
        if (!skillIds.has(rule.id)) {
          skillIds.add(rule.id);
          const skillPath = `.claude/skills/${rule.id}/SKILL.md`;
          assertSafeRelativePath(skillPath);
          const desc =
            rule.activation.type === "automatic"
              ? rule.activation.description || rule.description || rule.name
              : rule.description || rule.name;
          files.push({
            path: skillPath,
            kind: "skill",
            content: renderSkillMarkdown(
              {
                id: rule.id,
                name: rule.name,
                description: desc,
                content: `# ${rule.name}\n\n${rule.content.trim()}`,
                enabled: true,
              },
              rule.activation.type === "manual"
                ? { "disable-model-invocation": true }
                : undefined,
            ),
          });
        }
      }
    }

    if (cc.exposure === "subagent" || cc.exposure === "both") {
      const agentPath = `.claude/agents/${pack.common.slug}.md`;
      assertSafeRelativePath(agentPath);
      const frontmatter: Record<string, unknown> = {
        name: pack.common.slug,
        description: pack.common.description,
      };
      if (cc.tools.length > 0) {
        frontmatter.tools = [...cc.tools];
      }
      if (cc.disallowedTools.length > 0) {
        frontmatter.disallowedTools = [...cc.disallowedTools];
      }
      frontmatter.model = cc.model;
      if (cc.effort !== "inherit") {
        frontmatter.effort = cc.effort;
      }
      if (cc.permissionMode !== "default") {
        frontmatter.permissionMode = cc.permissionMode;
      }
      if (cc.isolation === "worktree") {
        frontmatter.isolation = "worktree";
      }
      if (cc.memory && cc.memory !== "none") {
        frontmatter.memory = cc.memory;
      }
      if (cc.maxTurns !== undefined) {
        frontmatter.maxTurns = cc.maxTurns;
      }
      if (cc.omitClaudeMd === true) {
        frontmatter.omitClaudeMd = true;
      }
      if (skillIds.size > 0) {
        frontmatter.skills = [...skillIds];
      }

      files.push({
        path: agentPath,
        kind: "agent",
        content: renderFrontmatterMarkdown(
          frontmatter,
          renderAgentBody(pack.common),
        ),
      });
    }

    if (cc.includeClaudeMd) {
      const claudeParts = [renderAgentBody(pack.common)];
      if (cc.referenceAgentsMd) {
        claudeParts.push("@AGENTS.md");
      }
      files.push({
        path: "CLAUDE.md",
        kind: "agent",
        content: `${claudeParts.join("\n\n")}\n`,
      });
    }

    const enabledMcp = pack.common.mcpServers.filter((m) => m.enabled);
    if (enabledMcp.length > 0) {
      const mcpServers = Object.fromEntries(
        enabledMcp.map((m) => [
          m.id,
          m.transport === "stdio"
            ? {
                type: "stdio",
                command: m.command,
                args: m.args.filter((x) => x.length > 0),
              }
            : { type: "http", url: m.serverUrl },
        ]),
      );
      files.push({
        path: ".mcp.json",
        kind: "mcp",
        content: `${JSON.stringify({ mcpServers }, null, 2)}\n`,
      });
    }

    files.push({
      path: "PAKTRO-SETUP.md",
      kind: "guide",
      content: buildClaudeSetupGuide(pack, cc),
    });

    return files;
  },
  importFiles(files) {
    const agentFiles = files.filter((f) =>
      /^\.claude\/agents\/(?:.+\/)?[^/]+\.md$/.test(f.path),
    );
    const ruleFiles = files.filter((f) =>
      /^\.claude\/rules\/(?:.+\/)?[^/]+\.md$/.test(f.path),
    );
    const skillFiles = files.filter((f) =>
      /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(f.path),
    );
    const hasClaudeMd = files.some((f) => f.path === "CLAUDE.md");
    const hasMcpJson = files.some((f) => f.path === ".mcp.json");

    if (
      agentFiles.length === 0 &&
      ruleFiles.length === 0 &&
      skillFiles.length === 0 &&
      !hasClaudeMd &&
      !hasMcpJson
    ) {
      return null;
    }

    const warnings: string[] = [];
    const rules: CommonRule[] = [];
    for (const rf of ruleFiles) {
      const rawId = rf.path
        .replace(/^\.claude\/rules\/|\.md$/g, "")
        .replace(/\//g, "-");
      const id = SLUG_REGEX.test(rawId) ? rawId : slugify(rawId);
      if (rf.content.startsWith("---\n") || rf.content.startsWith("---\r\n")) {
        const { metadata, body } = parseFrontmatterMarkdown(rf.content);
        const patterns = Array.isArray(metadata.paths)
          ? metadata.paths.map(String).map((s) => s.trim()).filter(Boolean)
          : typeof metadata.paths === "string"
            ? parsePatterns(metadata.paths)
            : [];
        const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() || id;
        const cleanBody = body.replace(/^#\s+.+\n+/, "").trim();
        rules.push({
          id,
          name: title,
          description: patterns.length
            ? `Escopo: ${patterns.join(", ")}`
            : "Regra do Claude Code.",
          content: cleanBody || `Diretriz ${id}.`,
          activation: patterns.length
            ? { type: "path", patterns }
            : { type: "always" },
          enabled: true,
        });
      } else {
        const body = rf.content.trim();
        const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() || id;
        const cleanBody = body.replace(/^#\s+.+\n+/, "").trim();
        rules.push({
          id,
          name: title,
          description: "Regra sempre ativa no Claude Code.",
          content: cleanBody || `Diretriz ${id}.`,
          activation: { type: "always" },
          enabled: true,
        });
      }
    }

    const skills: CommonSkill[] = [];
    const disableModelInvocationSkills: string[] = [];
    for (const sf of skillFiles) {
      const id = sf.path.replace(/^\.claude\/skills\/|\/SKILL\.md$/g, "");
      const parsed = parseSkillMarkdown(id, sf.content);
      skills.push(parsed.skill);
      if (parsed.disableModelInvocation) {
        disableModelInvocationSkills.push(parsed.skill.id);
      }
    }

    const mcpServers: CommonMcpServer[] = [];
    const mcpFile = files.find((f) => f.path === ".mcp.json");
    if (mcpFile) {
      const parsed = JSON.parse(mcpFile.content) as {
        mcpServers?: Record<string, Record<string, unknown>>;
      };
      for (const [rawId, cfg] of Object.entries(parsed.mcpServers ?? {})) {
        if (
          rawId === "__proto__" ||
          rawId === "constructor" ||
          rawId === "prototype" ||
          !cfg ||
          typeof cfg !== "object"
        ) {
          continue;
        }
        const id = SLUG_REGEX.test(rawId) ? rawId : slugify(rawId);
        if (cfg.env || cfg.headers) {
          warnings.push(
            `Credenciais/cabeçalhos em "${rawId}" (.mcp.json) foram ignorados por segurança.`,
          );
        }
        if ((cfg.type === "http" || (!cfg.type && typeof cfg.url === "string")) && typeof cfg.url === "string") {
          mcpServers.push({
            id,
            transport: "http",
            command: "",
            args: [],
            serverUrl: cfg.url,
            enabled: true,
          });
        } else if (typeof cfg.command === "string") {
          mcpServers.push({
            id,
            transport: "stdio",
            command: cfg.command,
            args: Array.isArray(cfg.args) ? cfg.args.map(String) : [],
            serverUrl: "",
            enabled: true,
          });
        }
      }
    }

    const validToolsSet = new Set<string>(CLAUDE_CODE_TOOL_NAMES);
    const validModelsSet = new Set<string>(this.catalog.models.map((m) => m.id));
    const validEffortsSet = new Set<string>([
      "inherit",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    const validModesSet = new Set<string>([
      "default",
      "acceptEdits",
      "auto",
      "dontAsk",
      "bypassPermissions",
      "plan",
    ]);
    const validMemorySet = new Set<string>(["user", "project", "local"]);

    const targets = agentFiles.length > 0 ? agentFiles : files.filter((f) => f.path === "CLAUDE.md");
    const packs: AgentPackV2[] = [];

    if (targets.length === 0 && (ruleFiles.length > 0 || skillFiles.length > 0 || hasMcpJson)) {
      packs.push({
        schemaVersion: 2,
        target: "claude-code",
        common: {
          id: crypto.randomUUID(),
          name: "Pacote Claude Code",
          slug: "claude-pack",
          description: "Regras, skills ou MCP importados para Claude Code.",
          specialty: "Claude Code",
          goal: "Aplicar regras, skills e integrações importadas no projeto Claude Code.",
          instructions: "",
          capabilityIntents: mcpServers.length > 0 ? ["use-mcp"] : [],
          rules,
          skills,
          mcpServers,
          tags: ["claude-code"],
          updatedAt: new Date().toISOString(),
        },
        targets: {
          claudeCode: {
            ...defaultClaudeCodeTarget(),
            exposure: "main",
            includeClaudeMd: false,
            disableModelInvocationSkills,
          },
        },
      });
    }

    for (const af of targets) {
      if (af.path === "CLAUDE.md") {
        const sections = parseAgentBodySections(af.content);
        packs.push({
          schemaVersion: 2,
          target: "claude-code",
          common: {
            id: crypto.randomUUID(),
            name: sections.name || "Claude Code (Principal)",
            slug: "claude-main",
            description: "Configuração importada de CLAUDE.md.",
            specialty: sections.specialty,
            goal: sections.goal || "Seguir as instruções do projeto no Claude Code.",
            instructions: sections.instructions,
            capabilityIntents: ["read-files", "search-files"],
            rules,
            skills,
            mcpServers,
            tags: ["claude-code"],
            updatedAt: new Date().toISOString(),
          },
          targets: {
            claudeCode: {
              ...defaultClaudeCodeTarget(),
              exposure: "main",
              includeClaudeMd: true,
              referenceAgentsMd: af.content.includes("@AGENTS.md"),
              disableModelInvocationSkills,
            },
          },
        });
        continue;
      }

      const { metadata, body } = parseFrontmatterMarkdown(af.content);
      const parseToolField = (val: unknown): ClaudeCodeToolName[] => {
        const rawList = Array.isArray(val)
          ? val.map(String)
          : typeof val === "string"
            ? val
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
        const normalized: ClaudeCodeToolName[] = [];
        const unknown: string[] = [];
        for (const item of rawList) {
          // Handle Task(...) -> Agent(...) legacy alias and Agent(...) / Tool(specifier)
          const bare = item.replace(/\([\s\S]*\)$/, "").trim();
          const mappedBare = bare === "Task" ? "Agent" : bare;
          if (mappedBare.startsWith("mcp__")) {
            warnings.push(
              `Filtro MCP "${item}" em subagente foi ignorado na lista de ferramentas nativas; configure servidores MCP na etapa Integrações.`,
            );
            continue;
          }
          if (validToolsSet.has(mappedBare)) {
            if (item !== mappedBare) {
              warnings.push(
                `Especificador "${item}" simplificado para a ferramenta nativa "${mappedBare}".`,
              );
            }
            if (!normalized.includes(mappedBare as ClaudeCodeToolName)) {
              normalized.push(mappedBare as ClaudeCodeToolName);
            }
          } else {
            unknown.push(item);
          }
        }
        if (unknown.length > 0) {
          throw new Error(
            `Ferramenta(s) Claude Code desconhecida(s): ${unknown.join(", ")}.`,
          );
        }
        return normalized;
      };

      const tools = parseToolField(metadata.tools);
      const disallowedTools = parseToolField(metadata.disallowedTools);
      const rawSlug =
        typeof metadata.name === "string" && metadata.name.trim()
          ? metadata.name.trim()
          : af.path.split("/").pop()!.replace(/\.md$/, "");
      const slug = SLUG_REGEX.test(rawSlug) ? rawSlug : slugify(rawSlug);
      const sections = parseAgentBodySections(body);
      const rawModel = typeof metadata.model === "string" ? metadata.model : "inherit";
      const model = (validModelsSet.has(rawModel) ? rawModel : "inherit") as ClaudeCodeTargetConfig["model"];
      if (rawModel && !validModelsSet.has(rawModel)) {
        warnings.push(`Modelo "${rawModel}" ajustado para "inherit" na importação.`);
      }
      const rawEffort = typeof metadata.effort === "string" ? metadata.effort : "inherit";
      const effort = (validEffortsSet.has(rawEffort) ? rawEffort : "inherit") as ClaudeCodeTargetConfig["effort"];
      const rawPerm =
        metadata.permissionMode === "manual"
          ? "default"
          : typeof metadata.permissionMode === "string"
            ? metadata.permissionMode
            : "default";
      const permissionMode = (validModesSet.has(rawPerm)
        ? rawPerm
        : "default") as ClaudeCodeTargetConfig["permissionMode"];
      const memory = (
        typeof metadata.memory === "string" && validMemorySet.has(metadata.memory)
          ? metadata.memory
          : undefined
      ) as ClaudeCodeMemoryScope | undefined;
      const maxTurns =
        typeof metadata.maxTurns === "number" &&
        Number.isInteger(metadata.maxTurns) &&
        metadata.maxTurns >= 1 &&
        metadata.maxTurns <= 1000
          ? metadata.maxTurns
          : undefined;
      const omitClaudeMd = metadata.omitClaudeMd === true ? true : undefined;

      const skillRefs = Array.isArray(metadata.skills)
        ? metadata.skills.map(String)
        : [];
      const agentSkills =
        skillRefs.length > 0
          ? skills.filter((s) => skillRefs.includes(s.id))
          : skills;

      packs.push({
        schemaVersion: 2,
        target: "claude-code",
        common: {
          id: crypto.randomUUID(),
          name: sections.name || slug,
          slug,
          description:
            typeof metadata.description === "string"
              ? metadata.description
              : "Subagente Claude Code importado.",
          specialty: sections.specialty,
          goal:
            sections.goal ||
            (typeof metadata.description === "string"
              ? metadata.description
              : "Executar tarefas delegadas no Claude Code."),
          instructions: sections.instructions,
          capabilityIntents: inferIntentsFromClaudeTools(
            tools,
            mcpServers.length > 0,
          ),
          rules,
          skills: agentSkills,
          mcpServers,
          tags: ["claude-code"],
          updatedAt: new Date().toISOString(),
        },
        targets: {
          claudeCode: {
            exposure: hasClaudeMd ? "both" : "subagent",
            model,
            effort,
            tools,
            disallowedTools,
            permissionMode,
            isolation: metadata.isolation === "worktree" ? "worktree" : "none",
            ...(memory ? { memory } : {}),
            ...(maxTurns !== undefined ? { maxTurns } : {}),
            ...(omitClaudeMd ? { omitClaudeMd: true } : {}),
            includeClaudeMd: hasClaudeMd,
            referenceAgentsMd: false,
            disableModelInvocationSkills,
          },
        },
      });
    }

    return {
      packs,
      detectedTarget: "claude-code",
      warnings,
    };
  },
  mergePolicy(relativePath: string): MergePolicy {
    if (relativePath === ".mcp.json") return "json-merge";
    if (relativePath === "CLAUDE.md") return "managed-markdown";
    return "replace-owned";
  },
  setupGuide(pack: AgentPackV2): string {
    return buildClaudeSetupGuide(pack, effectiveConfig(pack));
  },
  approvalSignaturePayload(pack: AgentPackV2) {
    return {
      schemaVersion: pack.schemaVersion,
      target: pack.target,
      mappingVersion: this.mappingVersion,
      common: { ...pack.common, updatedAt: "" },
      targetConfig: pack.targets.claudeCode,
      files: this.generate(pack),
    };
  },
};
