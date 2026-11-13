import { afterEach, describe, it, expect } from "vitest";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../bridge/mcp";
import {
  approvePackFromUi,
  planMerge,
  readLibraryState,
  readStore,
  writeStore,
} from "../bridge/store";
import { createBridgeHttp } from "../bridge/http";
import { createAgent } from "../src/templates/catalog";
const dirs: string[] = [];
async function temp() {
  const dir = await mkdtemp(join(tmpdir(), "agent-studio-test-"));
  dirs.push(dir);
  return join(dir, "library.json");
}
afterEach(async () => {
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});
describe("ponte local", () => {
  it("lê arquivo ausente e salva biblioteca com revisão", async () => {
    const file = await temp();
    expect(await readStore(file)).toEqual({ agents: [], revision: "empty" });
    const a = createAgent();
    await writeStore(file, [a]);
    expect((await readStore(file)).agents).toEqual([a]);
    expect((await readStore(file)).revision).toMatch(/^[a-f0-9]{64}$/);
  });
  it("compara mudanças e preserva conjuntos não enviados", () => {
    const a = createAgent(),
      b = createAgent();
    const updated = { ...a, name: "Atualizado" };
    const merged = planMerge([a, b], [updated]);
    expect(merged.agents).toEqual([updated, b]);
    expect(merged.changed).toEqual(["Atualizado"]);
    expect(merged.added).toEqual([]);
  });
  it("expõe todas as 7 ferramentas MCP e mantém leitura pura sem alterar o JSON", async () => {
    const file = await temp();
    const a = createAgent("reviewer");
    a.model = "gemini-4-hydrogen-xhigh";
    await writeStore(file, [a]);
    const before = await readFile(file, "utf8");
    const server = createMcpServer(file);
    const client = new Client({ name: "integration-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name).sort()).toEqual([
        "create_agent",
        "export_pack_to_project",
        "get_pack",
        "get_studio_catalog",
        "list_packs",
        "update_agent",
        "validate_pack",
      ]);
      const byName = Object.fromEntries(tools.tools.map((t) => [t.name, t]));
      for (const ro of [
        "get_studio_catalog",
        "list_packs",
        "get_pack",
        "validate_pack",
      ]) {
        expect(byName[ro].annotations?.readOnlyHint).toBe(true);
      }
      for (const rw of [
        "create_agent",
        "update_agent",
        "export_pack_to_project",
      ]) {
        expect(byName[rw].annotations?.readOnlyHint).toBe(false);
      }
      const catalogRes = await client.callTool({
        name: "get_studio_catalog",
        arguments: {},
      });
      const catalog = JSON.parse(
        (catalogRes.content as { text: string }[])[0].text,
      );
      expect(catalog.validModelIds).toContain("gemini-4-hydrogen-xhigh");
      expect(catalog.toolNotes).toContain("call_mcp_tool");
      const list = await client.callTool({ name: "list_packs", arguments: {} });
      expect(
        JSON.parse((list.content as { text: string }[])[0].text)[0].id,
      ).toBe(a.id);
      const pack = await client.callTool({
        name: "get_pack",
        arguments: { id: a.id },
      });
      const parsedPack = JSON.parse(
        (pack.content as { text: string }[])[0].text,
      );
      expect(parsedPack.files[0].path).toBe(
        ".agents/agents/code-reviewer.md",
      );
      expect(
        parsedPack.files.some(
          (f: { path: string }) => f.path === "AGEX-SETUP.md",
        ),
      ).toBe(true);
      const validation = await client.callTool({
        name: "validate_pack",
        arguments: { id: a.id },
      });
      expect(
        JSON.parse((validation.content as { text: string }[])[0].text).valid,
      ).toBe(true);
      expect(await readFile(file, "utf8")).toBe(before);
    } finally {
      await client.close();
      await server.close();
    }
  });
  it("exige token e origem exata na configuração HTTP", () => {
    expect(() =>
      createBridgeHttp({
        file: "/tmp/not-written",
        token: "short",
        origin: "http://localhost:3000",
      }),
    ).toThrow();
    expect(() =>
      createBridgeHttp({
        file: "/tmp/not-written",
        token: "a".repeat(32),
        origin: "*",
      }),
    ).toThrow();
  });
  it("protege HTTP contra origem indevida, token errado, conflito e sincroniza após prévia", async () => {
    const file = await temp();
    const token = "test-only-token-".repeat(3);
    const origin = "http://localhost:3000";
    const server = createBridgeHttp({ file, token, origin });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;
    const a = createAgent();
    const backup = { format: "agent-studio", version: 1, agents: [a] };
    const request = (
      path: string,
      body: unknown,
      headers: Record<string, string> = {},
    ) =>
      fetch(base + path, {
        method: "POST",
        headers: {
          Origin: origin,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(body),
      });
    try {
      expect(
        (
          await request(
            "/preview",
            { backup },
            { Origin: "https://evil.example" },
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await request(
            "/preview",
            { backup },
            { Authorization: "Bearer wrong" },
          )
        ).status,
      ).toBe(401);
      expect(
        (await request("/sync", { backup, expectedRevision: "stale" })).status,
      ).toBe(409);
      expect((await readStore(file)).agents).toHaveLength(0);
      const preview = await request("/preview", { backup });
      const plan = await preview.json();
      expect(plan.added).toEqual([a.name]);
      expect((await readStore(file)).agents).toHaveLength(0);
      expect(
        (await request("/sync", { backup, expectedRevision: plan.revision }))
          .status,
      ).toBe(200);
      expect((await readStore(file)).agents).toEqual([a]);
      expect(
        (await request("/sync", { backup, expectedRevision: plan.revision }))
          .status,
      ).toBe(409);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
    }
  });
  it("cria agente pela IA em pending_review, bloqueia exportação até Dar OK e preserva mcp_config existente", async () => {
    const file = await temp();
    const projectDir = await mkdtemp(join(tmpdir(), "agent-studio-proj-"));
    dirs.push(projectDir);
    await mkdir(join(projectDir, ".agents"), { recursive: true });
    await writeFile(
      join(projectDir, ".agents", "mcp_config.json"),
      JSON.stringify(
        {
          mcpServers: {
            existing: { command: "echo", args: ["keep-me"] },
          },
        },
        null,
        2,
      ),
    );
    const server = createMcpServer(file);
    const client = new Client({ name: "ai-flow-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const createdRes = await client.callTool({
        name: "create_agent",
        arguments: {
          template: "reviewer",
          name: "Revisor Go",
          model: "gemini-4-hydrogen-high",
          mcpServers: [
            {
              id: "agent-studio",
              transport: "stdio",
              command: "node",
              args: ["cli.mjs"],
              enabled: true,
            },
          ],
          note: "Criado para backend Go",
        },
      });
      const created = JSON.parse(
        (createdRes.content as { text: string }[])[0].text,
      );
      expect(created.approvalStatus).toBe("pending_review");
      expect(created.slug).toBe("revisor-go");
      expect(created.filesPreview).toContain(".agents/agents/revisor-go.md");

      const blockedExport = await client.callTool({
        name: "export_pack_to_project",
        arguments: { id: created.id, projectPath: projectDir },
      });
      expect(blockedExport.isError).toBe(true);
      expect((blockedExport.content as { text: string }[])[0].text).toMatch(
        /Dar OK/i,
      );

      const stateBeforeOk = await readLibraryState(file);
      const savedAgent = stateBeforeOk.agents.find((x) => x.id === created.id)!;
      expect(savedAgent).toBeTruthy();

      const approved = await approvePackFromUi(file, savedAgent, {
        targetProject: projectDir,
      });
      expect(approved.conflict).toBe(false);
      if (approved.conflict) throw new Error("Conflito inesperado");
      expect(approved.review.effectiveStatus).toBe("approved");

      const exportedRes = await client.callTool({
        name: "export_pack_to_project",
        arguments: { id: created.id },
      });
      expect(exportedRes.isError).toBeFalsy();
      const exported = JSON.parse(
        (exportedRes.content as { text: string }[])[0].text,
      );
      expect(
        exported.files.some(
          (f: { path: string }) => f.path === ".agents/agents/revisor-go.md",
        ),
      ).toBe(true);
      expect(
        exported.files.find(
          (f: { path: string }) => f.path === ".agents/mcp_config.json",
        )?.action,
      ).toBe("merged");

      const agentMd = await readFile(
        join(projectDir, ".agents", "agents", "revisor-go.md"),
        "utf8",
      );
      expect(agentMd).toContain("model: inherit");
      expect(agentMd).toContain("Revisor Go");

      const setupGuide = await readFile(
        join(projectDir, "AGEX-SETUP.md"),
        "utf8",
      );
      expect(setupGuide).toContain("gemini-4-hydrogen-high");

      const mcpJson = JSON.parse(
        await readFile(join(projectDir, ".agents", "mcp_config.json"), "utf8"),
      );
      expect(mcpJson.mcpServers.existing).toEqual({
        command: "echo",
        args: ["keep-me"],
      });
      expect(mcpJson.mcpServers["agent-studio"]).toEqual({
        command: "node",
        args: ["cli.mjs"],
      });

      const updatedRes = await client.callTool({
        name: "update_agent",
        arguments: {
          id: created.id,
          instructions: "Sempre exigir testes de corrida com -race.",
        },
      });
      const updated = JSON.parse(
        (updatedRes.content as { text: string }[])[0].text,
      );
      expect(updated.approvalStatus).toBe("pending_review");

      const blockedAfterUpdate = await client.callTool({
        name: "export_pack_to_project",
        arguments: { id: created.id, projectPath: projectDir },
      });
      expect(blockedAfterUpdate.isError).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });
  it("serve GET /library?since=, aprova via HTTP, exporta para o projeto e bloqueia symlink", async () => {
    const file = await temp();
    const projectDir = await mkdtemp(join(tmpdir(), "agent-studio-http-proj-"));
    dirs.push(projectDir);
    const agent = createAgent("testing");
    await writeStore(file, [agent]);
    const token = "test-only-token-".repeat(3);
    const server = createBridgeHttp({
      file,
      token,
      origin: "https://studio.example",
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    const base = `http://127.0.0.1:${port}`;
    const headers = {
      Origin: "https://studio.example",
      Authorization: `Bearer ${token}`,
    };
    try {
      const lib1Res = await fetch(`${base}/library`, { headers });
      expect(lib1Res.status).toBe(200);
      const lib1 = await lib1Res.json();
      expect(lib1.changed).toBe(true);
      expect(lib1.agents).toHaveLength(1);

      const lib2Res = await fetch(
        `${base}/library?since=${encodeURIComponent(lib1.revision)}`,
        { headers },
      );
      expect(await lib2Res.json()).toEqual({
        changed: false,
        revision: lib1.revision,
      });

      const conflictApprove = await fetch(`${base}/approve`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: { ...agent, name: "Editado no Site" },
          targetProject: projectDir,
          expectedRevision: "wrong-revision",
        }),
      });
      expect(conflictApprove.status).toBe(409);

      const okApprove = await fetch(`${base}/approve`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: { ...agent, name: "Editado no Site" },
          targetProject: projectDir,
          expectedRevision: lib1.revision,
        }),
      });
      expect(okApprove.status).toBe(200);
      const approvedBody = await okApprove.json();
      expect(approvedBody.review.effectiveStatus).toBe("approved");

      const okExport = await fetch(`${base}/export`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ id: agent.id }),
      });
      expect(okExport.status).toBe(200);
      const exportBody = await okExport.json();
      expect(exportBody.projectPath).toBeTruthy();

      const outsideDir = await mkdtemp(join(tmpdir(), "agent-studio-outside-"));
      dirs.push(outsideDir);
      const symlinkProject = await mkdtemp(
        join(tmpdir(), "agent-studio-symlink-proj-"),
      );
      dirs.push(symlinkProject);
      await symlink(outsideDir, join(symlinkProject, ".agents"));

      await approvePackFromUi(file, { ...agent, name: "Editado no Site" });
      const blockedSymlink = await fetch(`${base}/export`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: agent.id,
          projectPath: symlinkProject,
        }),
      });
      expect(blockedSymlink.status).toBe(400);
      expect((await blockedSymlink.json()).error).toMatch(/Link simbólico/i);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
    }
  });
});

it("negocia o protocolo MCP usando o executável stdio real", async () => {
  const { StdioClientTransport } =
    await import("@modelcontextprotocol/sdk/client/stdio.js");
  const file = await temp();
  const a = createAgent();
  await writeStore(file, [a]);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      "--import",
      "tsx",
      join(process.cwd(), "bridge/cli.ts"),
      "--file",
      file,
    ],
    stderr: "pipe",
  });
  const client = new Client({ name: "stdio-smoke", version: "1.0.0" });
  try {
    await client.connect(transport);
    const response = await client.callTool({
      name: "list_packs",
      arguments: {},
    });
    expect(
      JSON.parse((response.content as { text: string }[])[0].text)[0].id,
    ).toBe(a.id);
  } finally {
    await client.close();
  }
});
