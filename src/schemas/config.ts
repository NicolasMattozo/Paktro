import { z } from "zod";
import { MODEL_IDS } from "../templates/models";
import { TOOL_NAMES } from "../templates/tools";
export { TOOL_NAMES } from "../templates/tools";
export const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use letras minúsculas, números e hífens.",
  );
const text = z.string().max(12000);
export const ruleSchema = z
  .object({
    id: slugSchema,
    name: z.string().max(100),
    description: z.string().max(1000),
    content: text,
    trigger: z.enum(["always_on", "model_decision", "glob", "manual"]),
    globs: z.string().max(500),
    enabled: z.boolean(),
  })
  .strict();
export const skillSchema = z
  .object({
    id: slugSchema,
    name: z.string().max(100),
    description: z.string().max(1000),
    content: text,
    enabled: z.boolean(),
  })
  .strict();
export const mcpSchema = z
  .object({
    id: slugSchema,
    transport: z.enum(["stdio", "http"]),
    command: z.string().max(500),
    args: z.array(z.string().max(1000)).max(50),
    serverUrl: z.string().max(2000),
    enabled: z.boolean(),
  })
  .strict();
export const draftSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().max(100),
    slug: z.string().max(100),
    description: z.string().max(2000),
    specialty: z.string().max(300),
    goal: z.string().max(2000),
    instructions: text,
    model: z.enum(MODEL_IDS),
    mainAgent: z.boolean(),
    subagent: z.boolean(),
    tools: z.array(z.enum(TOOL_NAMES)).max(TOOL_NAMES.length),
    commandExecutionPolicy: z.enum(["off", "auto", "eager", "sandbox"]),
    rules: z.array(ruleSchema).max(30),
    skills: z.array(skillSchema).max(30),
    mcpServers: z.array(mcpSchema).max(20),
    tags: z.array(z.string().max(32)).max(10),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type AgentConfig = z.infer<typeof draftSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type Skill = z.infer<typeof skillSchema>;
export type McpServer = z.infer<typeof mcpSchema>;
export const configSchema = draftSchema.superRefine((v, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: "custom", path, message });
  if (!v.name.trim()) issue(["name"], "Informe o nome do agente.");
  if (!slugSchema.safeParse(v.slug).success)
    issue(
      ["slug"],
      "O nome do arquivo deve conter apenas letras minúsculas, números e hífens (até 64 caracteres).",
    );
  if (!v.description.trim())
    issue(["description"], "Descreva quando este agente deve ser utilizado.");
  if (!v.goal.trim()) issue(["goal"], "Informe o objetivo do agente.");
  if (!v.mainAgent && !v.subagent)
    issue(
      ["mainAgent"],
      "Selecione ao menos um papel: principal ou subagente.",
    );
  if (new Set(v.tools).size !== v.tools.length)
    issue(["tools"], "Ferramentas repetidas.");
  for (const key of ["rules", "skills", "mcpServers"] as const) {
    const ids = new Set<string>();
    v[key].forEach((item, index) => {
      if (ids.has(item.id))
        issue([key, index, "id"], "Identificador repetido.");
      ids.add(item.id);
    });
  }
  v.rules.forEach((r, i) => {
    if (!r.enabled) return;
    if (!r.content.trim())
      issue(["rules", i, "content"], "Preencha as instruções da regra.");
    if (!r.description.trim())
      issue(["rules", i, "description"], "Preencha a descrição da regra.");
    if (r.trigger === "glob" && !r.globs.trim())
      issue(["rules", i, "globs"], "Informe os padrões de arquivos da regra.");
  });
  v.skills.forEach((s, i) => {
    if (s.enabled && (!s.description.trim() || !s.content.trim()))
      issue(["skills", i], "Preencha a descrição e as instruções da skill.");
  });
  v.mcpServers.forEach((m, i) => {
    if (!m.enabled) return;
    if (m.transport === "stdio" && !m.command.trim())
      issue(["mcpServers", i, "command"], "Informe o comando do servidor MCP.");
    if (m.transport === "http") {
      try {
        const u = new URL(m.serverUrl);
        if (
          !["http:", "https:"].includes(u.protocol) ||
          u.username ||
          u.password
        )
          throw Error();
      } catch {
        issue(
          ["mcpServers", i, "serverUrl"],
          "Informe uma URL HTTP(S) sem credenciais.",
        );
      }
    }
  });
});
export const backupSchema = z
  .object({
    format: z.enum(["agex", "agent-studio"]),
    version: z.literal(1),
    agents: z.array(draftSchema).max(100),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.agents.map((a) => a.id)).size !== v.agents.length)
      ctx.addIssue({ code: "custom", message: "IDs duplicados no backup." });
  });
export type Backup = z.infer<typeof backupSchema>;
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64)
    .replace(/-$/, "");
}
export function warnings(config: AgentConfig): string[] {
  const result: string[] = [];
  if (["eager", "auto"].includes(config.commandExecutionPolicy))
    result.push(
      "A política selecionada permite execução automática em determinadas condições. Confira as permissões no Antigravity.",
    );
  if (
    config.rules.some((r) => r.id === "approval" && r.enabled) &&
    config.commandExecutionPolicy === "eager"
  )
    result.push(
      "Pedir aprovação em uma regra pode conflitar com a política eager. Uma instrução no prompt não impõe uma permissão.",
    );
  if (
    config.skills.some((s) => s.id === "test-checklist" && s.enabled) &&
    !config.tools.includes("run_command")
  )
    result.push(
      "O checklist de testes está ativo, mas run_command não está selecionado. O agente poderá orientar os testes sem executá-los.",
    );
  if (config.rules.some((r) => r.trigger === "manual" && r.enabled))
    result.push(
      "Regras manuais dependem de menção explícita no App; menções de regras não estão disponíveis no CLI.",
    );
  if (config.tools.includes("call_mcp_tool"))
    result.push(
      "call_mcp_tool é injetada automaticamente pelo Antigravity quando há servidores MCP configurados; listá-la em tools no arquivo .md pode falhar no CLI (agy --agent).",
    );
  const enabled = config.rules.filter((r) => r.enabled);
  if (new Set(enabled.map((r) => r.content.trim())).size < enabled.length)
    result.push(
      "Há regras com instruções idênticas. Considere remover a redundância.",
    );
  return result;
}
