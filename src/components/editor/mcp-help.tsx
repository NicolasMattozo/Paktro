import CodeSnippet from "../ui/code-snippet";

const ENV_AND_AUTH_EXAMPLE = `{
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

const CLI_ADD_EXAMPLES = `# Exemplo local (Python, Go, Rust, Node, Docker...)
agy mcp add --env CHAVE=valor meu-mcp -- python3 -m meu_servidor_mcp

# Exemplo remoto (Streamable HTTP com header)
agy mcp add --header "Authorization: Bearer TOKEN" api https://exemplo.com/mcp

# Conferir servidores ativos
agy mcp list`;

export default function McpHelp() {
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
          o Agex nunca pede nem grava segredos. Depois de baixar o ZIP,
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
            code={ENV_AND_AUTH_EXAMPLE}
          />
          <p>
            Se preferir registrar pelo terminal sem editar o JSON à mão (use{" "}
            <code>--</code> antes do comando se houver argumentos com hífen):
          </p>
          <CodeSnippet
            label="Comandos úteis no Antigravity CLI"
            code={CLI_ADD_EXAMPLES}
          />
          <p>
            <strong>
              Quer que o Antigravity leia ou crie os agentes aqui do Agex?
            </strong>{" "}
            Essa conexão é separada: abra <b>Ponte local</b> no menu lateral
            para instalar e conectar a <b>Agex Bridge</b>.
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
