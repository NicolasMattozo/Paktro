import { validatePackSchema } from "../../schemas/pack";
import type {
  AgentPackV2,
  ChatGptPluginTargetConfig,
  CommonMcpServer,
  CommonSkill,
  GeneratedFile,
} from "../../types";
import { defaultChatGptPluginTarget } from "../common/convert";
import { renderAgentBody } from "../common/frontmatter";
import { isInsecureHttpRemoteUrl } from "../common/mcp";
import { assertSafeRelativePath, SLUG_REGEX, slugify } from "../common/paths";
import { parseSkillMarkdown, renderSkillMarkdown } from "../common/skills";
import { MAPPING_VERSIONS, type MergePolicy, type PlatformAdapter } from "../types";

export const AGENT_PLUGINS_MANIFEST_SCHEMA =
  "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
export const AGENT_PLUGINS_MCP_SCHEMA =
  "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";

function effectiveConfig(pack: AgentPackV2): ChatGptPluginTargetConfig {
  return pack.targets.chatgptPlugin ?? defaultChatGptPluginTarget();
}

function buildPrimarySkillContent(pack: AgentPackV2): string {
  const sections: string[] = [renderAgentBody(pack.common)];
  const alwaysRules = pack.common.rules.filter(
    (r) => r.enabled && r.activation.type === "always",
  );
  if (alwaysRules.length > 0) {
    sections.push("## Diretrizes incluídas");
    for (const r of alwaysRules) {
      sections.push(`### ${r.name}\n\n${r.content.trim()}`);
    }
  }
  return sections.join("\n\n");
}

function buildChatGptSetupGuide(pack: AgentPackV2): string {
  const hasHttpMcp = pack.common.mcpServers.some(
    (m) => m.enabled && m.transport === "http",
  );
  const lines = [
    `# Plugin / Skill portátil (ChatGPT & Codex) — ${pack.common.name}`,
    "",
    "## Arquivos do pacote",
    "",
    "- `plugin.json` — manifesto estrito no padrão `agent-plugins.org` (`1.0.0`, sem chaves legadas fora do schema)",
    `- \`skills/${pack.common.slug}/SKILL.md\` — skill principal descoberta automaticamente na raiz \`skills/\``,
    "- `skills/<skill>/SKILL.md` — skills adicionais ativas",
    hasHttpMcp
      ? "- `mcp.json` — conexões remotas `streamable-http` validadas com `mcp.schema.json` (`1.0.0`)"
      : "- Sem `mcp.json` (nenhum servidor MCP HTTP remoto ativo)",
    "",
    "## Limitações de ambiente (ChatGPT Web)",
    "",
    "- Na especificação portátil `agent-plugins.org` 1.0.0, `skills/` e `mcp.json` são descobertos por convenção de caminho fixo na raiz do plugin (`plugin.json` possui `additionalProperties: false`).",
    "- Servidores MCP `stdio` locais não são portáveis para a interface web do ChatGPT; exponha via `streamable-http` com HTTPS e declare autenticação (`extensions[\"com.openai\"].auth`) fora deste pacote.",
    "- Papéis locais de IDE (`mainAgent`/`subagent`) e seletores de modelo locais não se aplicam ao formato portátil de plugin.",
    "- Credenciais nunca são gravadas no `paktro.json` ou no `mcp.json`.",
  ];
  return `${lines.join("\n")}\n`;
}

export const chatGptPluginAdapter: PlatformAdapter = {
  id: "chatgpt-plugin",
  mappingVersion: MAPPING_VERSIONS["chatgpt-plugin"],
  catalog: {
    id: "chatgpt-plugin",
    name: "ChatGPT / Codex (Plugin portátil)",
    shortName: "ChatGPT Plugin",
    vendorGroup: "openai",
    summary:
      "Pacote portátil Agent Plugins 1.0.0 com plugin.json, skills/*/SKILL.md e mcp.json (streamable-http).",
    docsUrl: "https://developers.openai.com/plugins/build/plugins",
    docsVerifiedAt: "2026-11-24",
    mappingVersion: MAPPING_VERSIONS["chatgpt-plugin"],
    supportsRoles: false,
    supportsModels: false,
    models: [],
    tools: [],
    permissionModes: [],
    toolNotes:
      "Plugins portáteis do ChatGPT/Codex (agent-plugins.org 1.0.0) descobrem skills/<nome>/SKILL.md e mcp.json na raiz do pacote, aceitando conectores remotos em streamable-http (HTTPS).",
  },
  validate(pack: AgentPackV2) {
    const base = validatePackSchema(pack);
    const errors = [...base.errors];
    const blockers: string[] = [];

    for (const mcp of pack.common.mcpServers) {
      if (mcp.enabled && mcp.transport === "stdio") {
        const msg = `Servidor MCP stdio local "${mcp.id}" não é suportado no ChatGPT Web; converta para streamable-http (HTTPS) ou desative-o.`;
        if (!errors.includes(msg)) errors.push(msg);
        blockers.push(msg);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: this.warnings(pack),
      blockers,
    };
  },
  warnings(pack: AgentPackV2): string[] {
    const out: string[] = [];
    for (const rule of pack.common.rules) {
      if (!rule.enabled) continue;
      if (rule.activation.type === "path") {
        out.push(
          `Regra por caminho "${rule.id}" não tem gatilho por glob nativo no plugin ChatGPT.`,
        );
      } else if (rule.activation.type === "manual" || rule.activation.type === "automatic") {
        out.push(
          `Regra "${rule.id}" (${rule.activation.type}) não é convertida em gatilho separado do plugin; incorpore o texto como skill se necessário.`,
        );
      }
    }
    for (const s of pack.common.skills) {
      if (s.enabled && s.id === pack.common.slug) {
        out.push(
          `A skill "${s.id}" compartilha o mesmo ID da skill principal (${pack.common.slug}); apenas um SKILL.md é mantido nesse diretório.`,
        );
      }
    }
    for (const mcp of pack.common.mcpServers) {
      if (mcp.enabled && mcp.transport === "http" && isInsecureHttpRemoteUrl(mcp.serverUrl)) {
        out.push(
          `O servidor MCP "${mcp.id}" usa HTTP sem HTTPS; o ChatGPT remoto exige HTTPS público.`,
        );
      }
    }
    return out;
  },
  generate(pack: AgentPackV2): GeneratedFile[] {
    const check = this.validate(pack);
    if (!check.valid) {
      throw new Error(check.errors[0]);
    }
    const cfg = effectiveConfig(pack);
    const files: GeneratedFile[] = [];

    const enabledHttpMcp = pack.common.mcpServers.filter(
      (m) => m.enabled && m.transport === "http",
    );

    // Agent Plugins 1.0.0 manifest has additionalProperties: false;
    // skills/ and mcp.json are discovered by fixed root paths, not manifest keys.
    const manifest: Record<string, unknown> = {
      $schema: AGENT_PLUGINS_MANIFEST_SCHEMA,
      name: pack.common.slug,
      version: cfg.version || "1.0.0",
      description: pack.common.description,
    };
    assertSafeRelativePath("plugin.json");
    files.push({
      path: "plugin.json",
      kind: "manifest",
      content: `${JSON.stringify(manifest, null, 2)}\n`,
    });

    const primaryPath = `skills/${pack.common.slug}/SKILL.md`;
    assertSafeRelativePath(primaryPath);
    files.push({
      path: primaryPath,
      kind: "skill",
      content: renderSkillMarkdown({
        id: pack.common.slug,
        name: pack.common.name,
        description: pack.common.description,
        content: buildPrimarySkillContent(pack),
        enabled: true,
      }),
    });

    for (const skill of pack.common.skills.filter(
      (s) => s.enabled && s.id !== pack.common.slug,
    )) {
      const skillPath = `skills/${skill.id}/SKILL.md`;
      assertSafeRelativePath(skillPath);
      files.push({
        path: skillPath,
        kind: "skill",
        content: renderSkillMarkdown(skill),
      });
    }

    if (enabledHttpMcp.length > 0) {
      const mcpServers = Object.fromEntries(
        enabledHttpMcp.map((m) => [
          m.id,
          {
            type: "streamable-http",
            url: m.serverUrl,
          },
        ]),
      );
      assertSafeRelativePath("mcp.json");
      files.push({
        path: "mcp.json",
        kind: "mcp",
        content: `${JSON.stringify(
          {
            $schema: AGENT_PLUGINS_MCP_SCHEMA,
            mcpServers,
          },
          null,
          2,
        )}\n`,
      });
    }

    files.push({
      path: "PAKTRO-SETUP.md",
      kind: "guide",
      content: buildChatGptSetupGuide(pack),
    });

    return files;
  },
  importFiles(files) {
    const manifestFile =
      files.find((f) => f.path === "plugin.json") ??
      files.find((f) => f.path === ".codex-plugin/plugin.json");
    const rootSkillFiles = files.filter((f) =>
      /^skills\/[^/]+\/SKILL\.md$/.test(f.path),
    );
    if (!manifestFile && rootSkillFiles.length === 0) {
      return null;
    }

    const warnings: string[] = [];
    let slug = "chatgpt-plugin";
    let version = "1.0.0";
    let description = "Plugin portátil para ChatGPT.";
    if (manifestFile) {
      const parsed = JSON.parse(manifestFile.content) as Record<string, unknown>;
      if (typeof parsed.name === "string" && parsed.name.trim()) {
        slug = SLUG_REGEX.test(parsed.name.trim())
          ? parsed.name.trim()
          : slugify(parsed.name);
      }
      if (typeof parsed.version === "string" && /^\d+\.\d+\.\d+$/.test(parsed.version)) {
        version = parsed.version;
      }
      if (typeof parsed.description === "string" && parsed.description.trim()) {
        description = parsed.description.trim();
      }
    }

    const skills: CommonSkill[] = [];
    for (const sf of rootSkillFiles) {
      const id = sf.path.replace(/^skills\/|\/SKILL\.md$/g, "");
      skills.push(parseSkillMarkdown(id, sf.content).skill);
    }
    const primarySkill = skills.find((s) => s.id === slug) ?? skills[0];
    const secondarySkills = primarySkill
      ? skills.filter((s) => s.id !== primarySkill.id)
      : skills;

    const mcpServers: CommonMcpServer[] = [];
    const mcpFile =
      files.find((f) => f.path === "mcp.json") ??
      files.find((f) => f.path === ".mcp.json");
    if (mcpFile) {
      const parsed = JSON.parse(mcpFile.content) as {
        mcpServers?: Record<string, Record<string, unknown>>;
      };
      for (const [id, cfg] of Object.entries(parsed.mcpServers ?? {})) {
        if (
          id === "__proto__" ||
          id === "constructor" ||
          id === "prototype" ||
          !cfg ||
          typeof cfg !== "object"
        ) {
          continue;
        }
        if (cfg.env || cfg.headers || cfg.extensions) {
          warnings.push(
            `Credenciais/cabeçalhos/auth em "${id}" (${mcpFile.path}) foram ignorados por segurança.`,
          );
        }
        if (typeof cfg.url === "string") {
          mcpServers.push({
            id: SLUG_REGEX.test(id) ? id : slugify(id),
            transport: "http",
            command: "",
            args: [],
            serverUrl: cfg.url,
            enabled: true,
          });
        } else if (typeof cfg.command === "string") {
          mcpServers.push({
            id: SLUG_REGEX.test(id) ? id : slugify(id),
            transport: "stdio",
            command: cfg.command,
            args: Array.isArray(cfg.args) ? cfg.args.map(String) : [],
            serverUrl: "",
            enabled: false,
          });
          warnings.push(
            `Servidor MCP stdio "${id}" foi desabilitado na importação porque ChatGPT Plugin Web aceita apenas streamable-http.`,
          );
        }
      }
    }

    const pack: AgentPackV2 = {
      schemaVersion: 2,
      target: "chatgpt-plugin",
      common: {
        id: crypto.randomUUID(),
        name: primarySkill?.name || slug,
        slug,
        description: manifestFile ? description : primarySkill?.description || description,
        specialty: "Plugin / Skill portátil",
        goal: description,
        instructions: primarySkill?.content || "",
        capabilityIntents: mcpServers.some((m) => m.enabled) ? ["use-mcp"] : [],
        rules: [],
        skills: secondarySkills,
        mcpServers,
        tags: ["chatgpt-plugin"],
        updatedAt: new Date().toISOString(),
      },
      targets: {
        chatgptPlugin: {
          version,
        },
      },
    };

    return {
      packs: [pack],
      detectedTarget: "chatgpt-plugin",
      warnings,
    };
  },
  mergePolicy(relativePath: string): MergePolicy {
    if (relativePath === "mcp.json") return "json-merge";
    return "replace-owned";
  },
  setupGuide(pack: AgentPackV2): string {
    return buildChatGptSetupGuide(pack);
  },
  approvalSignaturePayload(pack: AgentPackV2) {
    return {
      schemaVersion: pack.schemaVersion,
      target: pack.target,
      mappingVersion: this.mappingVersion,
      common: { ...pack.common, updatedAt: "" },
      targetConfig: pack.targets.chatgptPlugin,
      files: this.generate(pack),
    };
  },
};
