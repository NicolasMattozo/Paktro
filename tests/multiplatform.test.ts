import { afterEach, describe, it, expect } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import JSZip from "jszip";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../bridge/mcp";
import {
  approvePackFromUi,
  exportApprovedPack,
  ExportConflictError,
  readLibraryState,
  writeStore,
} from "../bridge/store";
import { createAgent, createPack } from "../src/templates/catalog";
import {
  convertPackTarget,
  migrateV1ToV2,
} from "../src/platforms/common/convert";
import { PLATFORM_ADAPTERS } from "../src/platforms/registry";
import {
  LEGACY_STORAGE_KEYS,
  parseBackup,
  readLibrary,
  saveLibrary,
  serializeBackup,
  STORAGE_KEY,
} from "../src/storage/local";
import { createZip } from "../src/features/export";
import { importFromRawFiles, importPlatform } from "../src/features/import";

const tempDirs: string[] = [];

async function makeTempDir(prefix = "agex-multi-"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const d of tempDirs.splice(0)) {
    await rm(d, { recursive: true, force: true });
  }
});

const frontmatterOf = (content: string) =>
  parseYaml(content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)![1]);

describe("adaptador Claude Code", () => {
  it("gera .claude/agents, rules (always vs paths:), skills (disable-model-invocation) e .mcp.json", () => {
    const pack = createPack("reviewer", "claude-code");
    pack.common.name = "Revisor: Especial";
    pack.common.description = "Multilinha:\n--- segura \"aqui\"";
    pack.common.rules = [
      {
        id: "sempre-usar",
        name: "Sempre ativa",
        description: "Base",
        content: "Regra incondicional.",
        activation: { type: "always" },
        enabled: true,
      },
      {
        id: "ts-only",
        name: "TypeScript",
        description: "Apenas TS",
        content: "Use tipos estritos.",
        activation: { type: "path", patterns: ["src/**/*.ts", "tests/*.ts"] },
        enabled: true,
      },
      {
        id: "sob-demanda",
        name: "Sob demanda",
        description: "Quando revisar SQL",
        content: "Cheque índices.",
        activation: { type: "automatic", description: "Quando revisar SQL" },
        enabled: true,
      },
      {
        id: "manual-cmd",
        name: "Manual",
        description: "Checklist manual",
        content: "Rode checklist completo.",
        activation: { type: "manual" },
        enabled: true,
      },
    ];
    pack.common.mcpServers = [
      {
        id: "local-mcp",
        transport: "stdio",
        command: "node",
        args: ["mcp.js"],
        serverUrl: "",
        enabled: true,
      },
      {
        id: "remote-mcp",
        transport: "http",
        command: "",
        args: [],
        serverUrl: "https://mcp.example.com/sse",
        enabled: true,
      },
    ];
    pack.targets.claudeCode = {
      exposure: "both",
      model: "sonnet",
      effort: "high",
      tools: ["Read", "Grep", "Glob"],
      disallowedTools: ["Bash"],
      permissionMode: "acceptEdits",
      isolation: "worktree",
      includeClaudeMd: true,
      referenceAgentsMd: true,
      disableModelInvocationSkills: ["review-checklist"],
    };

    const adapter = PLATFORM_ADAPTERS["claude-code"];
    const files = adapter.generate(pack);
    const paths = files.map((f) => f.path);

    expect(paths).toContain(".claude/agents/code-reviewer.md");
    expect(paths).toContain(".claude/rules/sempre-usar.md");
    expect(paths).toContain(".claude/rules/ts-only.md");
    expect(paths).toContain(".claude/skills/sob-demanda/SKILL.md");
    expect(paths).toContain(".claude/skills/manual-cmd/SKILL.md");
    expect(paths).toContain(".claude/skills/review-checklist/SKILL.md");
    expect(paths).toContain(".mcp.json");
    expect(paths).toContain("CLAUDE.md");

    // always rule has NO frontmatter
    const alwaysContent = files.find(
      (f) => f.path === ".claude/rules/sempre-usar.md",
    )!.content;
    expect(alwaysContent.startsWith("---")).toBe(false);

    // path rule has YAML paths: list
    const pathMeta = frontmatterOf(
      files.find((f) => f.path === ".claude/rules/ts-only.md")!.content,
    );
    expect(pathMeta.paths).toEqual(["src/**/*.ts", "tests/*.ts"]);

    // manual rule and opted-out skill set disable-model-invocation: true
    expect(
      frontmatterOf(
        files.find((f) => f.path === ".claude/skills/manual-cmd/SKILL.md")!
          .content,
      )["disable-model-invocation"],
    ).toBe(true);
    expect(
      frontmatterOf(
        files.find((f) => f.path === ".claude/skills/review-checklist/SKILL.md")!
          .content,
      )["disable-model-invocation"],
    ).toBe(true);

    // subagent metadata
    const agentMeta = frontmatterOf(
      files.find((f) => f.path === ".claude/agents/code-reviewer.md")!.content,
    );
    expect(agentMeta).toMatchObject({
      name: "code-reviewer",
      model: "sonnet",
      effort: "high",
      tools: ["Read", "Grep", "Glob"],
      disallowedTools: ["Bash"],
      permissionMode: "acceptEdits",
      isolation: "worktree",
    });

    // .mcp.json format uses type: "http" + url
    const mcpJson = JSON.parse(
      files.find((f) => f.path === ".mcp.json")!.content,
    );
    expect(mcpJson.mcpServers["remote-mcp"]).toEqual({
      type: "http",
      url: "https://mcp.example.com/sse",
    });
    expect(mcpJson.mcpServers["local-mcp"]).toEqual({
      type: "stdio",
      command: "node",
      args: ["mcp.js"],
    });

    // CLAUDE.md includes @AGENTS.md when opted in
    expect(files.find((f) => f.path === "CLAUDE.md")!.content).toContain(
      "@AGENTS.md",
    );
  });

  it("rejeita sobreposição entre tools e disallowedTools", () => {
    const pack = createPack("generic", "claude-code");
    pack.targets.claudeCode!.tools = ["Read", "Bash"];
    pack.targets.claudeCode!.disallowedTools = ["Bash"];
    expect(PLATFORM_ADAPTERS["claude-code"].validate(pack).valid).toBe(false);
  });
});

describe("adaptador OpenAI Codex", () => {
  it("gera .codex/agents/*.toml, AGENTS.md, .agents/skills e .codex/config.toml válidos", () => {
    const pack = createPack("frontend", "codex");
    pack.common.rules.push({
      id: "only-api",
      name: "API apenas",
      description: "Para rotas",
      content: "Valide schemas na API.",
      activation: { type: "path", patterns: ["api/**"] },
      enabled: true,
    });
    pack.common.mcpServers = [
      {
        id: "sqlite-db",
        transport: "stdio",
        command: "uvx",
        args: ["mcp-server-sqlite"],
        serverUrl: "",
        enabled: true,
      },
      {
        id: "docs-http",
        transport: "http",
        command: "",
        args: [],
        serverUrl: "https://docs.example.com/mcp",
        enabled: true,
      },
    ];
    pack.targets.codex = {
      exposure: "both",
      model: "gpt-5.4",
      reasoningEffort: "xhigh",
      shellTool: "disabled",
      includeAgentsMd: true,
    };

    const adapter = PLATFORM_ADAPTERS.codex;
    const files = adapter.generate(pack);
    const paths = files.map((f) => f.path);

    expect(paths).toContain("AGENTS.md");
    expect(paths).toContain(".codex/agents/frontend-developer.toml");
    expect(paths).toContain(".agents/skills/accessible-ui/SKILL.md");
    expect(paths).toContain(".codex/config.toml");
    // glob rule MUST NOT emit AGENTS.override.md at project root
    expect(paths).not.toContain("AGENTS.override.md");

    const agentToml = parseToml(
      files.find((f) => f.path === ".codex/agents/frontend-developer.toml")!
        .content,
    ) as Record<string, unknown>;
    expect(agentToml.name).toBe("frontend-developer");
    expect(agentToml.model).toBe("gpt-5.4");
    expect(agentToml.model_reasoning_effort).toBe("xhigh");
    expect(agentToml.features).toEqual({ shell_tool: false });

    const configToml = parseToml(
      files.find((f) => f.path === ".codex/config.toml")!.content,
    ) as { mcp_servers: Record<string, unknown> };
    expect(configToml.mcp_servers["sqlite-db"]).toEqual({
      command: "uvx",
      args: ["mcp-server-sqlite"],
    });
    expect(configToml.mcp_servers["docs-http"]).toEqual({
      url: "https://docs.example.com/mcp",
      enabled: true,
    });
  });

  it("nunca habilita shell_tool = true automaticamente", () => {
    const pack = createPack("testing", "codex");
    const files = PLATFORM_ADAPTERS.codex.generate(pack);
    const parsed = parseToml(
      files.find((f) => f.path === ".codex/agents/test-specialist.toml")!.content,
    );
    expect(parsed).not.toHaveProperty("features");
  });
});

describe("adaptador ChatGPT Plugin", () => {
  it("gera plugin.json, skills/*/SKILL.md e mcp.json com streamable-http", () => {
    const pack = createPack("security", "chatgpt-plugin");
    pack.common.mcpServers = [
      {
        id: "cloud-api",
        transport: "http",
        command: "",
        args: [],
        serverUrl: "https://api.example.com/mcp",
        enabled: true,
      },
    ];
    const files = PLATFORM_ADAPTERS["chatgpt-plugin"].generate(pack);
    const manifest = JSON.parse(
      files.find((f) => f.path === "plugin.json")!.content,
    );
    expect(manifest).toEqual({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "security-analyst",
      version: "1.0.0",
      description: pack.common.description,
      skills: "./skills/",
      mcpServers: "./mcp.json",
    });
    expect(files.some((f) => f.path === "skills/security-analyst/SKILL.md")).toBe(
      true,
    );
    const mcp = JSON.parse(files.find((f) => f.path === "mcp.json")!.content);
    expect(mcp.mcpServers["cloud-api"]).toEqual({
      type: "streamable-http",
      url: "https://api.example.com/mcp",
    });
  });

  it("bloqueia servidor MCP stdio local ativo em ChatGPT Plugin", () => {
    const pack = createPack("generic", "chatgpt-plugin");
    pack.common.mcpServers = [
      {
        id: "local-cli",
        transport: "stdio",
        command: "npx",
        args: ["mcp-local"],
        serverUrl: "",
        enabled: true,
      },
    ];
    const res = PLATFORM_ADAPTERS["chatgpt-plugin"].validate(pack);
    expect(res.valid).toBe(false);
    expect(res.blockers[0]).toMatch(/stdio/i);
  });
});

describe("conversão explícita e migração v1 -> v2", () => {
  it("não promove eager para bypassPermissions nem perde target anterior", () => {
    const v1 = createAgent("testing");
    v1.commandExecutionPolicy = "eager";
    const v2 = migrateV1ToV2(v1);

    const converted = convertPackTarget(v2, "claude-code");
    expect(converted.pack.targets.claudeCode?.permissionMode).toBe("default");
    expect(converted.losses.some((l) => l.includes("bypassPermissions"))).toBe(
      true,
    );
    // Antigravity config preserved in targets map
    expect(converted.pack.targets.antigravity?.commandExecutionPolicy).toBe(
      "eager",
    );
  });

  it("lê v1 (agex e agent-studio) do localStorage e persiste em v2 sem apagar a chave v1", () => {
    const v1Agent = createAgent("reviewer");
    const v1Json = JSON.stringify({
      format: "agent-studio",
      version: 1,
      agents: [v1Agent],
    });
    const mem = new Map<string, string>([[LEGACY_STORAGE_KEYS[1], v1Json]]);
    const read = readLibrary({ getItem: (k) => mem.get(k) ?? null });

    expect(read.error).toBeUndefined();
    expect(read.migratedFromKey).toBe(LEGACY_STORAGE_KEYS[1]);
    expect(read.agents).toHaveLength(1);
    expect(read.agents[0].schemaVersion).toBe(2);
    expect(read.agents[0].target).toBe("antigravity");

    const saveErr = saveLibrary(
      { setItem: (k, v) => mem.set(k, v) },
      read.agents,
    );
    expect(saveErr).toBeUndefined();
    expect(mem.get(LEGACY_STORAGE_KEYS[1])).toBe(v1Json);
    expect(mem.get(STORAGE_KEY)).toBeTruthy();
    expect(parseBackup(mem.get(STORAGE_KEY)!).version).toBe(2);
  });
});

describe("importação multiplataforma e resolução de ambiguidade", () => {
  it("detecta automaticamente ZIP do Claude Code, Codex e ChatGPT Plugin", async () => {
    for (const target of ["claude-code", "codex", "chatgpt-plugin"] as const) {
      const pack = createPack("reviewer", target);
      if (target !== "chatgpt-plugin") {
        pack.common.mcpServers = [
          {
            id: "db",
            transport: "stdio",
            command: "npx",
            args: ["srv"],
            serverUrl: "",
            enabled: true,
          },
        ];
      }
      const zipBlob = await createZip(pack);
      const imported = await importPlatform(
        new File([zipBlob], `${target}.zip`),
      );
      expect(imported.status).toBe("ok");
      if (imported.status === "ok") {
        expect(imported.target).toBe(target);
        expect(imported.packs[0].common.slug).toBe("code-reviewer");
      }
    }
  });

  it("pergunta destino em arquivos compartilhados (.mcp.json) e importa após escolha", () => {
    const raw = [
      {
        path: ".mcp.json",
        content: JSON.stringify({
          mcpServers: {
            secretMcp: {
              type: "stdio",
              command: "node",
              args: ["index.js"],
              env: { API_KEY: "should-strip" },
            },
          },
        }),
      },
    ];
    const first = importFromRawFiles(raw);
    expect(first.status).toBe("ambiguous");
    if (first.status === "ambiguous") {
      expect(first.candidateTargets).toContain("claude-code");
      const resolved = importFromRawFiles(first.files, "claude-code");
      expect(resolved.status).toBe("ok");
      if (resolved.status === "ok") {
        expect(resolved.warnings.some((w) => w.includes("ignorados"))).toBe(
          true,
        );
        expect(resolved.packs[0].common.mcpServers[0]).not.toHaveProperty(
          "env",
        );
      }
    }
  });
});

describe("exportação segura não destrutiva, órfãos e catálogo MCP por plataforma", () => {
  it("mescla .codex/config.toml via smol-toml preservando config anterior, protege AGENTS.md e detecta órfãos", async () => {
    const storeDir = await makeTempDir("agex-store-");
    const storeFile = join(storeDir, "library.json");
    const projectDir = await makeTempDir("agex-codex-proj-");

    await mkdir(join(projectDir, ".codex"), { recursive: true });
    await writeFile(
      join(projectDir, ".codex", "config.toml"),
      'model = "gpt-5.4"\n[mcp_servers.existing]\ncommand = "echo"\nargs = ["keep"]\n',
      "utf8",
    );
    await writeFile(join(projectDir, "AGENTS.md"), "# Projeto existente\n", "utf8");

    const pack = createPack("reviewer", "codex");
    pack.common.mcpServers = [
      {
        id: "new-mcp",
        transport: "stdio",
        command: "uvx",
        args: ["mcp-server"],
        serverUrl: "",
        enabled: true,
      },
    ];
    await writeStore(storeFile, [pack]);
    await approvePackFromUi(storeFile, pack, { targetProject: projectDir });

    // Existing AGENTS.md without managed markers triggers safe conflict stop
    await expect(
      exportApprovedPack(storeFile, { id: pack.common.id }),
    ).rejects.toBeInstanceOf(ExportConflictError);

    // Resolve explicitly by appending managed block
    const exported = await exportApprovedPack(storeFile, {
      id: pack.common.id,
      conflictResolution: "append-managed",
    });
    expect(exported.conflicts).toEqual([]);
    expect(exported.target).toBe("codex");

    // Existing AGENTS.md content preserved alongside <!-- AGEX:BEGIN pack=... -->
    const agentsMd = await readFile(join(projectDir, "AGENTS.md"), "utf8");
    expect(agentsMd).toContain("# Projeto existente");
    expect(agentsMd).toContain(`<!-- AGEX:BEGIN pack=${pack.common.id} -->`);

    // Existing .codex/config.toml preserved model & existing mcp_server
    const mergedToml = parseToml(
      await readFile(join(projectDir, ".codex", "config.toml"), "utf8"),
    ) as { model: string; mcp_servers: Record<string, unknown> };
    expect(mergedToml.model).toBe("gpt-5.4");
    expect(mergedToml.mcp_servers.existing).toEqual({
      command: "echo",
      args: ["keep"],
    });
    expect(mergedToml.mcp_servers["new-mcp"]).toEqual({
      command: "uvx",
      args: ["mcp-server"],
    });

    // Renaming slug leaves old .codex/agents/code-reviewer.toml as orphan without deleting automatically
    pack.common.slug = "code-auditor";
    await approvePackFromUi(storeFile, pack, { targetProject: projectDir });
    const afterRename = await exportApprovedPack(storeFile, {
      id: pack.common.id,
    });
    expect(afterRename.orphans).toContain(".codex/agents/code-reviewer.toml");
    // Still present on disk
    await expect(
      readFile(join(projectDir, ".codex", "agents", "code-reviewer.toml"), "utf8"),
    ).resolves.toBeTruthy();

    // Explicit opt-in removes orphan
    const cleaned = await exportApprovedPack(storeFile, {
      id: pack.common.id,
      cleanOrphans: true,
    });
    expect(cleaned.removedOrphans).toContain(
      ".codex/agents/code-reviewer.toml",
    );
  });

  it("invalida OK quando muda de plataforma e expõe catálogo por plataforma no MCP", async () => {
    const storeDir = await makeTempDir("agex-mcp-multi-");
    const storeFile = join(storeDir, "library.json");
    const projectDir = await makeTempDir("agex-mcp-proj-");

    const pack = createPack("reviewer", "claude-code");
    await writeStore(storeFile, [pack]);
    await approvePackFromUi(storeFile, pack, { targetProject: projectDir });

    // Switch target to codex without re-approving -> review becomes stale
    const switched = convertPackTarget(pack, "codex").pack;
    await writeStore(storeFile, [switched]);
    const state = await readLibraryState(storeFile);
    expect(state.reviews[pack.common.id].effectiveStatus).toBe("stale");
    await expect(
      exportApprovedPack(storeFile, { id: pack.common.id }),
    ).rejects.toThrow(/alterado|Dar OK/i);

    const server = createMcpServer(storeFile);
    const client = new Client({ name: "multi-test", version: "1.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);
    try {
      const claudeCat = JSON.parse(
        (
          (
            await client.callTool({
              name: "get_studio_catalog",
              arguments: { target: "claude-code" },
            })
          ).content as { text: string }[]
        )[0].text,
      );
      expect(claudeCat.validTools).toContain("Read");
      expect(claudeCat.validTools).not.toContain("view_file");
      expect(claudeCat.validModelIds).toContain("sonnet");

      const codexCat = JSON.parse(
        (
          (
            await client.callTool({
              name: "get_studio_catalog",
              arguments: { target: "codex" },
            })
          ).content as { text: string }[]
        )[0].text,
      );
      expect(codexCat.validModelIds).toContain("gpt-5.4");
      expect(codexCat.validTools).toEqual([]);
    } finally {
      await client.close();
      await server.close();
    }
  });
});

