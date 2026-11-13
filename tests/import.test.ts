import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { importAntigravity } from "../src/features/import";
import { createAgent } from "../src/templates/catalog";
import { createZip } from "../src/features/export";
import { generateFiles } from "../src/generators/antigravity";
describe("importação Antigravity", () => {
  it("reconstrói agente, regras, skills e MCP a partir de ZIP", async () => {
    const a = createAgent("frontend");
    a.mcpServers = [
      {
        id: "docs",
        transport: "http",
        serverUrl: "https://example.com/mcp",
        command: "",
        args: [],
        enabled: true,
      },
    ];
    const blob = await createZip(a);
    const result = await importAntigravity(new File([blob], "agent.zip"));
    expect(result.agents).toHaveLength(1);
    const imported = result.agents[0];
    expect(imported.tools).toEqual([...a.tools].sort());
    expect(imported.rules.map((r) => r.id).sort()).toEqual(
      a.rules.map((r) => r.id).sort(),
    );
    expect(imported.skills.map((s) => s.id).sort()).toEqual(
      a.skills.map((s) => s.id).sort(),
    );
    expect(imported.mcpServers).toEqual(a.mcpServers);
    expect(imported.instructions).toContain(a.goal);
  });
  it("importa Markdown sem dependências", async () => {
    const a = createAgent();
    a.rules = [];
    const content = generateFiles(a)[0].content;
    expect(
      (await importAntigravity(new File([content], "agent.md"))).agents[0].slug,
    ).toBe(a.slug);
  });
  it("recusa skills ausentes e ferramentas desconhecidas", async () => {
    const a = createAgent("frontend");
    const content = generateFiles(a)[0].content;
    await expect(
      importAntigravity(new File([content], "agent.md")),
    ).rejects.toThrow("Skill ausente");
    await expect(
      importAntigravity(
        new File([content.replace("view_file", "imaginary_tool")], "agent.md"),
      ),
    ).rejects.toThrow("ferramentas");
  });
  it("rejeita traversal em ZIP antes de reconstruir arquivos", async () => {
    const z = new JSZip();
    z.file("../escape.md", "texto");
    await expect(
      importAntigravity(
        new File([await z.generateAsync({ type: "arraybuffer" })], "evil.zip"),
      ),
    ).rejects.toThrow("inseguro");
  });
  it("rejeita ZIP muito comprimido que ultrapassa limite expandido", async () => {
    const z = new JSZip();
    z.file(".agents/agents/a.md", "a".repeat(1024 * 1024 + 1));
    await expect(
      importAntigravity(
        new File(
          [
            await z.generateAsync({
              type: "arraybuffer",
              compression: "DEFLATE",
            }),
          ],
          "bomb.zip",
        ),
      ),
    ).rejects.toThrow("1 MB");
  });
  it("importa ZIP gerado com modelo Hydrogen e AGEX-SETUP.md sem erro", async () => {
    const a = createAgent("testing");
    a.model = "gemini-4-hydrogen-xhigh";
    const blob = await createZip(a);
    const result = await importAntigravity(new File([blob], "hydrogen.zip"));
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].slug).toBe(a.slug);
    expect(result.agents[0].model).toBe("inherit");
  });
  it("recusa YAML inválido, aliases e propriedades duplicadas", async () => {
    for (const content of [
      "sem frontmatter",
      "---\nname: a\nname: b\n---\ntext",
      "---\nname: &a my-agent\ndescription: *a\n---\ntext",
    ])
      await expect(
        importAntigravity(new File([content], "agent.md")),
      ).rejects.toThrow();
  });
});
