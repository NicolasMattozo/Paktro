# Agex

Gerador visual de configurações Google Antigravity. Interface em português, sem conta, banco de dados ou API de aplicação. O editor, a validação, os backups e a geração de ZIP funcionam no navegador. A ponte MCP é um programa local opcional e separado.

## Executar

Requer Node.js 22 ou superior e npm.

```sh
npm ci
npm run dev
```

Abra **http://localhost:3000**. Para a versão de produção:

```sh
npm run build
npm start
```

`out/` contém o site estático, pronto para servir em qualquer hospedagem estática na raiz do domínio. `npm start` serve essa pasta em loopback; `PORT` ou `--port` muda a porta. A compilação não depende de fontes, imagens ou APIs externas.

## O que está implementado

- Biblioteca local de conjuntos (cada conjunto contém um agente, regras, skills e MCPs), com criação, renomeação pelo editor, duplicação, exclusão confirmada, busca, ordenação, etiquetas e comparação de conteúdo.
- Cinco templates universais (agnósticos de linguagem): revisor de código, frontend, segurança, testes e genérico.
- Editor em quatro etapas com identidade, especialidade, objetivo, modelo (`Herdar`, **Gemini 4 Hydrogen** nos níveis `low`, `medium`, `high` e `xhigh`/Extra, **Gemini 4 Argon** nos níveis `low`, `medium` e `high`, `Flash` e `Pro`), papéis, ferramentas e política de comandos.
- Galerias e edição visual de regras e skills universais para qualquer linguagem/stack, incluindo ativação, desativação, remoção e criação de procedimentos próprios.
- Regras com os quatro modos de ativação, incluindo padrões glob.
- Configuração visual de servidores MCP `stdio` (em qualquer linguagem: Python, Node, Go, Rust, Docker etc.) e `Streamable HTTP`, sem executar servidores ou solicitar credenciais no editor, com guia passo a passo de conexão.
- Prévia imediata de árvore e código, destaque simples de sintaxe, cópia, arquivo individual e ZIP com guia `AGEX-SETUP.md` (quando Hydrogen ou Argon é selecionado) e backup JSON separado (`agex.json`).
- Persistência automática em `localStorage` (`agex:library:v1`, com leitura retrocompatível de `agent-studio:library:v1`), tratamento de indisponibilidade/cota/corrupção e detecção de alterações em outra aba.
- Backup JSON versionado; importação preserva agentes existentes e atribui novos IDs para evitar sobrescritas.
- Importação de agentes Markdown e ZIP Antigravity, reconstruindo os campos suportados e suas dependências.
- Comparação de propriedades e conteúdos gerados entre dois conjuntos.
- Ajuda, assistente por etapas, layout responsivo, foco visível e respeito a movimento reduzido.
- Ponte MCP local bidirecional e sincronização opcional autenticada, com revisão visual e aprovação explícita (**Dar OK**) no navegador.

Nenhum agente é executado pelo site. O conteúdo só sai do navegador em um download, uma cópia explícita ou uma sincronização solicitada com a ponte local. Node.js 22+ é necessário apenas para rodar este aplicativo e a ponte opcional — os agentes gerados funcionam em projetos de qualquer linguagem.

## Formatos e compatibilidade

Mapeamento versionado em `src/generators/antigravity/index.ts`: **antigravity-2026-11-12**.

```text
.agents/
  agents/<identificador>.md
  rules/<regra>.md
  skills/<skill>/SKILL.md
  mcp_config.json              # apenas com integrações habilitadas
AGEX-SETUP.md                  # gerado quando Hydrogen ou Argon é selecionado
agex.json                      # backup do editor, não configuração Antigravity
```

Os metadados dos agentes são serializados com `yaml`; nomes e referências internos do Agex não vazam para propriedades inventadas. Como o frontmatter documentado de agentes customizados aceita apenas `inherit`, `flash` ou `pro`, a seleção de **Gemini 4 Hydrogen** (`gemini-4-hydrogen-low`, `medium`, `high`, `xhigh`) ou **Gemini 4 Argon** (`gemini-4-argon-low`, `medium`, `high`) exporta `model: inherit` no `.md` e inclui `AGEX-SETUP.md` com os passos para ativar o modelo exato no seletor do App/IDE e via CLI (`agy models`, `agy --agent <slug> --model <id>`). As referências de skills seguem `skills/<identificador>`, conforme o exemplo oficial. MCPs são definidos no arquivo de workspace; o corpo do agente explica a referência. A aplicação deliberadamente não adivinha a estrutura de MCPs inline do frontmatter.

O catálogo inclui 21 ferramentas confirmadas: as 20 ferramentas padrão da documentação de hooks e `call_mcp_tool`, da documentação MCP. O seletor oferece busca e seis categorias. Os nomes e fontes ficam centralizados em `src/templates/tools.ts`. A lista documentada não garante que todas estejam disponíveis em qualquer sessão; ferramentas adicionais de navegador e MCP dependem do ambiente. A documentação de plugins informa que `send_message` pode permanecer incluída pela plataforma mesmo fora da allowlist. Agentes customizados são destinados ao **App e CLI**; os recursos do IDE e as permissões de cada sessão podem variar. Regras manuais dependem de menções no App, indisponíveis no CLI. Regras comportamentais não são controles de acesso.

Referências consultadas em 12/11/2026:

- [Modelos no Antigravity](https://antigravity.google/docs/models)
- [CLI e seleção de modelo (`--model`)](https://antigravity.google/docs/cli/headless/)
- [Agentes customizados](https://antigravity.google/docs/subagents)
- [Regras e modos de ativação](https://antigravity.google/docs/rules/)
- [Skills](https://antigravity.google/docs/skills/)
- [Ferramentas padrão documentadas](https://antigravity.google/docs/hooks/#supported-tools)
- [Allowlist de agentes em plugins](https://antigravity.google/docs/build-plugins/#subagents)
- [MCP e configuração de workspace](https://antigravity.google/docs/mcp/)

Os testes verificam o formato documentado e a resolução das referências. A execução dos arquivos no aplicativo Antigravity precisa ser conferida no ambiente em que serão instalados.

### Importação e limites

Backups usam `format: "agex"` (aceitando também backups legados `format: "agent-studio"`), `version: 1`. Versões desconhecidas são recusadas, sem descartar a biblioteca existente. Os limites são 1 MB por importação/biblioteca, 100 agentes, 30 regras, 30 skills e 20 servidores por agente. ZIPs têm limite de 100 arquivos e de 1 MB após descompactação. Caminhos inseguros e YAML com aliases são recusados.

Markdown isolado precisa ser um agente com frontmatter. Para referências de skills, importe o ZIP completo. Campos desconhecidos são apresentados para revisão; ferramentas desconhecidas, MCPs inline e opções MCP não suportadas são recusados para não simular compatibilidade nem descartar credenciais silenciosamente. O corpo Markdown importado é preservado nas instruções avançadas, sem tentar inferir a semântica de prompts arbitrários. A exportação preserva o significado dos campos suportados, mas não promete roundtrip textual idêntico de arquivos externos.

Se o armazenamento local estiver corrompido ou for alterado por outra aba, o salvamento é suspenso. Exporte o trabalho em memória, preserve o conteúdo antigo caso precise recuperá-lo e só depois limpe os dados do site/recarregue. Cotas e políticas privadas do navegador podem impedir a persistência; o backup permanece disponível.

## Conectar servidores MCP (do agente vs. ponte do Agex)

Existem duas conexões distintas:

1. **Servidores MCP usados pelo agente gerado** (etapa **Integrações**): o site gera `.agents/mcp_config.json` para o repositório do projeto (ou você pode mesclar as entradas em `~/.gemini/config/mcp_config.json` / `%USERPROFILE%\.gemini\config\mcp_config.json` para todos os projetos). Funciona para servidores `stdio` em qualquer linguagem (`uvx`, `python3`, `npx`, `docker`, binário compilado etc.) e servidores remotos `Streamable HTTP`. Por padrão o Antigravity carrega servidores sob demanda e injeta `call_mcp_tool` automaticamente na sessão (não inclua `call_mcp_tool` manualmente no `tools:` do `.md` para `agy --agent`, ou configure `"tools": { "<nome>": { "eager": true } }` no JSON local), adicione `env`, `headers`, `oauth` ou `authProviderType` somente localmente fora do site (ou via `agy mcp add`) e recarregue no CLI (`/mcp` ou `agy mcp list`), App (**Customizations → Installed → MCP Servers**) ou IDE (**MCP Servers → Manage MCP Servers → View raw config**).
2. **Agex Bridge** (tela **Ponte local**): conecta o próprio Agex ao Antigravity para que a IA crie ou edite agentes no site (em estado `pending_review`), você revise visualmente no navegador, clique em **Dar OK (aprovar para exportar)** e a IA (ou o próprio Agex) exporte os arquivos diretamente para o projeto.

## Agex Bridge

A ponte acompanha o projeto e usa o SDK oficial MCP. Não exige serviço pago nem acesso remoto.

```sh
npm ci
npm run bridge:build
node bridge/dist/cli.mjs --help
```

### MCP stdio: criar, revisar e exportar conjuntos

Adicione o servidor MCP à configuração do Antigravity (`.agents/mcp_config.json` do projeto ou `~/.gemini/config/mcp_config.json` para todos os projetos), usando caminhos absolutos reais (se `--file` for omitido, o padrão é `~/.agex/library.json`, ou `~/.agent-studio/library.json` se já existir legado):

```json
{
  "mcpServers": {
    "agex": {
      "command": "node",
      "args": [
        "/caminho/agex/bridge/dist/cli.mjs",
        "--file",
        "/caminho/.agex/library.json"
      ]
    }
  }
}
```

Ou registre direto pelo CLI (use `--` antes do comando por causa da flag `--file`):

```sh
agy mcp add agex -- node /caminho/agex/bridge/dist/cli.mjs --file /caminho/.agex/library.json
```

Mantenha a pasta do projeto e suas dependências instaladas. O executável compilado é independente do diretório de trabalho, mas utiliza os pacotes instalados em `node_modules` junto ao projeto.

Ferramentas disponíveis:

| Ferramenta               | Entrada                    | Resultado                                                                      |
| ------------------------ | -------------------------- | ------------------------------------------------------------------------------ |
| `get_studio_catalog`     | nenhum parâmetro           | Templates, modelos (Hydrogen/Argon), ferramentas válidas, regras e skills      |
| `list_packs`             | nenhum parâmetro           | IDs, nomes, slugs, modelos e status (`pending_review`, `approved`, `stale`)    |
| `get_pack`               | `id` UUID                  | Configuração, status de aprovação e arquivos gerados                           |
| `validate_pack`          | `id` UUID                  | Validade, status de aprovação, erros e avisos                                  |
| `create_agent`           | nome, template, campos...  | Cria agente no Agex como `pending_review` para o usuário revisar no site       |
| `update_agent`           | `id` UUID + alterações     | Atualiza o agente e volta o status para `pending_review`                       |
| `export_pack_to_project` | `id` UUID, `projectPath`   | Grava `.agents/` e `AGEX-SETUP.md` no projeto **somente após o OK**            |

Por segurança, `export_pack_to_project` recusa qualquer escrita enquanto você não clicar em **Dar OK (aprovar para exportar)** no site sobre o hash exato do agente (e revalida caso a IA modifique o agente depois da aprovação). Links simbólicos e caminhos fora do projeto também são bloqueados, e `.agents/mcp_config.json` preserva outros servidores existentes.

### Conexão ao vivo e sincronização navegador ↔ biblioteca local

Para que os agentes criados pela IA apareçam automaticamente no site e você possa dar o OK visualmente, inicie a ponte HTTP local apontando para o mesmo `--file` usado pelo MCP:

```sh
export AGEX_BRIDGE_TOKEN="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
printf '%s\n' "$AGEX_BRIDGE_TOKEN"
node bridge/dist/cli.mjs --http --origin http://localhost:3000 --port 4319 --file /caminho/.agex/library.json
```

*(Para uso rápido na origem `http://localhost:3000`, também há `npm run bridge:live`. A variável legada `AGENT_STUDIO_BRIDGE_TOKEN` também continua aceita.)*

Cole o token mostrado na tela **Ponte local** e clique em **Conectar ao vivo (IA ↔ Site)** (ou use **Conferir mudanças → Confirmar sincronização** para envio manual). Mantenha esse terminal aberto e guarde o token somente no seu ambiente. A origem deve coincidir exatamente com a barra do navegador (`localhost` e `127.0.0.1` são origens diferentes).

Fluxo completo:
1. Peça no Antigravity para a IA criar um agente no Agex (`create_agent`).
2. O agente aparece em **Meus agentes** no navegador com status **Criado pela IA · Aguarda OK**.
3. Abra o agente no editor visual, confira/ajuste qualquer campo e clique em **Dar OK (aprovar para exportar)**.
4. Peça à IA para exportar (`export_pack_to_project`) — ou clique em **Exportar direto para a pasta** no próprio editor.

O serviço escuta somente em `127.0.0.1`, exige origem exata e token, serializa escritas com lock de arquivo, verifica revisões e hash de conteúdo aprovado e grava arquivos atomicamente. Nenhuma credencial é incluída em URLs ou persistida pelo site. O navegador pode pedir autorização de acesso à rede local ou bloquear esse acesso quando o site está hospedado remotamente; nesse caso, use o site localmente ou o backup manual.

## Desenvolvimento e verificações

```sh
npm run typecheck
npm test
npm run build
npm run bridge:build
npm run examples
npx playwright install chromium    # apenas se não houver navegador Playwright instalado
npm run test:e2e
```

Os testes unitários cobrem templates, todos os geradores, YAML especial, referências, importação, ZIP malicioso, backups e falhas de armazenamento. Os testes de integração usam o protocolo MCP e verificam autenticação, origem e conflitos no HTTP local. Os testes de navegador verificam desktop/celular, downloads reais, persistência, importação, edição, comparação, exclusão e acessibilidade com axe.

Para usar um Chromium já instalado, defina `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Os testes de integração e navegador precisam de permissão para abrir portas locais. `npm run test:e2e` serve a compilação existente em `out/`: execute `npm run build` após alterar a interface.

`examples/` contém pacotes gerados com IDs e datas estáveis para os cinco templates. `npm run examples` os regenera. Os exemplos não incluem credenciais.

## Organização

```text
src/app/                    Next.js App Router e estilos
src/components/             Biblioteca, editor, prévia e ponte
src/schemas/                Validação Zod e avisos
src/templates/              Catálogos e presets
src/generators/antigravity/ Conversão determinística
src/storage/                Backup versionado e localStorage
src/features/export/        Downloads e ZIP
src/features/import/        Reconstrução de Markdown e ZIP
bridge/                     MCP stdio e HTTP local opcional
scripts/                    Compilação, exemplos e servidor estático
examples/                   Saídas de referência
tests/                     Testes unitários, integração e navegador
```

A stack é Next.js, React, TypeScript, Zod, YAML, JSZip e Lucide. Estado React e CSS próprios mantêm o editor estático e simples. Zustand, Tailwind e shadcn/ui eram sugestões da especificação, não requisitos de formato ou funcionamento.
