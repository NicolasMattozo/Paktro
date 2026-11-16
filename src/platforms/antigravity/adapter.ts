import { generateFiles } from "../../generators/antigravity";
import { configSchema, warnings as legacyWarnings } from "../../schemas/config";
import { validatePackSchema } from "../../schemas/pack";
import {
  MODEL_FAMILIES,
  MODEL_IDS,
  isSessionModel,
  modelLabel,
} from "../../templates/models";
import { TOOL_CATALOG, TOOL_SOURCES } from "../../templates/tools";
import type { AgentPackV2, GeneratedFile } from "../../types";
import {
  defaultAntigravityTarget,
  packToLegacyAntigravity,
} from "../common/convert";
import { assertSafeRelativePath, SLUG_REGEX, slugify } from "../common/paths";
import { MAPPING_VERSIONS, type MergePolicy, type PlatformAdapter } from "../types";
import { parseFrontmatterMarkdown } from "../common/frontmatter";
import { parseSkillMarkdown } from "../common/skills";
import { legacyTriggerToActivation } from "../common/instructions";
import { inferIntentsFromAntigravityTools } from "../common/convert";
import type { AgentConfig, CommonMcpServer, CommonRule, CommonSkill } from "../../types";
import { TOOL_NAMES, type ToolName } from "../../templates/tools";

const ANTIGRAVITY_MODELS = MODEL_IDS.map((id) => {
  const family = MODEL_FAMILIES.find(
    (f) => f.defaultModel === id || f.levels.some((l) => l.id === id),
  );
  const level = family?.levels.find((l) => l.id === id);
  return {
    id,
    label: modelLabel(id),
    badge: isSessionModel(id) ? "Sessão CLI" : id === "inherit" ? "Padrão" : "YAML",
    group: family ? family.name : "Nativo no YAML",
    notes: level?.label,
  };
});

export const antigravityAdapter: PlatformAdapter = {
  id: "antigravity",
  mappingVersion: MAPPING_VERSIONS.antigravity,
  catalog: {
    id: "antigravity",
    name: "Google Antigravity",
    shortName: "Antigravity",
    vendorGroup: "google",
    summary:
      "Pacotes completos em .agents/ com agentes, regras, skills e mcp_config.json.",
    docsUrl: TOOL_SOURCES.agents,
    docsVerifiedAt: "2026-11-12",
    mappingVersion: MAPPING_VERSIONS.antigravity,
    supportsRoles: true,
    supportsModels: true,
    models: ANTIGRAVITY_MODELS,
    tools: TOOL_CATALOG.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      group: t.group,
    })),
    permissionModes: [
      {
        id: "sandbox",
        label: "Sandbox — respeitar o ambiente isolado",
        description: "Executa comandos dentro das restrições do sandbox da sessão.",
      },
      {
        id: "off",
        label: "Off — desativar execução automática",
        description: "Exige revisão antes de rodar comandos no terminal.",
      },
      {
        id: "auto",
        label: "Auto — decisão automática da plataforma",
        description: "Antigravity decide conforme a sessão e políticas locais.",
      },
      {
        id: "eager",
        label: "Eager — execução automática permissiva",
        description: "Permite execução automática com menor atrito quando habilitado.",
        highRisk: true,
      },
    ],
    toolNotes:
      "Ferramentas padrão usam os IDs oficiais do Antigravity; servidores MCP são configurados separadamente em .agents/mcp_config.json (não inclua call_mcp_tool em tools).",
  },
  validate(pack: AgentPackV2) {
    const base = validatePackSchema(pack);
    const legacy = packToLegacyAntigravity(pack);
    const legacyRes = configSchema.safeParse(legacy);
    const errors = [...base.errors];
    if (!legacyRes.success) {
      for (const issue of legacyRes.error.issues) {
        if (!errors.includes(issue.message)) errors.push(issue.message);
      }
    }
    return {
      valid: errors.length === 0,
      errors,
      warnings: this.warnings(pack),
      blockers: [],
    };
  },
  warnings(pack: AgentPackV2) {
    return legacyWarnings(packToLegacyAntigravity(pack));
  },
  generate(pack: AgentPackV2): GeneratedFile[] {
    const legacy = packToLegacyAntigravity(pack);
    const files = generateFiles(legacy);
    for (const f of files) {
      assertSafeRelativePath(f.path);
    }
    return files;
  },
  importFiles(files) {
    const agentFiles = files.filter((f) =>
      /^\.agents\/agents\/[^/]+\.md$/.test(f.path),
    );
    const standaloneMd =
      agentFiles.length === 0 &&
      files.length === 1 &&
      files[0].path.endsWith(".md") &&
      !files[0].path.startsWith(".claude/") &&
      !files[0].path.endsWith("AGENTS.md") &&
      !files[0].path.endsWith("CLAUDE.md")
        ? files
        : [];
    const targets = agentFiles.length > 0 ? agentFiles : standaloneMd;
    if (targets.length === 0) return null;

    const rulesById = new Map<string, CommonRule>();
    for (const rf of files.filter((f) => /^\.agents\/rules\/[^/]+\.md$/.test(f.path))) {
      const rawId = rf.path.replace(/^\.agents\/rules\/|\.md$/g, "");
      const id = SLUG_REGEX.test(rawId) ? rawId : slugify(rawId);
      const { metadata, body } = parseFrontmatterMarkdown(rf.content);
      const trigger = (["always_on", "model_decision", "glob", "manual"].includes(
        String(metadata.trigger),
      )
        ? metadata.trigger
        : "always_on") as AgentConfig["rules"][number]["trigger"];
      const globs = typeof metadata.globs === "string" ? metadata.globs : "";
      const titleMatch = body.match(/^#\s+(.+)$/m);
      const cleanBody = titleMatch
        ? body.replace(/^#\s+.+\n+/, "").trim()
        : body.trim();
      rulesById.set(id, {
        id,
        name: titleMatch?.[1]?.trim() || id,
        description:
          typeof metadata.description === "string" ? metadata.description : "",
        content: cleanBody || `Diretriz ${id}.`,
        activation: legacyTriggerToActivation(
          trigger,
          globs,
          typeof metadata.description === "string" ? metadata.description : "",
        ),
        enabled: true,
      });
    }

    const skillsById = new Map<string, CommonSkill>();
    for (const sf of files.filter((f) =>
      /^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(f.path),
    )) {
      const id = sf.path.replace(/^\.agents\/skills\/|\/SKILL\.md$/g, "");
      const parsed = parseSkillMarkdown(id, sf.content);
      skillsById.set(id, parsed.skill);
    }

    const warnings: string[] = [];
    const mcpServers: CommonMcpServer[] = [];
    const mcpFile = files.find((f) => f.path === ".agents/mcp_config.json");
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
            `Credenciais/cabeçalhos em "${rawId}" (.agents/mcp_config.json) foram ignorados por segurança.`,
          );
        }
        if (typeof cfg.command === "string") {
          mcpServers.push({
            id,
            transport: "stdio",
            command: cfg.command,
            args: Array.isArray(cfg.args) ? cfg.args.map(String) : [],
            serverUrl: "",
            enabled: true,
          });
        } else if (typeof cfg.serverUrl === "string" || typeof cfg.url === "string") {
          mcpServers.push({
            id,
            transport: "http",
            command: "",
            args: [],
            serverUrl: String(cfg.serverUrl ?? cfg.url),
            enabled: true,
          });
        }
      }
    }

    const packs: AgentPackV2[] = [];
    for (const af of targets) {
      const { metadata, body } = parseFrontmatterMarkdown(af.content);
      const rawTools = Array.isArray(metadata.tools) ? metadata.tools.map(String) : [];
      const unknownTools = rawTools.filter(
        (t) => !(TOOL_NAMES as readonly string[]).includes(t),
      );
      if (unknownTools.length > 0) {
        throw new Error(
          `Arquivo contém ferramentas não suportadas: ${unknownTools.join(", ")}.`,
        );
      }
      const validTools = rawTools as ToolName[];
      const skillRefs = Array.isArray(metadata.skills)
        ? metadata.skills.map(String)
        : [];
      const agentSkills: CommonSkill[] = [];
      for (const ref of skillRefs) {
        const sid = ref.replace(/^skills\//, "");
        const sk = skillsById.get(sid);
        if (!sk) {
          throw new Error(`Skill ausente no pacote: ${ref}`);
        }
        agentSkills.push(sk);
      }

      const rawSlug =
        typeof metadata.name === "string" && metadata.name.trim()
          ? metadata.name.trim()
          : af.path.split("/").pop()!.replace(/\.md$/, "");
      const slug = SLUG_REGEX.test(rawSlug) ? rawSlug : slugify(rawSlug);
      const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
      const spec = body.match(/##\s+Especialidade\s*\n+([\s\S]*?)(?=^##\s+|$)/m)?.[1]?.trim() ?? "";
      const goal = body.match(/##\s+Objetivo\s*\n+([\s\S]*?)(?=^##\s+|$)/m)?.[1]?.trim() ?? "";
      const instMatch =
        body.match(/##\s+Instruções adicionais\s*\n+([\s\S]*?)(?=^##\s+|$)/m) ??
        body.match(/##\s+Instruções\s*\n+([\s\S]*?)(?=^##\s+|$)/m);
      const inst = instMatch?.[1]?.trim() || (!spec && !goal ? body.trim() : "");
      const rawModel = typeof metadata.model === "string" ? metadata.model : "inherit";
      const model = (MODEL_IDS as readonly string[]).includes(rawModel)
        ? (rawModel as typeof MODEL_IDS[number])
        : "inherit";
      const policy = (["sandbox", "off", "auto", "eager"].includes(
        String(metadata.commandExecutionPolicy),
      )
        ? metadata.commandExecutionPolicy
        : "sandbox") as "sandbox" | "off" | "auto" | "eager";

      packs.push({
        schemaVersion: 2,
        target: "antigravity",
        common: {
          id: crypto.randomUUID(),
          name: heading || slug,
          slug,
          description:
            typeof metadata.description === "string"
              ? metadata.description
              : "Agente importado.",
          specialty: spec,
          goal:
            goal ||
            (typeof metadata.description === "string"
              ? metadata.description
              : "Ajudar nas tarefas do projeto."),
          instructions: inst,
          capabilityIntents: inferIntentsFromAntigravityTools(
            validTools,
            mcpServers.length > 0,
          ),
          rules: [...rulesById.values()],
          skills: agentSkills,
          mcpServers,
          tags: [],
          updatedAt: new Date().toISOString(),
        },
        targets: {
          antigravity: {
            ...defaultAntigravityTarget(),
            model,
            mainAgent: metadata.mainAgent !== false,
            subagent: metadata.subagent !== false,
            tools: validTools,
            commandExecutionPolicy: policy,
          },
        },
      });
    }

    return {
      packs,
      detectedTarget: "antigravity",
      warnings,
    };
  },
  mergePolicy(relativePath: string): MergePolicy {
    if (relativePath === ".agents/mcp_config.json") return "json-merge";
    return "replace-owned";
  },
  setupGuide(pack: AgentPackV2): string {
    const setupFile = this.generate(pack).find((f) => f.path === "AGEX-SETUP.md");
    return (
      setupFile?.content ??
      `# ${pack.common.name}\n\nExtraia a pasta \`.agents/\` na raiz do projeto.\n`
    );
  },
  approvalSignaturePayload(pack: AgentPackV2) {
    return {
      schemaVersion: pack.schemaVersion,
      target: pack.target,
      mappingVersion: this.mappingVersion,
      common: { ...pack.common, updatedAt: "" },
      targetConfig: pack.targets.antigravity,
      files: this.generate(pack),
    };
  },
};
