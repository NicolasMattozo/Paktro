import type { TargetPlatform } from "@/types";
import CodeSnippet from "../ui/code-snippet";

const ANTIGRAVITY_ENV_EXAMPLE = `{
  "mcpServers": {
    "meu-banco": {
      "command": "uvx",
      "args": ["mcp-server-sqlite", "--db-path", "./app.db"],
      "env": {
        "MINHA_CHAVE": "valor-apenas-no-seu-ambiente"
      }
    },
    "api-remota": {
      "serverUrl": "https://api.example.com/mcp/",
      "headers": {
        "Authorization": "Bearer SEU_TOKEN_LOCAL"
      }
    }
  }
}`;

const ANTIGRAVITY_CLI_EXAMPLES = `# Exemplo local (Python, Go, Rust, Node, Docker...)
agy mcp add --env CHAVE=valor meu-mcp -- python3 -m meu_servidor_mcp

# Exemplo remoto (Streamable HTTP com header)
agy mcp add --header "Authorization: Bearer TOKEN" api https://exemplo.com/mcp

# Conferir servidores ativos
agy mcp list`;

const CLAUDE_ENV_EXAMPLE = `{
  "mcpServers": {
    "meu-banco": {
      "type": "stdio",
      "command": "uvx",
      "args": ["mcp-server-sqlite", "--db-path", "./app.db"],
      "env": {
        "DB_TOKEN": "\${DB_TOKEN}"
      }
    },
    "api-remota": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer \${API_TOKEN}"
      }
    }
  }
}`;

const CLAUDE_CLI_EXAMPLES = `# Registrar servidor HTTP remoto no escopo do projeto (.mcp.json)
claude mcp add --scope project --transport http api https://api.example.com/mcp

# Registrar servidor local stdio
claude mcp add --scope project meu-mcp -- uvx mcp-server-sqlite --db-path ./app.db

# Listar servidores configurados
claude mcp list`;

const CODEX_TOML_EXAMPLE = `[mcp_servers.meu-banco]
command = "uvx"
args = ["mcp-server-sqlite", "--db-path", "./app.db"]
env_vars = ["DB_TOKEN"]

[mcp_servers.api-remota]
url = "https://api.example.com/mcp"
bearer_token_env_var = "API_TOKEN"
enabled = true`;

const CODEX_CLI_EXAMPLES = `# Registrar servidor local stdio no Codex
codex mcp add meu-mcp -- uvx mcp-server-sqlite --db-path ./app.db

# Registrar servidor Streamable HTTP com variável de token
codex mcp add api-remota --url https://api.example.com/mcp --bearer-token-env-var API_TOKEN

# Conferir servidores configurados
codex mcp list`;

const CHATGPT_PLUGIN_MCP_EXAMPLE = `{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "api-remota": {
      "type": "streamable-http",
      "url": "https://api.example.com/mcp"
    }
  }
}`;

export default function McpHelp({
  target = "antigravity",
}: {
  target?: TargetPlatform;
}) {
  if (target === "claude-code") {
    return (
      <section className="mcp-guide" aria-label="Guia de conexão MCP">
        <div className="mcp-guide-header">
          <h3>Como conectar um servidor MCP ao agente</h3>
          <p>
            O editor gera o arquivo <code>.mcp.json</code> na raiz do pacote
            para o Claude Code. A conexão e a autenticação acontecem localmente
            na sua sessão.
          </p>
        </div>

        <ol className="mcp-guide-steps">
          <li>
            <strong>Escolha o transporte:</strong> use{" "}
            <b>Programa local (stdio)</b> (<code>type: &quot;stdio&quot;</code>)
            para executáveis locais ou <b>Streamable HTTP</b> (
            <code>type: &quot;http&quot;</code>) para servidores remotos.
          </li>
          <li>
            <strong>Descoberta de ferramentas em subagentes:</strong> subagentes
            em <code>.claude/agents/*.md</code> herdam os servidores de{" "}
            <code>.mcp.json</code>. Incluir <code>ToolSearch</code> nas
            ferramentas ajuda a descobrir schemas MCP diferidos sob demanda.
          </li>
          <li>
            <strong>Escopo do arquivo:</strong> <code>.mcp.json</code> na raiz do
            repositório compartilha a estrutura com o time; para servidores
            pessoais em todos os projetos, use <code>~/.claude.json</code> (via{" "}
            <code>claude mcp add --scope user</code>).
          </li>
          <li>
            <strong>Credenciais fora do site:</strong> nunca salve chaves fixas
            no pacote. No <code>.mcp.json</code> local, o Claude Code aceita
            expansão de variáveis de ambiente como{" "}
            <code>&#36;&#123;API_TOKEN&#125;</code>.
          </li>
        </ol>

        <details className="mcp-help">
          <summary>
            Exemplos para Claude Code (.mcp.json com variáveis e claude mcp add)
          </summary>
          <div className="mcp-help-body">
            <CodeSnippet
              label="Exemplo de .mcp.json usando expansão de variáveis locais"
              code={CLAUDE_ENV_EXAMPLE}
            />
            <CodeSnippet
              label="Comandos úteis no Claude Code CLI"
              code={CLAUDE_CLI_EXAMPLES}
            />
            <a
              href="https://code.claude.com/docs/en/mcp"
              target="_blank"
              rel="noopener noreferrer"
            >
              Documentação oficial de MCP no Claude Code ↗
            </a>
          </div>
        </details>
      </section>
    );
  }

  if (target === "codex") {
    return (
      <section className="mcp-guide" aria-label="Guia de conexão MCP">
        <div className="mcp-guide-header">
          <h3>Como conectar um servidor MCP ao agente</h3>
          <p>
            O editor gera entradas <code>[mcp_servers.&lt;id&gt;]</code> em{" "}
            <code>.codex/config.toml</code>, mescladas via parser TOML sem
            apagar configurações existentes do projeto.
          </p>
        </div>

        <ol className="mcp-guide-steps">
          <li>
            <strong>Escolha o transporte:</strong> servidores locais usam{" "}
            <code>command</code> e <code>args</code>; servidores remotos
            Streamable HTTP usam <code>url</code> e <code>enabled = true</code>.
          </li>
          <li>
            <strong>Herança nos subagentes:</strong> subagentes em{" "}
            <code>.codex/agents/*.toml</code> compartilham os servidores MCP e
            aprovações configurados na sessão do projeto (ou em{" "}
            <code>~/.codex/config.toml</code>).
          </li>
          <li>
            <strong>Credenciais por nome de variável:</strong> no Codex, prefira{" "}
            <code>bearer_token_env_var</code> (HTTP) e <code>env_vars</code>{" "}
            (stdio) no seu <code>config.toml</code> local para encaminhar
            variáveis do shell sem gravar tokens em texto puro.
          </li>
        </ol>

        <details className="mcp-help">
          <summary>
            Exemplos para OpenAI Codex (.codex/config.toml e codex mcp add)
          </summary>
          <div className="mcp-help-body">
            <CodeSnippet
              label="Exemplo de .codex/config.toml com variáveis do ambiente"
              code={CODEX_TOML_EXAMPLE}
            />
            <CodeSnippet
              label="Comandos úteis no Codex CLI"
              code={CODEX_CLI_EXAMPLES}
            />
            <a
              href="https://developers.openai.com/codex/config-reference"
              target="_blank"
              rel="noopener noreferrer"
            >
              Referência oficial de config.toml no Codex ↗
            </a>
          </div>
        </details>
      </section>
    );
  }

  if (target === "chatgpt-plugin") {
    return (
      <section className="mcp-guide" aria-label="Guia de conexão MCP">
        <div className="mcp-guide-header">
          <h3>Como conectar um servidor MCP ao agente</h3>
          <p>
            O editor gera <code>mcp.json</code> seguindo o schema{" "}
            <code>agent-plugins.org</code> 1.0.0 com{" "}
            <code>type: &quot;streamable-http&quot;</code>.
          </p>
        </div>

        <ol className="mcp-guide-steps">
          <li>
            <strong>Apenas servidores remotos HTTPS:</strong> plugins portáteis
            para ChatGPT Web não executam processos locais{" "}
            <code>stdio</code>; publique seu servidor MCP em um endpoint{" "}
            <code>https://</code> acessível.
          </li>
          <li>
            <strong>Schema estrito 1.0.0:</strong> o manifesto{" "}
            <code>plugin.json</code> permanece enxuto e o <code>mcp.json</code>{" "}
            na raiz do plugin declara <code>$schema</code> e{" "}
            <code>mcpServers</code> automaticamente.
          </li>
          <li>
            <strong>Autenticação OAuth / tokens:</strong> nunca inclua tokens na
            URL nem no pacote exportado; configure OAuth ou extensões de
            autenticação diretamente no ambiente de publicação.
          </li>
        </ol>

        <details className="mcp-help">
          <summary>Exemplo de mcp.json portátil (Agent Plugins 1.0.0)</summary>
          <div className="mcp-help-body">
            <CodeSnippet
              label="Exemplo de mcp.json com schema oficial 1.0.0"
              code={CHATGPT_PLUGIN_MCP_EXAMPLE}
            />
            <a
              href="https://developers.openai.com/api/docs/mcp"
              target="_blank"
              rel="noopener noreferrer"
            >
              Documentação oficial OpenAI MCP &amp; Plugins ↗
            </a>
          </div>
        </details>
      </section>
    );
  }

  return (
    <section className="mcp-guide" aria-label="Guia de conexão MCP">
      <div className="mcp-guide-header">
        <h3>Como conectar um servidor MCP ao agente</h3>
        <p>
          O editor gera o arquivo <code>.agents/mcp_config.json</code>. A
          conexão real acontece na sua máquina ou no seu ambiente depois de
          instalar o pacote no projeto.
        </p>
      </div>

      <ol className="mcp-guide-steps">
        <li>
          <strong>Escolha o transporte (funciona em qualquer stack):</strong>{" "}
          use <b>Programa local (stdio)</b> quando o Antigravity inicia um
          processo na sua máquina (ex.: <code>uvx</code>, <code>python3</code>,{" "}
          <code>npx</code>, <code>docker</code> ou um binário Go/Rust) ou{" "}
          <b>Streamable HTTP</b> para um servidor remoto já publicado em{" "}
          <code>https://...</code> (SSE legado e <code>httpUrl</code> não são
          suportados).
        </li>
        <li>
          <strong>Carregamento das ferramentas MCP:</strong> por padrão, o
          Antigravity carrega schemas MCP sob demanda (<i>lazy loading</i>) e
          injeta <code>call_mcp_tool</code> automaticamente na sessão quando há
          servidores configurados —{" "}
          <b>não é obrigatório marcá-la em Ferramentas</b> (no CLI{" "}
          <code>agy --agent</code>, listar <code>call_mcp_tool</code> em{" "}
          <code>tools:</code> no <code>.md</code> pode gerar erro de componente
          não encontrado). Para carregar uma ferramenta logo no início do turno,
          adicione <code>&quot;eager&quot;: true</code> em <code>tools</code> no{" "}
          <code>mcp_config.json</code> local.
        </li>
        <li>
          <strong>Coloque o mcp_config.json no escopo certo:</strong>
          <ul>
            <li>
              <b>Apenas neste projeto:</b> salve{" "}
              <code>.agents/mcp_config.json</code> na raiz do repositório.
            </li>
            <li>
              <b>Todos os seus projetos:</b> adicione dentro de{" "}
              <code>mcpServers</code> em{" "}
              <code>~/.gemini/config/mcp_config.json</code> (Windows:{" "}
              <code>%USERPROFILE%\.gemini\config\mcp_config.json</code>).
            </li>
          </ul>
          Se o arquivo já existir, mescle apenas os novos servidores dentro de{" "}
          <code>mcpServers</code> sem apagar os anteriores.
        </li>
        <li>
          <strong>
            Configure credenciais e tokens somente fora do site:
          </strong>{" "}
          o Paktro nunca pede nem grava segredos. Depois de baixar o ZIP,
          adicione <code>env</code>, <code>headers</code>, <code>oauth</code>{" "}
          ou <code>authProviderType: &quot;google_credentials&quot;</code> no
          arquivo local (sem enviar senhas para o Git), ou cadastre pelo
          terminal com <code>agy mcp add</code>.
        </li>
        <li>
          <strong>Recarregue e teste no Antigravity:</strong>
          <ul>
            <li>
              <b>CLI:</b> digite <code>/mcp</code> na sessão para ver status e
              logs, ou execute <code>agy mcp list</code> no terminal.
            </li>
            <li>
              <b>App:</b> abra <b>Customizations → Installed → MCP Servers</b>{" "}
              e clique em <b>Restart</b> (ou <b>Authenticate</b> para OAuth). Use{" "}
              <b>Copy Config File Path</b> para confirmar o caminho lido.
            </li>
            <li>
              <b>IDE:</b> no painel do agente, abra{" "}
              <b>… → MCP Servers → Manage MCP Servers → View raw config</b>.
            </li>
          </ul>
        </li>
      </ol>

      <details className="mcp-help">
        <summary>
          Exemplos de configuração local (env, headers e comandos agy mcp)
        </summary>
        <div className="mcp-help-body">
          <p>
            Depois de exportar <code>.agents/mcp_config.json</code>, você pode
            completar variáveis de ambiente ou cabeçalhos HTTP diretamente no
            arquivo local:
          </p>
          <CodeSnippet
            label="Exemplo de mcp_config.json com env e headers locais"
            code={ANTIGRAVITY_ENV_EXAMPLE}
          />
          <p>
            Se preferir registrar pelo terminal sem editar o JSON à mão (use{" "}
            <code>--</code> antes do comando se houver argumentos com hífen):
          </p>
          <CodeSnippet
            label="Comandos úteis no Antigravity CLI"
            code={ANTIGRAVITY_CLI_EXAMPLES}
          />
          <p>
            <strong>
              Quer que o Antigravity leia ou crie os agentes aqui do Paktro?
            </strong>{" "}
            Essa conexão é separada: abra <b>Ponte local</b> no menu lateral
            para instalar e conectar a <b>Paktro Bridge</b>.
          </p>
          <a
            href="https://antigravity.google/docs/mcp/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentação oficial de conexão MCP ↗
          </a>
        </div>
      </details>
    </section>
  );
}
