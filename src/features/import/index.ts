import { parseDocument } from "yaml";
import JSZip from "jszip";
import { createAgent } from "../../templates/catalog";
import {
  configSchema,
  slugSchema,
  TOOL_NAMES,
  type AgentConfig,
} from "../../schemas/config";
import { MAX_IMPORT_BYTES } from "../../storage/local";
function frontmatter(source: string): {
  meta: Record<string, unknown>;
  body: string;
} {
  const match = source.match(
    /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/,
  );
  if (!match)
    throw new Error("O Markdown precisa começar com frontmatter YAML.");
  const doc = parseDocument(match[1], { uniqueKeys: true });
  if (doc.errors.length) throw new Error("O frontmatter contém YAML inválido.");
  const meta = doc.toJS({ maxAliasCount: 0 });
  if (!meta || typeof meta !== "object" || Array.isArray(meta))
    throw new Error("Metadados YAML inválidos.");
  return { meta, body: match[2].trim() };
}
function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
export async function importAntigravity(
  file: File,
): Promise<{ agents: AgentConfig[]; warnings: string[] }> {
  if (file.size > MAX_IMPORT_BYTES)
    throw new Error("O arquivo deve ter no máximo 1 MB.");
  const sources = new Map<string, string>();
  const warnings: string[] = [];
  if (file.name.toLowerCase().endsWith(".zip")) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entries = Object.values(zip.files).filter((e) => !e.dir);
    if (entries.length > 100)
      throw new Error("O ZIP excede o limite de 100 arquivos.");
    let total = 0;
    for (const entry of entries) {
      const original = entry.unsafeOriginalName ?? entry.name;
      if (
        original.startsWith("/") ||
        original.includes("\\") ||
        original.split("/").some((p) => p === ".." || p === ".") ||
        /^[a-z]:/i.test(original)
      )
        throw new Error("O ZIP contém um caminho inseguro.");
      // Check declared size before decompression; also count streamed bytes to stop zip bombs.
      const declared = (
        entry as unknown as { _data?: { uncompressedSize?: number } }
      )._data?.uncompressedSize;
      if (declared !== undefined && declared > MAX_IMPORT_BYTES - total)
        throw new Error("Conteúdo descompactado excede 1 MB.");
      const chunks: Uint8Array[] = [];
      await new Promise<void>((resolve, reject) => {
        const stream = (
          entry as unknown as {
            internalStream: (
              type: "uint8array",
            ) => JSZip.JSZipStreamHelper<Uint8Array>;
          }
        ).internalStream("uint8array");
        stream
          .on("data", (chunk) => {
            total += chunk.length;
            if (total > MAX_IMPORT_BYTES) {
              stream.pause();
              reject(new Error("Conteúdo descompactado excede 1 MB."));
            } else chunks.push(chunk);
          })
          .on("error", reject)
          .on("end", resolve)
          .resume();
      });
      const bytes = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      sources.set(entry.name, new TextDecoder().decode(bytes));
    }
  } else sources.set(`.agents/agents/${file.name}`, await file.text());
  const agents: AgentConfig[] = [];
  for (const [path, source] of sources) {
    if (!/^\.agents\/agents\/[^/]+\.md$/.test(path)) continue;
    const { meta, body } = frontmatter(source);
    const a = createAgent();
    const validName = slugSchema.safeParse(meta.name);
    if (!validName.success)
      throw new Error("O agente importado possui um nome inválido.");
    a.slug = validName.data;
    a.name = a.slug;
    a.description = text(meta.description);
    a.goal = "Executar as instruções importadas abaixo.";
    a.specialty = "";
    a.instructions = body;
    a.rules = [];
    a.skills = [];
    for (const key of [
      "model",
      "commandExecutionPolicy",
      "mainAgent",
      "subagent",
    ] as const)
      if (meta[key] !== undefined) Object.assign(a, { [key]: meta[key] });
    if (meta.tools !== undefined) {
      if (
        !Array.isArray(meta.tools) ||
        meta.tools.some(
          (t) => !TOOL_NAMES.includes(t as (typeof TOOL_NAMES)[number]),
        )
      )
        throw new Error(
          "O agente usa ferramentas não reconhecidas nesta versão do mapeamento.",
        );
      a.tools = meta.tools as AgentConfig["tools"];
    } else a.tools = [];
    if (meta.mcpServers)
      throw new Error(
        "MCPs inline não podem ser importados com segurança. Mova-os para .agents/mcp_config.json antes de importar.",
      );
    for (const key of Object.keys(meta))
      if (
        ![
          "name",
          "description",
          "model",
          "commandExecutionPolicy",
          "mainAgent",
          "subagent",
          "tools",
          "skills",
        ].includes(key)
      )
        warnings.push(
          `Campo ${key} não suportado e não importado. Revise antes de exportar.`,
        );
    for (const [p, s] of sources) {
      const rule = p.match(/^\.agents\/rules\/([^/]+)\.md$/);
      if (rule) {
        const { meta: m, body: b } = frontmatter(s);
        a.rules.push({
          id: rule[1],
          name: rule[1],
          description: text(m.description, "Regra importada do workspace."),
          content: b,
          trigger: m.trigger as AgentConfig["rules"][number]["trigger"],
          globs: text(m.globs ?? m.glob),
          enabled: true,
        });
      }
    }
    if (meta.skills !== undefined && !Array.isArray(meta.skills))
      throw new Error("A lista de skills é inválida.");
    for (const skillPath of (meta.skills ?? []) as unknown[]) {
      if (
        typeof skillPath !== "string" ||
        !/^skills\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillPath)
      )
        throw new Error(
          "Referência de skill não suportada. Use skills/nome-da-skill.",
        );
      const source = sources.get(`.agents/${skillPath}/SKILL.md`);
      if (!source)
        throw new Error(
          `Skill ausente: ${skillPath}. Importe o ZIP com suas dependências.`,
        );
      const { meta: m, body: b } = frontmatter(source);
      const id = skillPath.slice(7);
      if (m.name !== undefined && m.name !== id)
        throw new Error("O nome da skill difere de sua pasta.");
      a.skills.push({
        id,
        name: id,
        description: text(m.description),
        content: b,
        enabled: true,
      });
    }
    const mcp = sources.get(".agents/mcp_config.json");
    if (mcp) {
      const obj = JSON.parse(mcp);
      if (
        !obj.mcpServers ||
        typeof obj.mcpServers !== "object" ||
        Array.isArray(obj.mcpServers)
      )
        throw new Error("Configuração MCP inválida.");
      for (const [id, raw] of Object.entries(obj.mcpServers)) {
        const m = raw as Record<string, unknown>;
        if (!m || typeof m !== "object")
          throw new Error("Servidor MCP inválido.");
        if (
          Object.keys(m).some(
            (k) =>
              !["command", "args", "serverUrl", "url", "disabled"].includes(k),
          )
        )
          throw new Error(
            "O MCP contém opções não suportadas (como credenciais). Remova-as e configure-as localmente após a exportação.",
          );
        if (Boolean(m.command) === Boolean(m.serverUrl ?? m.url))
          throw new Error("Cada MCP deve definir exatamente um transporte.");
        a.mcpServers.push({
          id,
          transport: m.command ? "stdio" : "http",
          command: text(m.command),
          args: (m.args ?? []) as string[],
          serverUrl: text(m.serverUrl ?? m.url),
          enabled: m.disabled !== true,
        });
      }
    }
    const result = configSchema.safeParse(a);
    if (!result.success)
      throw new Error(
        `Configuração importada inválida: ${result.error.issues.map((i) => i.message).join(" ")}`,
      );
    agents.push(result.data);
  }
  if (!agents.length)
    throw new Error(
      "Nenhum agente encontrado. Use um .md de agente ou ZIP com .agents/agents/*.md.",
    );
  return { agents, warnings: [...new Set(warnings)] };
}
