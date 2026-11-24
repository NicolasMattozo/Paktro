import { useEffect, useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import {
  absolutePath,
  bridgeSetup,
  type SetupPlatform,
} from "@/features/bridge/setup";
import { serializeBackup } from "@/storage/local";
import { download } from "@/features/export";
import type { AgentPackV2 } from "@/types";
import CodeSnippet from "./ui/code-snippet";

const EXAMPLE_MCP_CONFIG = `{
  "mcpServers": {
    "paktro": {
      "command": "node",
      "args": [
        "/caminho/paktro/bridge/dist/cli.mjs",
        "--file",
        "/caminho/paktro.json"
      ]
    }
  }
}`;

export default function BridgeSetup({
  agents,
  port,
}: {
  agents: AgentPackV2[];
  port: string;
}) {
  const [platform, setPlatform] = useState<SetupPlatform>("posix");
  const [directory, setDirectory] = useState("");
  const [library, setLibrary] = useState("");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  let setup: ReturnType<typeof bridgeSetup> | undefined;
  let error = "";
  if (directory && library && origin) {
    try {
      setup = bridgeSetup({ directory, library, platform, origin, port });
    } catch (e) {
      error = (e as Error).message;
    }
  } else if (directory && !absolutePath(directory, platform)) {
    error = "Informe um caminho absoluto para a pasta do Paktro.";
  } else if (library && !absolutePath(library, platform)) {
    error = "Informe um caminho absoluto para o arquivo da biblioteca JSON.";
  }
  return (
    <section className="bridge-card bridge-walkthrough">
      <h2>Conectar IA (MCP) ao Paktro no navegador</h2>
      <p>
        A ponte conecta seu Antigravity diretamente ao site Paktro: você pede
        para a IA criar agentes no Paktro, confere e ajusta tudo por aqui, clica
        em <strong>Dar OK (aprovar para exportar)</strong> e a IA grava os
        arquivos direto no seu projeto. Funciona para projetos de qualquer
        linguagem.{" "}
        <strong>Node.js 22+ é necessário apenas para executar a ponte</strong>,
        não para a aplicação que seu agente vai desenvolver.
      </p>
      <div className="bridge-flow" aria-label="Fluxo da conexão">
        <span>IA no Antigravity (MCP)</span>
        <span aria-hidden="true">↔</span>
        <span>Ponte local + Biblioteca JSON</span>
        <span aria-hidden="true">↔</span>
        <span>Revisão e OK no Paktro</span>
        <span aria-hidden="true">→</span>
        <span>Exportação direta no projeto</span>
      </div>
      <div className="setup-paths">
        <label className="field">
          Seu terminal
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as SetupPlatform)}
          >
            <option value="posix">Linux ou macOS — Bash/Zsh</option>
            <option value="windows">Windows — PowerShell</option>
          </select>
        </label>
        <label className="field">
          Pasta do Paktro no seu computador
          <input
            value={directory}
            onChange={(e) => setDirectory(e.target.value)}
            placeholder={
              platform === "windows"
                ? "C:\\projetos\\paktro"
                : "/home/seu-usuario/paktro"
            }
          />
          <small>
            A pasta que contém o package.json deste gerador. Não é a pasta do
            projeto que receberá o agente.
          </small>
        </label>
        <label className="field">
          Caminho completo da biblioteca JSON
          <input
            value={library}
            onChange={(e) => setLibrary(e.target.value)}
            placeholder={
              platform === "windows"
                ? "C:\\Users\\voce\\.paktro\\library.json"
                : "/home/seu-usuario/.paktro/library.json"
            }
          />
          <small>
            Arquivo compartilhado entre o MCP da IA e a ponte do navegador. Se
            ainda não existir, a ponte cria automaticamente quando você
            conectar ou criar o primeiro agente.
          </small>
        </label>
      </div>
      {error && (
        <p className="warning" role="status">
          {error}
        </p>
      )}
      {!setup && (
        <p className="info-box">
          Preencha os dois caminhos absolutos para gerar os comandos e o JSON
          com seus dados. O navegador não verifica a existência desses arquivos.
        </p>
      )}
      <ol className="setup-steps">
        <li>
          <h3>Instale e compile a ponte</h3>
          <p>
            Tenha o código do Paktro neste computador e o Node.js 22 ou superior
            instalado. Abra o terminal escolhido na pasta informada e execute:
          </p>
          {setup ? (
            <CodeSnippet label="Comandos de instalação" code={setup.install} />
          ) : (
            <CodeSnippet
              label="Comandos de instalação"
              code={"node --version\nnpm ci\nnpm run bridge:build"}
            />
          )}
          <p>
            Esses comandos instalam e compilam somente a ponte. Não é necessário
            instalar Node no projeto de destino.
          </p>
        </li>
        <li>
          <h3>Registre o servidor MCP no Antigravity</h3>
          <p>
            Use <code>.agents/mcp_config.json</code> na raiz do projeto, ou{" "}
            <code>
              {platform === "windows"
                ? "%USERPROFILE%\\.gemini\\config\\mcp_config.json"
                : "~/.gemini/config/mcp_config.json"}
            </code>{" "}
            para todos os seus projetos (recomendado para criar agentes em
            qualquer repositório).
          </p>
          <p>
            Se o arquivo já existir, adicione somente a entrada{" "}
            <code>paktro</code> dentro de <code>mcpServers</code>, preservando
            os outros servidores.
          </p>
          {setup ? (
            <>
              <CodeSnippet label="JSON da conexão MCP" code={setup.config} />
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  download(
                    setup!.config + "\n",
                    "mcp_config.json",
                    "application/json",
                  )
                }
              >
                <Download size={16} />
                Baixar configuração MCP
              </button>
              <CodeSnippet
                label="Alternativa rápida pelo CLI (agy mcp add)"
                code={setup.cliCommand}
              />
            </>
          ) : (
            <CodeSnippet
              label="Exemplo de mcp_config.json (preencha os caminhos acima para gerar o seu)"
              code={EXAMPLE_MCP_CONFIG}
            />
          )}
          <p>
            Confira com <code>agy mcp list</code> (CLI),{" "}
            <code>/mcp</code> na sessão,{" "}
            <b>Customizations → Installed → MCP Servers</b> (App) ou{" "}
            <b>MCP Servers → Manage MCP Servers</b> (IDE). O MCP expõe 7
            ferramentas: <code>get_studio_catalog</code>,{" "}
            <code>create_agent</code>, <code>update_agent</code>,{" "}
            <code>list_packs</code>, <code>validate_pack</code>,{" "}
            <code>get_pack</code> e <code>export_pack_to_project</code>.
          </p>
          <details className="mcp-help">
            <summary>
              Usar a Paktro Bridge também no Claude Code ou no OpenAI Codex
            </summary>
            <div className="mcp-help-body">
              <p>
                O mesmo executável <code>bridge/dist/cli.mjs</code> segue o
                protocolo MCP padrão (stdio) e também pode ser registrado no
                Claude Code ou no Codex apontando para o mesmo{" "}
                <code>--file</code>:
              </p>
              <CodeSnippet
                label="Registrar Paktro Bridge no Claude Code e no Codex"
                code={
                  "# Claude Code\nclaude mcp add paktro -- node /caminho/paktro/bridge/dist/cli.mjs --file /caminho/.paktro/library.json\n\n# OpenAI Codex\ncodex mcp add paktro -- node /caminho/paktro/bridge/dist/cli.mjs --file /caminho/.paktro/library.json"
                }
              />
            </div>
          </details>
        </li>
        <li>
          <h3>Inicie a ponte local e conecte este site ao vivo</h3>
          <p>
            Para que os agentes criados pela IA apareçam automaticamente aqui no
            navegador e você possa dar o OK, inicie o processo HTTP local em um
            terminal:
          </p>
          {setup ? (
            <CodeSnippet
              label="Iniciar ponte ao vivo com o navegador"
              code={setup.http}
            />
          ) : (
            <p>
              Preencha os dois caminhos acima para gerar o comando exato com a
              origem <code>{origin || "http://localhost:3000"}</code>.
            </p>
          )}
          <p>
            Copie o token gerado no terminal para o campo{" "}
            <strong>Token da ponte</strong> ao lado e clique em{" "}
            <strong>Conectar ao vivo</strong>. A partir daí, tudo o que a IA
            criar aparece automaticamente em <strong>Meus agentes</strong>.
          </p>
        </li>
        <li>
          <h3>Peça para a IA criar um agente no Paktro</h3>
          <CodeSnippet
            label="Pedido para a IA criar o agente no Paktro"
            code={
              "Use get_studio_catalog e create_agent do servidor MCP paktro para criar um agente especialista para este projeto no Paktro. Avise quando terminar para eu revisar e dar o OK no site."
            }
          />
          <p>
            O agente entra no Paktro com status{" "}
            <strong>Aguardando seu OK</strong>. Abra-o em{" "}
            <strong>Meus agentes</strong>, revise ferramentas, modelo
            (Neon/Hydrogen/Carbon/Claude/GPT-6), regras e prévia, faça os
            ajustes que quiser e clique em{" "}
            <strong>Dar OK (aprovar para exportar)</strong>.
          </p>
        </li>
        <li>
          <h3>Dê o OK no site e exporte direto para o projeto</h3>
          <CodeSnippet
            label="Pedido para a IA exportar após você dar o OK"
            code={
              "Já revisei e dei o OK no site Paktro. Use export_pack_to_project do servidor paktro para gravar os arquivos diretamente na pasta deste projeto."
            }
          />
          <div className="info-box">
            <ShieldCheck size={18} />
            <p>
              <strong>Trava de segurança:</strong> <code>export_pack_to_project</code>{" "}
              recusa qualquer exportação enquanto você não clicar em{" "}
              <strong>Dar OK</strong> nesta revisão exata dentro do site (ou se
              a IA alterar o agente depois da sua aprovação).
            </p>
          </div>
        </li>
      </ol>
      <details className="mcp-help">
        <summary>Alternativa sem conexão ao vivo: backup/sincronização manual</summary>
        <div className="mcp-help-body">
          <p>
            Você também pode trabalhar sem conexão contínua usando o botão
            abaixo para baixar o arquivo JSON e movê-lo para o{" "}
            <strong>caminho da biblioteca</strong>, ou usando{" "}
            <b>Conferir mudanças → Confirmar sincronização</b> no painel ao lado.
          </p>
          <button
            className="button secondary"
            disabled={!agents.length}
            onClick={() =>
              download(
                serializeBackup(agents),
                "paktro.json",
                "application/json",
              )
            }
          >
            <Download size={16} />
            Exportar biblioteca para a ponte
          </button>
        </div>
      </details>
      <details className="mcp-help">
        <summary>A conexão não funcionou?</summary>
        <div className="mcp-help-body">
          <ul>
            <li>
              <b>node não encontrado:</b> confirme a instalação e configure o
              caminho completo do executável no JSON (ex.: output de{" "}
              <code>which node</code>).
            </li>
            <li>
              <b>cli.mjs não encontrado:</b> execute{" "}
              <code>npm run bridge:build</code> na pasta do Paktro e confira o
              caminho absoluto em <code>args</code>.
            </li>
            <li>
              <b>Agente criado pela IA não apareceu no site:</b> confira se o
              processo <code>--http</code> e o servidor MCP no Antigravity
              apontam para o <strong>mesmo arquivo</strong> em{" "}
              <code>--file</code> e se a conexão ao vivo está ativa ao lado.
            </li>
            <li>
              <b>export_pack_to_project recusado:</b> abra o agente no site e
              clique em <strong>Dar OK (aprovar para exportar)</strong> depois
              da última edição.
            </li>
            <li>
              <b>Origem não autorizada ou token inválido:</b> confira se o
              token veio do terminal atual e se a origem (
              <code>{origin || "carregando…"}</code>) coincide exatamente com a
              barra do navegador (<code>localhost</code> e{" "}
              <code>127.0.0.1</code> são origens diferentes).
            </li>
          </ul>
        </div>
      </details>
      <p>
        <a
          href="https://antigravity.google/docs/mcp/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ver a documentação oficial de MCP ↗
        </a>
      </p>
    </section>
  );
}
