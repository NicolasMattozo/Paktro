import { describe, it, expect } from "vitest";
import { parse } from "yaml";
import JSZip from "jszip";
import {
  createAgent,
  TEMPLATES,
  RULES,
  SKILLS,
} from "../src/templates/catalog";
import { generateFiles } from "../src/generators/antigravity";
import { configSchema, warnings } from "../src/schemas/config";
import { createZip } from "../src/features/export";
import {
  parseBackup,
  serializeBackup,
  readLibrary,
  saveLibrary,
  MAX_IMPORT_BYTES,
} from "../src/storage/local";
import { migrateV1ToV2 } from "../src/platforms/common/convert";
const metadata = (content: string) =>
  parse(content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)![1]);
describe("gerador Antigravity", () => {
  it.each(TEMPLATES.map((t) => t.id))(
    "gera o template %s com metadados válidos e referências resolvidas",
    (id) => {
      const a = createAgent(id);
      const files = generateFiles(a);
      const agent = metadata(files[0].content);
      expect(agent.name).toBe(a.slug);
      expect(agent).not.toHaveProperty("ruleIds");
      expect(agent).not.toHaveProperty("permissions");
      for (const path of agent.skills ?? [])
        expect(files.some((f) => f.path === `.agents/${path}/SKILL.md`)).toBe(
          true,
        );
      for (const f of files) expect(f.path).not.toMatch(/\.\.|^\//);
      expect(files.every((f) => f.content.endsWith("\n"))).toBe(true);
    },
  );
  it("gera YAML seguro para descrições multilinha e sintaxe especial", () => {
    const a = createAgent();
    a.description = 'Revisar: código\n---\nname: outro\n"texto"';
    expect(metadata(generateFiles(a)[0].content).description).toBe(
      a.description,
    );
  });
  it("gera todos os modos de regras e metadados de skills", () => {
    const a = createAgent();
    a.rules = ["always_on", "model_decision", "glob", "manual"].map(
      (trigger, i) => ({
        ...RULES[0],
        id: `rule-${i}`,
        trigger: trigger as (typeof RULES)[number]["trigger"],
        globs: "*.ts, *.tsx",
      }),
    );
    a.skills = SKILLS;
    const files = generateFiles(a);
    for (const rule of a.rules) {
      const meta = metadata(
        files.find((f) => f.path.endsWith(`${rule.id}.md`))!.content,
      );
      expect(meta.trigger).toBe(rule.trigger);
      expect(meta.globs).toBe(
        rule.trigger === "glob" ? "*.ts, *.tsx" : undefined,
      );
    }
    for (const skill of SKILLS) {
      const meta = metadata(
        files.find((f) => f.path.endsWith(`${skill.id}/SKILL.md`))!.content,
      );
      expect(meta).toEqual({ name: skill.id, description: skill.description });
    }
    const pythonRule = {
      ...RULES[0],
      id: "python-files",
      trigger: "glob" as const,
      globs: "*.py, *.go, src/**",
    };
    const multiLang = createAgent("generic");
    multiLang.rules = [pythonRule];
    const multiLangMeta = metadata(
      generateFiles(multiLang).find((f) => f.path.endsWith("python-files.md"))!
        .content,
    );
    expect(multiLangMeta.globs).toBe("*.py, *.go, src/**");
  });
  it("omite itens desabilitados e não inclui MCP vazio", () => {
    const a = createAgent("reviewer");
    a.rules.forEach((r) => (r.enabled = false));
    a.skills.forEach((s) => (s.enabled = false));
    const files = generateFiles(a);
    expect(files).toHaveLength(1);
    expect(metadata(files[0].content)).not.toHaveProperty("skills");
  });
  it("gera MCP de workspace com transporte correto e sem IDs internos no frontmatter", () => {
    const a = createAgent();
    a.mcpServers = [
      {
        id: "local",
        transport: "stdio",
        command: "node",
        args: ["server.js"],
        serverUrl: "",
        enabled: true,
      },
      {
        id: "remote",
        transport: "http",
        command: "",
        args: [],
        serverUrl: "https://example.com/mcp",
        enabled: true,
      },
    ];
    const files = generateFiles(a);
    expect(JSON.parse(files.find((f) => f.kind === "mcp")!.content)).toEqual({
      mcpServers: {
        local: { command: "node", args: ["server.js"] },
        remote: { serverUrl: "https://example.com/mcp" },
      },
    });
    expect(metadata(files[0].content)).not.toHaveProperty("mcpServerIds");
    expect(metadata(files[0].content)).not.toHaveProperty("mcpServers");
  });
  it("produz conteúdos determinísticos", () => {
    const a = createAgent("frontend");
    expect(generateFiles(a)).toEqual(generateFiles(structuredClone(a)));
  });
  it.each(["../escape", "/tmp/pwn", "a/b", "a\\b", "", "a".repeat(65)])(
    "bloqueia nomes de arquivo inválidos %s",
    (slug) => {
      const a = createAgent();
      a.slug = slug;
      expect(() => generateFiles(a)).toThrow();
    },
  );
  it("recusa papéis desmarcados, referências duplicadas e regras glob vazias", () => {
    const a = createAgent();
    a.mainAgent = false;
    a.subagent = false;
    expect(configSchema.safeParse(a).success).toBe(false);
    a.mainAgent = true;
    a.rules = [{ ...RULES[0], trigger: "glob", globs: "" }];
    expect(configSchema.safeParse(a).success).toBe(false);
    a.rules = [RULES[0], RULES[0]];
    expect(configSchema.safeParse(a).success).toBe(false);
  });
  it("exibe conflitos, redundância e limitações de superfície", () => {
    const a = createAgent("reviewer");
    a.commandExecutionPolicy = "eager";
    a.rules.push({ ...RULES[0], id: "duplicate", trigger: "manual" });
    a.skills.push(SKILLS[1]);
    expect(warnings(a).length).toBeGreaterThanOrEqual(4);
  });
  it("exporta ZIP com os arquivos exatos da prévia e backup separado", async () => {
    const a = createAgent("frontend");
    const blob = await createZip(a);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(
      [...generateFiles(a).map((f) => f.path), "agex.json"].sort(),
    );
    for (const f of generateFiles(a))
      expect(await zip.file(f.path)!.async("string")).toBe(f.content);
    expect(
      parseBackup(await zip.file("agex.json")!.async("string")).agents,
    ).toEqual([migrateV1ToV2(a)]);
  });
});
describe("biblioteca local", () => {
  it("faz roundtrip de rascunhos, inclusive campos ainda incompletos", () => {
    const a = createAgent();
    a.name = "";
    a.description = "";
    expect(parseBackup(serializeBackup([a])).agents).toEqual([migrateV1ToV2(a)]);
  });
  it("recusa tamanho, versão, propriedades e tipos não suportados", () => {
    expect(() => parseBackup("x".repeat(MAX_IMPORT_BYTES + 1))).toThrow();
    expect(() => parseBackup("{")).toThrow();
    const backup = JSON.parse(serializeBackup([createAgent()]));
    backup.version = 9;
    expect(() => parseBackup(JSON.stringify(backup))).toThrow();
    backup.version = 1;
    backup.agents[0].tools = ["invented_tool"];
    expect(() => parseBackup(JSON.stringify(backup))).toThrow();
  });
  it("não destrói a biblioteca quando o conteúdo está corrompido", () => {
    const result = readLibrary({ getItem: () => "{broken" });
    expect(result.error).toBeTruthy();
    expect(result.agents).toEqual([]);
  });
  it("trata armazenamento cheio e indisponível", () => {
    expect(
      saveLibrary(
        {
          setItem: () => {
            throw new Error("QuotaExceededError");
          },
        },
        [createAgent()],
      ),
    ).toContain("Não foi possível salvar");
    expect(
      readLibrary({
        getItem: () => {
          throw new Error("SecurityError");
        },
      }).error,
    ).toBeTruthy();
  });
});

describe("catálogo ampliado de ferramentas", () => {
  it("valida e exporta todas as 21 ferramentas confirmadas sem limitar a quatro", async () => {
    const { TOOL_NAMES } = await import("../src/templates/tools");
    expect(TOOL_NAMES).toHaveLength(21);
    expect(new Set(TOOL_NAMES).size).toBe(21);
    const a = createAgent();
    a.tools = [...TOOL_NAMES];
    const files = generateFiles(a);
    expect(metadata(files[0].content).tools).toEqual([...TOOL_NAMES].sort());
    expect(
      parseBackup(serializeBackup([a])).agents[0].targets.antigravity?.tools,
    ).toEqual(
      TOOL_NAMES,
    );
  });
});

describe("modelos de sessão (Gemini, Orchestrator e Claude), universalidade e ponte", () => {
  it("exporta inherit no YAML e gera AGEX-SETUP.md para modelos de sessão (sem GPT)", async () => {
    const { MODEL_IDS, isSessionModel, modelLabel, sessionCommand } =
      await import("../src/templates/models");
    expect(MODEL_IDS).toContain("gemini-4-hydrogen-xhigh");
    expect(MODEL_IDS).toContain("gemini-4-argon-high");
    expect(MODEL_IDS).toContain("gemini-3.8-flash-high");
    expect(MODEL_IDS).toContain("gemini-pro-orchestrator-g1-pro");
    expect(MODEL_IDS).toContain("claude-opus-5-5-high");
    expect(MODEL_IDS).toContain("claude-sonnet-5-5-medium");
    expect(MODEL_IDS.some((id) => id.includes("gpt"))).toBe(false);

    for (const model of [
      "gemini-4-hydrogen-low",
      "gemini-4-hydrogen-medium",
      "gemini-4-hydrogen-high",
      "gemini-4-hydrogen-xhigh",
      "gemini-4-argon-low",
      "gemini-4-argon-medium",
      "gemini-4-argon-high",
      "gemini-3.8-flash-low",
      "gemini-3.8-flash-medium",
      "gemini-3.8-flash-high",
      "gemini-pro-orchestrator-g1-pro",
      "claude-opus-5-5-low",
      "claude-opus-5-5-medium",
      "claude-opus-5-5-high",
      "claude-sonnet-5-5-low",
      "claude-sonnet-5-5-medium",
      "claude-sonnet-5-5-high",
    ] as const) {
      expect(isSessionModel(model)).toBe(true);
      const a = createAgent("generic");
      a.model = model;
      const files = generateFiles(a);
      expect(metadata(files[0].content).model).toBe("inherit");
      const setup = files.find((f) => f.path === "AGEX-SETUP.md");
      expect(setup).toBeTruthy();
      expect(setup!.content).toContain(modelLabel(model));
      expect(setup!.content).toContain(sessionCommand(a.slug, model, true));

      const zip = await JSZip.loadAsync(await (await createZip(a)).arrayBuffer());
      expect(await zip.file("AGEX-SETUP.md")!.async("string")).toBe(
        setup!.content,
      );
      expect(
        parseBackup(await zip.file("agex.json")!.async("string"))
          .agents[0].targets.antigravity?.model,
      ).toBe(model);
    }

    for (const tier of ["inherit", "flash", "pro"] as const) {
      const a = createAgent("generic");
      a.model = tier;
      const files = generateFiles(a);
      expect(metadata(files[0].content).model).toBe(tier);
      expect(
        files.some((f) => f.path === "AGEX-SETUP.md"),
      ).toBe(false);
    }
  });

  it("mantém templates, regras e skills universais para qualquer linguagem", () => {
    const combined = JSON.stringify({ RULES, SKILLS, TEMPLATES });
    expect(combined).not.toMatch(/typescript|react|\.tsx?\b/i);
    expect(RULES.some((r) => r.id === "data-contracts")).toBe(true);
  });

  it("avisa ao incluir call_mcp_tool manualmente na lista tools do agente", () => {
    const a = createAgent("generic");
    expect(warnings(a).some((w) => w.includes("call_mcp_tool"))).toBe(false);
    a.tools = [...a.tools, "call_mcp_tool"];
    expect(warnings(a).some((w) => w.includes("call_mcp_tool"))).toBe(true);
  });

  it("gera configuração stdio e comando CLI da ponte para Linux/macOS e Windows", async () => {
    const { absolutePath, bridgeSetup } =
      await import("../src/features/bridge/setup");
    expect(absolutePath("/home/user/studio", "posix")).toBe(true);
    expect(absolutePath("relative/path", "posix")).toBe(false);
    expect(absolutePath("C:\\projetos\\studio", "windows")).toBe(true);

    const posix = bridgeSetup({
      directory: "/home/user/agex",
      library: "/home/user/agex.json",
      platform: "posix",
      origin: "http://localhost:3000",
      port: "4319",
    });
    expect(JSON.parse(posix.config).mcpServers.agex).toEqual({
      command: "node",
      args: [
        "/home/user/agex/bridge/dist/cli.mjs",
        "--file",
        "/home/user/agex.json",
      ],
    });
    expect(posix.cliCommand).toContain("agy mcp add agex -- node");

    const win = bridgeSetup({
      directory: "C:\\projetos\\agex\\",
      library: "C:\\Users\\dev\\agex.json",
      platform: "windows",
      origin: "http://localhost:3000",
      port: "4319",
    });
    expect(JSON.parse(win.config).mcpServers.agex.args[0]).toBe(
      "C:\\projetos\\agex\\bridge\\dist\\cli.mjs",
    );
    expect(win.install).toContain("Set-Location -LiteralPath");
  });

  it("mantém retrocompatibilidade com backups e localStorage legados do Agent Studio", () => {
    const a = createAgent(TEMPLATES[0].id);
    const legacyBackup = JSON.stringify({
      format: "agent-studio",
      version: 1,
      agents: [a],
    });
    expect(parseBackup(legacyBackup).agents).toHaveLength(1);

    const store = new Map<string, string>([
      ["agent-studio:library:v1", legacyBackup],
    ]);
    const read = readLibrary({
      getItem: (key) => store.get(key) ?? null,
    });
    expect(read.error).toBeUndefined();
    expect(read.agents).toHaveLength(1);
    expect(read.agents[0].common.id).toBe(a.id);
  });
});
