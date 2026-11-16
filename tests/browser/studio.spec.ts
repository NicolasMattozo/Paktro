import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
test("criar, editar, prévia, exportar, recarregar e importar backup", async ({
  page,
  baseURL,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith(baseURL ?? "http://127.0.0.1:3100") &&
      !r.url().startsWith("blob:")
    )
      external.push(r.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Seus agentes", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("library.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /Revisor de código.*Usar template/ })
    .click();
  await page.getByLabel(/^Nome do agente/).fill("Revisor do projeto");
  await page.getByRole("button", { name: /^Flash\b/, exact: false }).click();
  await page
    .getByLabel("Descrição")
    .fill("Revisa as mudanças do projeto com cuidado.");
  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: /Pré-visualização/ }).click();
  await expect(page.locator(".code-view")).toContainText("model: flash");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page
    .getByRole("button", { name: "Copiar conteúdo", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("model: flash");
  const fileEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar arquivo", exact: true })
    .click();
  const singleFile = await fileEvent;
  expect(singleFile.suggestedFilename()).toBe("code-reviewer.md");
  expect(await readFile((await singleFile.path())!, "utf8")).toContain(
    "model: flash",
  );
  const zipEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar ZIP", exact: true })
    .first()
    .click();
  const zipDownload = await zipEvent;
  const zip = await JSZip.loadAsync(
    await readFile((await zipDownload.path())!),
  );
  expect(Object.keys(zip.files)).toContain(".agents/agents/code-reviewer.md");
  expect(
    await zip.file(".agents/agents/code-reviewer.md")!.async("string"),
  ).toContain("model: flash");
  const backupEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Backup JSON", exact: true }).click();
  const backup = await backupEvent;
  const backupPath = (await backup.path())!;
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Revisor do projeto", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Editar Revisor do projeto", exact: true })
    .click();
  await expect(page.getByLabel(/^Nome do agente/)).toHaveValue(
    "Revisor do projeto",
  );
  await page.getByRole("button", { name: "Meus agentes", exact: true }).click();
  await page
    .getByLabel("Selecionar backup JSON", { exact: true })
    .setInputFiles(backupPath);
  await expect(
    page.getByRole("heading", { name: "Revisor do projeto", exact: true }),
  ).toHaveCount(2);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
test("regras, skills, MCP e validação imediata", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Criar agente", exact: true }).click();
  await page.getByLabel("Nome do arquivo").fill("../fora");
  await expect(
    page.getByRole("button", { name: "Exportar ZIP", exact: true }).first(),
  ).toBeDisabled();
  await page.getByLabel("Nome do arquivo").fill("meu-agente");
  await page.getByRole("button", { name: "3 Regras e skills" }).click();
  await page.getByRole("button", { name: "Criar regra", exact: true }).click();
  await page.getByText("Minha regra", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Título da regra", exact: true })
    .fill("Regra do time");
  await page
    .getByRole("combobox", { name: "Ativação", exact: true })
    .selectOption("glob");
  await page.getByLabel("Padrões de arquivos").fill("*.tsx");
  await page.getByRole("button", { name: "Criar skill", exact: true }).click();
  await page.getByText("Minha skill", { exact: true }).click();
  await page.getByLabel("Título da skill").fill("Procedimento do time");
  await page.getByRole("button", { name: "4 Integrações" }).click();
  await expect(
    page.getByRole("heading", { name: "Como conectar um servidor MCP ao agente" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Adicionar servidor MCP" }).click();
  await page.getByLabel("Identificador do servidor").fill("sqlite-db");
  await page.getByLabel("Comando", { exact: true }).fill("uvx");
  await page.getByLabel("Argumentos").fill("mcp-server-sqlite");
  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: /Pré-visualização/ }).click();
  await page
    .getByRole("button", { name: ".agents/mcp_config.json", exact: true })
    .click();
  await expect(page.locator(".code-view")).toContainText("sqlite-db");
  await expect(page.locator(".code-view")).toContainText("uvx");
  await expect(page.locator(".code-view")).toContainText("mcp-server-sqlite");
  await page.screenshot({
    path: testInfo.outputPath("editor.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("duplicar, buscar, comparar e excluir", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Criar agente", exact: true }).click();
  await page.getByLabel(/^Nome do agente/).fill("Meu especialista");
  await page.getByRole("button", { name: "Meus agentes", exact: true }).click();
  await page
    .getByRole("button", { name: "Duplicar Meu especialista", exact: true })
    .click();
  await page.getByRole("button", { name: "Meus agentes", exact: true }).click();
  await page
    .getByRole("button", { name: "Comparar agentes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("textbox", { name: "Buscar agentes" }).fill("cópia");
  await expect(page.locator(".agent-card")).toHaveCount(1);
  await page
    .getByRole("button", {
      name: "Excluir Meu especialista (cópia)",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.locator(".agent-card")).toHaveCount(1);
  await page
    .getByRole("button", {
      name: "Excluir Meu especialista (cópia)",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Excluir agente", exact: true })
    .click();
  await page.getByRole("button", { name: "Limpar busca" }).click();
  await expect(page.locator(".agent-card")).toHaveCount(1);
});
test("preserva armazenamento corrompido e permite continuar em memória", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("agex:library:v1", "corrompido"),
  );
  await page.goto("/");
  await expect(page.locator(".banner[role=alert]")).toContainText(
    "preservados",
  );
  await page.getByRole("button", { name: "Criar agente", exact: true }).click();
  await page.getByLabel(/^Nome do agente/).fill("Em memória");
  expect(
    await page.evaluate(() => localStorage.getItem("agex:library:v1")),
  ).toBe("corrompido");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Backup JSON", exact: true }).click();
  expect((await downloadEvent).suggestedFilename()).toBe("my-agent.json");
});

test("acessibilidade e navegação por teclado nas telas principais", async ({
  page,
}, testInfo) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Seus agentes", exact: true }),
  ).toBeVisible();
  const library = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    library.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  await page.getByRole("button", { name: "Criar agente", exact: true }).click();
  const editor = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    editor.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => document.activeElement !== document.body),
  ).toBe(true);
});

test("catálogo de ferramentas com busca, seleção e exportação", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Criar agente", exact: true }).click();
  await page.getByRole("button", { name: "2 Ferramentas" }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(21);
  await page
    .getByRole("textbox", { name: "Buscar ferramentas" })
    .fill("search_web");
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  await page.getByRole("checkbox", { name: /Pesquisar na web/ }).check();
  await page.getByRole("textbox", { name: "Buscar ferramentas" }).fill("");
  await page.getByRole("checkbox", { name: /Criar arquivos/ }).check();
  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: /Pré-visualização/ }).click();
  await expect(page.locator(".code-view")).toContainText("search_web");
  await expect(page.locator(".code-view")).toContainText("write_to_file");
});

test("ponte solicita prévia e só sincroniza após confirmação explícita", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Criar agente", exact: true }).click();
  await page.getByRole("button", { name: "Meus agentes", exact: true }).click();
  const actions: string[] = [];
  await page.route("http://127.0.0.1:4319/**", async (route) => {
    const action = new URL(route.request().url()).pathname;
    actions.push(action);
    await route.fulfill({
      json:
        action === "/preview"
          ? {
              revision: "empty",
              added: ["Agente genérico"],
              changed: [],
              unchanged: 0,
            }
          : { ok: true },
    });
  });
  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("button", { name: "Ponte local", exact: true }).click();
  await page.getByLabel("Token da ponte").fill("test-only-token-".repeat(3));
  expect(actions).toEqual([]);
  await page.getByRole("button", { name: "Conferir mudanças" }).click();
  await expect(
    page.getByRole("button", { name: "Confirmar sincronização" }),
  ).toBeVisible();
  expect(actions).toEqual(["/preview"]);
  await page.getByRole("button", { name: "Confirmar sincronização" }).click();
  await expect(page.getByRole("status")).toContainText("sincronizadas");
  expect(actions).toEqual(["/preview", "/sync"]);
});

test("modelos Gemini 4 Hydrogen e Argon na identidade e guia MCP na ponte", async ({
  page,
}, testInfo) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  await page.goto("/");
  await page.getByRole("button", { name: "Criar agente", exact: true }).click();
  await page.getByText("Preferência de sessão (opcional)").click();
  await page
    .getByRole("button", { name: /Gemini 4 Hydrogen/, exact: false })
    .click();
  await page
    .getByLabel("Nível de raciocínio")
    .selectOption("gemini-4-hydrogen-xhigh");
  await expect(
    page.getByLabel("Comando para ativar o modelo no CLI", { exact: true }),
  ).toContainText("agy --agent my-agent --model gemini-4-hydrogen-xhigh");
  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: /Pré-visualização/ }).click();
  await expect(
    page.getByRole("button", { name: "AGEX-SETUP.md", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "AGEX-SETUP.md", exact: true })
    .click();
  await expect(page.locator(".code-view")).toContainText(
    "gemini-4-hydrogen-xhigh",
  );
  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: /^Editor$/ }).click();

  await page
    .getByRole("button", { name: /Gemini 4 Argon/, exact: false })
    .click();
  await expect(
    page.getByLabel("Comando para ativar o modelo no CLI", { exact: true }),
  ).toContainText("agy --agent my-agent --model gemini-4-argon-high");

  await page
    .getByRole("button", { name: /Gemini 3\.8 Flash/, exact: false })
    .click();
  await page
    .getByLabel("Nível de raciocínio")
    .selectOption("gemini-3.8-flash-low");
  await expect(
    page.getByLabel("Comando para ativar o modelo no CLI", { exact: true }),
  ).toContainText("agy --agent my-agent --model gemini-3.8-flash-low");

  await page
    .getByRole("button", { name: /Orchestrator \(Argon\)/, exact: false })
    .click();
  await expect(page.getByLabel("Nível de raciocínio")).toHaveCount(0);
  await expect(
    page.getByLabel("Comando para ativar o modelo no CLI", { exact: true }),
  ).toContainText("agy --agent my-agent --model gemini-pro-orchestrator-g1-pro");

  await page
    .getByRole("button", { name: /Claude Opus 5\.5/, exact: false })
    .click();
  await page
    .getByLabel("Nível de raciocínio")
    .selectOption("claude-opus-5-5-medium");
  await expect(
    page.getByLabel("Comando para ativar o modelo no CLI", { exact: true }),
  ).toContainText("agy --agent my-agent --model claude-opus-5-5-medium");

  await page
    .getByRole("button", { name: /Claude Sonnet 5\.5/, exact: false })
    .click();
  await page
    .getByLabel("Nível de raciocínio")
    .selectOption("claude-sonnet-5-5-high");
  await expect(
    page.getByLabel("Comando para ativar o modelo no CLI", { exact: true }),
  ).toContainText("agy --agent my-agent --model claude-sonnet-5-5-high");
  await expect(
    page
      .locator(".model-picker")
      .getByRole("button", { name: /GPT/i, exact: false }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "4 Integrações" }).click();
  const integrationsA11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(integrationsA11y.violations).toEqual([]);

  await page.getByRole("button", { name: "Meus agentes", exact: true }).click();
  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("button", { name: "Ponte local", exact: true }).click();
  await page
    .getByLabel("Pasta do Agex no seu computador")
    .fill("/home/dev/agex");
  await expect(
    page.locator(".bridge-walkthrough .warning"),
  ).toHaveCount(0);
  await page
    .getByLabel("Caminho completo da biblioteca JSON")
    .fill("/home/dev/agex.json");
  await expect(
    page.getByLabel("Alternativa rápida pelo CLI (agy mcp add)", {
      exact: true,
    }),
  ).toContainText(
    "agy mcp add agex -- node '/home/dev/agex/bridge/dist/cli.mjs' --file '/home/dev/agex.json'",
  );
  const bridgeA11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(bridgeA11y.violations).toEqual([]);
});

test("fluxo completo via ponte MCP ao vivo: IA cria agente, usuário dá OK e exporta direto", async ({
  page,
}, testInfo) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const aiId = "11111111-1111-4111-8111-111111111111";
  const aiAgent = {
    id: aiId,
    name: "Especialista Go",
    slug: "especialista-go",
    description: "Revisão idiomática de backend em Go.",
    specialty: "Backend em Go",
    goal: "Garantir concorrência segura e testes claros em Go.",
    instructions: "Verifique goroutines, erros e testes com -race.",
    model: "gemini-4-hydrogen-high",
    mainAgent: true,
    subagent: true,
    tools: ["view_file", "grep_search"],
    commandExecutionPolicy: "off",
    rules: [],
    skills: [],
    mcpServers: [],
    tags: ["go", "backend"],
    updatedAt: "2026-11-12T12:00:00.000Z",
  };
  let revision = "rev-ai-1";
  let reviewState: {
    status: "pending_review" | "approved";
    effectiveStatus: "pending_review" | "approved" | "stale";
    source: "ai" | "studio";
    note?: string;
    targetProject?: string;
    approvedHash?: string;
    updatedAt: string;
    approvedAt?: string;
  } = {
    status: "pending_review",
    effectiveStatus: "pending_review",
    source: "ai",
    note: "Criado para API Go",
    updatedAt: "2026-11-12T12:00:00.000Z",
  };
  const calls: Array<{ method: string; path: string; body: unknown }> = [];

  await page.route("http://127.0.0.1:4319/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const raw = req.postData();
    const body = raw ? JSON.parse(raw) : null;
    calls.push({ method: req.method(), path: url.pathname, body });

    if (req.method() === "GET" && url.pathname === "/library") {
      if (url.searchParams.get("since") === revision) {
        await route.fulfill({ json: { changed: false, revision } });
        return;
      }
      await route.fulfill({
        json: {
          changed: true,
          revision,
          agents: [aiAgent],
          reviews: { [aiId]: reviewState },
        },
      });
      return;
    }
    if (req.method() === "POST" && url.pathname === "/approve") {
      revision = "rev-ai-2";
      reviewState = {
        status: "approved",
        effectiveStatus: "approved",
        source: "ai",
        note: "Criado para API Go",
        targetProject: body.targetProject,
        approvedHash: "approved-hash",
        updatedAt: "2026-11-12T12:05:00.000Z",
        approvedAt: "2026-11-12T12:05:00.000Z",
      };
      await route.fulfill({
        json: {
          ok: true,
          id: aiId,
          revision,
          review: reviewState,
        },
      });
      return;
    }
    if (req.method() === "POST" && url.pathname === "/export") {
      await route.fulfill({
        json: {
          ok: true,
          id: aiId,
          name: aiAgent.name,
          slug: aiAgent.slug,
          projectPath: body.projectPath,
          files: [
            { path: ".agents/agents/especialista-go.md", action: "created" },
          ],
        },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { error: "not mocked" } });
  });

  await page.goto("/");
  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("button", { name: "Ponte local", exact: true }).click();
  await page.getByLabel("Token da ponte").fill("test-only-token-".repeat(3));
  await page.getByRole("button", { name: /Conectar ao vivo/ }).click();

  await expect(page.getByText("Especialista Go")).toBeVisible();
  const bridgeOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(bridgeOverflow).toBe(true);

  await page.getByRole("button", { name: /Revisar e dar OK/ }).click();
  await expect(
    page.getByText("Agente enviado pela IA — revise e dê o OK para exportar"),
  ).toBeVisible();
  await expect(page.getByText("Nota da IA: Criado para API Go")).toBeVisible();

  const pendingA11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(pendingA11y.violations).toEqual([]);

  await page
    .getByLabel("Pasta do projeto de destino (opcional)")
    .fill("/tmp/projeto-go");
  await page
    .getByRole("button", { name: "Dar OK (aprovar para exportar)" })
    .click();

  await expect(
    page.getByText("Aprovado para exportar no projeto"),
  ).toBeVisible();
  const exportBtn = page.getByRole("button", {
    name: "Exportar direto para a pasta",
  });
  await expect(exportBtn).toBeVisible();

  const approvedA11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(approvedA11y.violations).toEqual([]);

  const editorOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(editorOverflow).toBe(true);

  await exportBtn.click();
  await expect(page.getByRole("status")).toContainText(
    "Exportado para /tmp/projeto-go (1 arquivo(s)).",
  );

  expect(calls.some((c) => c.path === "/approve")).toBe(true);
  const approveCall = calls.find((c) => c.path === "/approve");
  expect((approveCall?.body as { targetProject?: string }).targetProject).toBe(
    "/tmp/projeto-go",
  );
  const exportCall = calls.find((c) => c.path === "/export");
  expect((exportCall?.body as { projectPath?: string }).projectPath).toBe(
    "/tmp/projeto-go",
  );
});

test("multiplataforma: Claude Code, Codex e ChatGPT Plugin no editor, prévia e exportação ZIP", async ({
  page,
  baseURL,
}, testInfo) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith(baseURL ?? "http://127.0.0.1:3100") &&
      !r.url().startsWith("blob:")
    ) {
      external.push(r.url());
    }
  });

  const showPreview = async () => {
    const tab = page.getByRole("button", { name: /^Pré-visualização/ });
    if (await tab.isVisible()) await tab.click();
  };
  const showEditor = async () => {
    const tab = page.getByRole("button", { name: /^Editor/ });
    if (await tab.isVisible()) await tab.click();
  };

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Configure uma vez/ }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: /Revisor de código.*Usar template/ })
    .click();

  // 1. Switch to Claude Code
  await page.getByRole("button", { name: /Claude Code/ }).click();
  await expect(page.getByRole("status")).toContainText(
    /Conversão Antigravity → Claude Code/,
  );
  await page.getByRole("button", { name: /^Opus \(alias oficial\)/ }).click();
  await page.getByLabel(/Nível de esforço/).selectOption("high");

  // Add HTTP MCP server
  await page.getByRole("button", { name: /4\s*Integrações/ }).click();
  await page.getByRole("button", { name: /Adicionar servidor MCP/ }).click();
  await page.getByLabel("Identificador do servidor").fill("github-remote");
  await page.getByLabel("Transporte").selectOption("http");
  await page
    .getByLabel("URL do servidor")
    .fill("https://mcp.example.com/github");

  const ccOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(ccOverflow).toBe(true);
  const ccA11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(ccA11y.violations).toEqual([]);

  await showPreview();
  await expect(page.getByText("Estrutura validada • Claude Code")).toBeVisible();
  await expect(
    page.getByRole("button", { name: ".claude/agents/code-reviewer.md" }),
  ).toBeVisible();
  await page.getByRole("button", { name: ".mcp.json" }).click();
  await expect(page.getByLabel("Conteúdo do arquivo")).toContainText(
    '"type": "http"',
  );

  await page.screenshot({
    path: testInfo.outputPath("claude-code-editor.png"),
    fullPage: true,
  });

  const [ccDownload] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("complementary", { name: "Pré-visualização" })
      .getByRole("button", { name: "Exportar ZIP" })
      .click(),
  ]);
  const ccZip = await JSZip.loadAsync(
    await readFile((await ccDownload.path())!),
  );
  expect(Object.keys(ccZip.files)).toContain(".claude/agents/code-reviewer.md");
  expect(Object.keys(ccZip.files)).toContain(".mcp.json");
  expect(Object.keys(ccZip.files)).toContain("agex.json");

  // 2. Switch to OpenAI Codex
  await showEditor();
  await page.getByRole("button", { name: /1\s*Identidade/ }).click();
  await page.getByRole("button", { name: /Codex em projeto/ }).click();
  await expect(page.getByRole("status")).toContainText(/Conversão.*Codex/);
  await page.getByRole("button", { name: /gpt-5\.4-mini/i }).click();
  await page.getByLabel(/Esforço de raciocínio/).selectOption("high");

  const cxA11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(cxA11y.violations).toEqual([]);
  const cxOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(cxOverflow).toBe(true);

  await showPreview();
  await expect(page.getByText("Estrutura validada • OpenAI Codex")).toBeVisible();
  await expect(page.getByRole("button", { name: "AGENTS.md" })).toBeVisible();
  await page
    .getByRole("button", { name: ".codex/agents/code-reviewer.toml" })
    .click();
  await expect(page.getByLabel("Conteúdo do arquivo")).toContainText(
    'model = "gpt-5.4-mini"',
  );
  await page.screenshot({
    path: testInfo.outputPath("codex-editor.png"),
    fullPage: true,
  });

  // 3. Switch to ChatGPT Plugin + stdio warning check
  await showEditor();
  await page.getByRole("button", { name: /1\s*Identidade/ }).click();
  await page
    .getByRole("button", { name: /Skill \/ plugin para ChatGPT/ })
    .click();
  await expect(page.getByRole("status")).toContainText(/ChatGPT/);
  await expect(
    page.getByText(/não fixam modelo de IDE no/i),
  ).toBeVisible();

  await page.getByRole("button", { name: /4\s*Integrações/ }).click();
  await page.getByLabel("Transporte").selectOption("stdio");
  await page.getByLabel("Comando").fill("npx");

  const gpOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(gpOverflow).toBe(true);
  const gpA11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(gpA11y.violations).toEqual([]);

  await showPreview();
  await expect(page.getByText(/stdio/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "plugin.json" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "skills/code-reviewer/SKILL.md" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("chatgpt-plugin-editor.png"),
    fullPage: true,
  });

  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
