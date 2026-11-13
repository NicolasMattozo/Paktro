import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcp";
import { createBridgeHttp } from "./http";

function defaultLibraryPath(): string {
  const agexFile = resolve(homedir(), ".agex/library.json");
  if (existsSync(agexFile)) return agexFile;
  const legacyFile = resolve(homedir(), ".agent-studio/library.json");
  return existsSync(legacyFile) ? legacyFile : agexFile;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    process.stdout.write(
      `Agex Bridge\n\nnode bridge/dist/cli.mjs [--file /caminho/agex.json]\nnode bridge/dist/cli.mjs --http --origin http://localhost:3000 [--port 4319] [--file /caminho/agex.json] [--auto-token]\n\nSem --http: servidor MCP stdio (get_studio_catalog, list_packs, get_pack, validate_pack, create_agent, update_agent, export_pack_to_project).\nCom --http: sincronização ao vivo e aprovação com o site no navegador; exige AGEX_BRIDGE_TOKEN (32+ caracteres) ou --auto-token.\nExportações diretas para projetos exigem aprovação prévia (Dar OK) do usuário no site Agex.\n`,
    );
    return;
  }
  let file = defaultLibraryPath(),
    http = false,
    autoToken = false,
    origin = "",
    port = 4319;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--http") {
      http = true;
      continue;
    }
    if (arg === "--auto-token") {
      autoToken = true;
      continue;
    }
    if (
      !["--file", "--origin", "--port"].includes(arg) ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      throw new Error("Argumento inválido. Consulte --help.");
    const value = args[++i];
    if (arg === "--file") file = resolve(value);
    if (arg === "--origin") origin = value;
    if (arg === "--port") port = Number(value);
  }
  if (http) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw new Error("Porta inválida.");
    let token =
      process.env.AGEX_BRIDGE_TOKEN ??
      process.env.AGENT_STUDIO_BRIDGE_TOKEN ??
      "";
    if (!token && autoToken) {
      token = randomBytes(32).toString("hex");
      process.stderr.write(`Token da ponte (cole na aba Ponte local): ${token}\n`);
    }
    const server = createBridgeHttp({
      file,
      token,
      origin,
    });
    server.on("error", (e) => {
      process.stderr.write(`Erro da ponte: ${e.message}\n`);
      process.exitCode = 1;
    });
    server.listen(port, "127.0.0.1", () =>
      process.stderr.write(
        `Agex Bridge em http://127.0.0.1:${port}. Origem autorizada: ${origin}. Biblioteca: ${file}\n`,
      ),
    );
    for (const signal of ["SIGINT", "SIGTERM"] as const)
      process.on(signal, () => server.close());
  } else {
    const server = createMcpServer(file);
    await server.connect(new StdioServerTransport());
  }
}

main().catch((e) => {
  process.stderr.write(`Erro: ${e.message}\n`);
  process.exitCode = 1;
});
