import {
  isSessionModel,
  modelTier,
  modelSetupGuide,
} from "../../templates/models";
import { stringify } from "yaml";
import { configSchema } from "../../schemas/config";
import type { AgentConfig, GeneratedFile } from "../../types";
export const MAPPING_VERSION = "antigravity-2026-11-12";
const markdown = (metadata: object, body: string) =>
  `---\n${stringify(metadata, { lineWidth: 0 })}---\n\n${body.trim()}\n`;
export function generateFiles(input: AgentConfig): GeneratedFile[] {
  const a = configSchema.parse(input);
  const skills = a.skills
    .filter((s) => s.enabled)
    .sort((a, b) => a.id.localeCompare(b.id));
  const rules = a.rules
    .filter((r) => r.enabled)
    .sort((a, b) => a.id.localeCompare(b.id));
  const servers = a.mcpServers
    .filter((m) => m.enabled)
    .sort((a, b) => a.id.localeCompare(b.id));
  const body = [
    `# ${a.name}`,
    a.specialty && `## Especialidade\n\n${a.specialty}`,
    `## Objetivo\n\n${a.goal}`,
    a.instructions && `## Instruções adicionais\n\n${a.instructions}`,
    servers.length &&
      `## Integrações\n\nOs servidores MCP deste conjunto estão definidos em .agents/mcp_config.json: ${servers.map((s) => s.id).join(", ")}. A disponibilidade depende da configuração e das permissões do workspace.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const files: GeneratedFile[] = [
    {
      path: `.agents/agents/${a.slug}.md`,
      kind: "agent",
      content: markdown(
        {
          name: a.slug,
          description: a.description,
          tools: [...a.tools].sort(),
          mainAgent: a.mainAgent,
          subagent: a.subagent,
          model: modelTier(a.model),
          commandExecutionPolicy: a.commandExecutionPolicy,
          ...(skills.length
            ? { skills: skills.map((s) => `skills/${s.id}`) }
            : {}),
        },
        body,
      ),
    },
  ];
  rules.forEach((r) =>
    files.push({
      path: `.agents/rules/${r.id}.md`,
      kind: "rule",
      content: markdown(
        {
          trigger: r.trigger,
          description: r.description,
          ...(r.trigger === "glob" ? { globs: r.globs } : {}),
        },
        `# ${r.name}\n\n${r.content}`,
      ),
    }),
  );
  skills.forEach((s) =>
    files.push({
      path: `.agents/skills/${s.id}/SKILL.md`,
      kind: "skill",
      content: markdown(
        { name: s.id, description: s.description },
        `# ${s.name}\n\n${s.content}`,
      ),
    }),
  );
  if (servers.length)
    files.push({
      path: ".agents/mcp_config.json",
      kind: "mcp",
      content:
        JSON.stringify(
          {
            mcpServers: Object.fromEntries(
              servers.map((s) => [
                s.id,
                s.transport === "stdio"
                  ? { command: s.command, args: s.args }
                  : { serverUrl: s.serverUrl },
              ]),
            ),
          },
          null,
          2,
        ) + "\n",
    });
  if (isSessionModel(a.model))
    files.push({
      path: "AGEX-SETUP.md",
      kind: "guide",
      content: modelSetupGuide(a),
    });
  return files;
}
