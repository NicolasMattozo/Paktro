# Agex — Documentação do Projeto

**Versão:** 1.0  
**Status:** MVP + Ponte MCP  
**Plataforma inicial:** Google Antigravity  
**Tecnologia principal:** Next.js + React + TypeScript

## 1. Visão geral

Agex é uma aplicação web gratuita para **gerar visualmente configurações de agentes de IA**. Em vez de escrever Markdown, YAML e JSON manualmente, a pessoa escolhe opções em uma interface simples e recebe os arquivos prontos para instalar em seu projeto.

A experiência desejada é semelhante à de um gerador de CPF, JSON ou README: **abrir, configurar, gerar e baixar**, sem cadastro, conta, login, banco de dados ou armazenamento remoto das configurações. *(Anteriormente chamado de Agent Studio na etapa de concepção.)*

**Proposta de valor:** transformar uma configuração técnica em uma experiência visual, rápida e acessível, sem esconder do usuário o que será gerado.

## 2. Objetivos e princípios

- **Zero barreiras:** abrir o site e começar a criar imediatamente.
- **Visual-first:** formulários, seletores, cards, toggles e templates substituem a necessidade de escrever arquivos manualmente.
- **Saída real:** gerar arquivos compatíveis com a documentação oficial da plataforma de destino, não apenas exemplos ilustrativos.
- **Privacidade por padrão:** informações permanecem no navegador; não há contas nem telemetria de configurações pessoais por padrão.
- **Portabilidade:** permitir baixar um ZIP instalável e importar/exportar um JSON de backup editável pelo gerador.
- **Transparência:** mostrar em tempo real a árvore de arquivos e o conteúdo gerado.
- **Evolução modular:** começar pelo Antigravity e permitir outros destinos futuramente, sem mudar a lógica do editor.

## 3. Público-alvo

Desenvolvedores que usam agentes de IA no fluxo de programação; pessoas que querem criar subagentes especializados, mas não querem aprender os detalhes dos arquivos de configuração; e usuários que mantêm padrões recorrentes de comportamento, ferramentas e skills em diferentes projetos.

## 4. Escopo funcional

### 4.1. Biblioteca local

- Criar, visualizar, renomear, duplicar e excluir **agentes e conjuntos de configuração**.
- Salvar automaticamente rascunhos no `localStorage` do navegador.
- Oferecer busca, ordenação e identificação da última edição para conteúdos locais.
- Indicar de forma clara: **“Salvo apenas neste navegador”**.
- Disponibilizar **Importar JSON** e **Exportar JSON** para backup e migração entre dispositivos.
- Não exibir telas de login, avatar de conta, assinatura, plano pago ou painel administrativo.

### 4.2. Construtor visual de agentes

O editor deve permitir selecionar um template (por exemplo, Revisor de Código, Desenvolvedor Frontend, Analista de Segurança ou Agente Genérico) e personalizar:

| Grupo | Opções do editor | Saída esperada |
|---|---|---|
| Identidade | Nome, descrição, especialidade e objetivo | `name`, `description` e instruções do agente |
| Execução | Herdar, Gemini 4 Hydrogen (`Low` a `Extra`/`xhigh`), Gemini 4 Argon, Gemini 3.8 Flash, Claude Opus 5.5, Claude Sonnet 5.5 (`Low` a `High`), Orchestrator (Argon), Flash ou Pro | `model: inherit`, `flash` ou `pro` no YAML do agente; quando um modelo de sessão é escolhido, gera `AGEX-SETUP.md` com instruções de sessão (App/IDE e `agy --model`) |
| Papel | Permitir agente principal e/ou subagente | `mainAgent`, `subagent` |
| Ferramentas | Seleção entre nomes de ferramentas válidos e documentados | `tools` |
| Comandos | Política de execução selecionada | `commandExecutionPolicy` |
| Integrações | MCPs associados, quando configurados | `mcpServers` ou referência à configuração aplicável |
| Habilidades | Skills selecionadas e seus arquivos | `skills` e pasta `.agents/skills/` |
| Comportamento | Checklist de regras e instruções | Corpo Markdown do agente e, quando apropriado, arquivos de regra |

**Regra de UX:** campos textuais podem existir para nome ou descrição, mas templates devem preencher valores iniciais; ninguém precisa escrever YAML/Markdown. Uma opção avançada de texto livre é permitida, mas não obrigatória.

**Atenção:** um toggle visual não equivale necessariamente a uma permissão real. Cada escolha deve ser mapeada para campos suportados; políticas de escrita e execução de comandos devem ser comunicadas corretamente e não prometidas apenas por um texto no prompt.

### 4.3. Regras e skills

- **Universalidade por padrão:** regras, skills e templates devem ser agnósticos de linguagem de programação, framework e gerenciador de pacotes (sem impor TypeScript, React, Node.js ou qualquer stack específica ao projeto de destino). Cada regra deve orientar o agente a inspecionar o repositório para seguir a linguagem, os tipos, as validações e os comandos do próprio projeto.
- **Regras:** galeria de comportamentos prontos (por exemplo, “Respeitar o projeto”, “Contratos e validação”, “Qualidade com testes”, “Pedir aprovação para editar”, “Comunicar com clareza”). Oferecer seleção de ativação: sempre ativa (`always_on`), decisão do modelo (`model_decision`), por arquivos (`glob`) ou manual (`manual`), quando suportada.
- **Skills:** galeria de procedimentos reutilizáveis (por exemplo, revisão de PR, checklist de testes, análise de segurança, interface acessível), cada um gerando um `SKILL.md` com metadados e instruções universais.
- Visualizar, habilitar, desabilitar e remover itens antes de exportar.
- Detectar seleções contraditórias ou redundantes e exibir avisos sem bloquear escolhas válidas.

### 4.4. Pré-visualização e exportação

- Atualização imediata da **árvore de arquivos** e do conteúdo conforme o formulário muda.
- Abas **Arquivos** e **Código**, com destaque de sintaxe quando aplicável.
- Copiar conteúdo de um arquivo, baixar arquivo isolado ou baixar **ZIP completo**.
- Validar campos obrigatórios, nomes de arquivos, propriedades, referências e formato antes de gerar.
- Não enviar o conteúdo gerado a nenhum servidor externo.
- Gerar também um **JSON de configuração do Agex**, separado dos arquivos usados pelo Antigravity.

## 5. Jornada principal

1. A pessoa acessa o site, sem login.
2. Escolhe **Criar agente** ou um template pronto.
3. Define identidade, modelo, papel, ferramentas, política de execução, regras e skills.
4. Acompanha a prévia dos arquivos que serão gerados.
5. Clica em **Exportar ZIP**, **Baixar arquivo** ou **Copiar**.
6. Coloca os arquivos na pasta correspondente do projeto Antigravity.
7. Opcionalmente, salva o conjunto no navegador para editar depois.

**Jornada futura com MCP:** após instalar uma ponte local, a pessoa sincroniza um conjunto local e pede ao agente do Antigravity para recuperar aquela configuração e aplicá-la no projeto, conferindo diferenças antes de gravar arquivos.

## 6. Interface e design

**Direção visual:** clean e minimalista, fundo claro, cards discretos, bastante espaço em branco, bordas suaves e roxo como cor de destaque. Tipografia legível, ícones simples, poucas animações e foco no conteúdo.

**Áreas de interface propostas:**

- **Início / Meus agentes:** lista local dos rascunhos e botão destacado para criar agente.
- **Editor:** etapa de identidade, ferramentas/permissões, regras/skills e integrações.
- **Prévia lateral:** árvore de diretórios e visualização do arquivo selecionado.
- **Exportação:** opções ZIP, arquivo individual, copiar e backup JSON.
- **Ajuda:** explicação breve da diferença entre agentes, regras, skills e MCPs.

**Responsividade:** desktop com editor e prévia lado a lado; celular com editor em coluna única e prévia acessível por aba.

**Textos de produto:** evitar “Plano Pro”, “Minha conta” e qualquer elemento que sugira cobrança ou autenticação. Usar “Salvo neste navegador”, “Criar agente”, “Pré-visualização” e “Exportar ZIP”.

## 7. Compatibilidade com Google Antigravity

A versão inicial deve gerar os seguintes caminhos de **workspace**, conforme aplicável:

```text
.agents/
├── agents/
│   └── code-reviewer.md
├── rules/
│   └── code-quality.md
├── skills/
│   └── review-checklist/
│       └── SKILL.md
└── mcp_config.json         # somente quando houver MCP configurado
AGEX-SETUP.md               # gerado quando um modelo específico de sessão é escolhido
```

Para agentes customizados, o Antigravity usa Markdown com frontmatter YAML. Campos documentados incluem `name`, `description`, `tools`, `mainAgent`, `subagent`, `model` (`inherit`, `flash` ou `pro`), `commandExecutionPolicy`, `mcpServers` e `skills`.

Modelos concretos de sessão documentados no Antigravity — como **Gemini 4 Hydrogen** (`gemini-4-hydrogen-low`, `medium`, `high`, `xhigh` / *Extra* no App), **Gemini 4 Argon** (`low`, `medium`, `high`), **Gemini 3.8 Flash** (`low`, `medium`, `high`), **Orchestrator (Argon)** (`gemini-pro-orchestrator-g1-pro`), **Claude Opus 5.5** (`low`, `medium`, `high`) e **Claude Sonnet 5.5** (`low`, `medium`, `high`) — são escolhidos na sessão do App/IDE ou via CLI (`agy models`, `agy --agent <slug> --model <id>`). Por isso, quando selecionados na etapa **Identidade**, o frontmatter exporta `model: inherit` e o pacote inclui `AGEX-SETUP.md` com os passos exatos de ativação.

As regras em `.agents/rules/*.md` precisam de frontmatter YAML com `trigger` válido (`always_on`, `model_decision`, `glob`, `manual`). Já os arquivos `AGENTS.md` e `GEMINI.md`, que também são suportados, não usam esse frontmatter. Skills usam uma pasta contendo `SKILL.md`, com metadados como `name` e `description`.

**Cuidados de compatibilidade:** validar nomes exatos das ferramentas; evitar propriedades inventadas (como `permissions: [read_files]` quando não suportadas); separar regras de comportamento de permissões efetivas; e versionar o mapeamento para alterações futuras do Antigravity.

## 8. Arquitetura técnica

### 8.1. Princípio: tudo no cliente

A aplicação pode ser entregue como site estático construído com Next.js. O navegador mantém o estado do editor, persiste os rascunhos e executa a geração dos arquivos, sem necessidade de API de aplicação, autenticação ou banco de dados.

**Stack sugerida:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, Zustand (estado), Zod (validação), biblioteca `yaml` (serialização) e JSZip (download de pacotes). `localStorage` para rascunhos; IndexedDB apenas se o volume de conteúdo futuro justificar.

**Fluxo interno:** componentes visuais → estado tipado em JSON → validação → geradores por tipo de arquivo → prévia → exportação.

### 8.2. Modelo de dados interno (conceitual)

```ts
type ModelId =
  | 'inherit'
  | 'flash'
  | 'pro'
  | 'gemini-4-hydrogen-low'
  | 'gemini-4-hydrogen-medium'
  | 'gemini-4-hydrogen-high'
  | 'gemini-4-hydrogen-xhigh'
  | 'gemini-4-argon-low'
  | 'gemini-4-argon-medium'
  | 'gemini-4-argon-high';

type AgentConfig = {
  id: string;
  name: string;
  slug: string;
  description: string;
  specialty: string;
  goal: string;
  instructions: string;
  model: ModelId;
  mainAgent: boolean;
  subagent: boolean;
  tools: string[];
  commandExecutionPolicy: 'off' | 'auto' | 'eager' | 'sandbox';
  rules: Rule[];
  skills: Skill[];
  mcpServers: McpServer[];
  tags: string[];
  updatedAt: string;
};
```

O objeto é a **fonte da verdade** do editor. Identificadores internos do Studio nunca devem vazar para propriedades YAML inexistentes no Antigravity; os geradores resolvem `rules`, `skills`, `mcpServers` e `model` para os arquivos e campos oficiais suportados.

### 8.3. Organização sugerida do código

```text
src/
├── app/                 # Rotas do Next.js
├── components/
│   ├── editor/          # Formulários e seletores
│   ├── preview/         # Árvore e código gerado
│   └── ui/              # Componentes reutilizáveis
├── features/
│   ├── agents/
│   ├── rules/
│   ├── skills/
│   └── export/
├── generators/
│   └── antigravity/     # Conversão para arquivos oficiais
├── templates/           # Presets estáticos versionados
├── storage/             # Persistência local e migração
├── schemas/             # Validação com Zod
└── types/
```

## 9. Integração MCP (Agente e Ponte Local)

**Separar dois conceitos fundamentais:**

1. **Servidores MCP usados pelo agente gerado (Etapa Integrações):**
   - O editor configura servidores **stdio** (qualquer linguagem/runtime: Python via `uvx`/`python3`, Node via `npx`, binários Go/Rust, containers `docker`) ou **Streamable HTTP** (`serverUrl` em `https://...`; SSE legado e `httpUrl` não são suportados).
   - Exporta `.agents/mcp_config.json` (escopo do workspace) ou pode ser mesclado em `~/.gemini/config/mcp_config.json` (`%USERPROFILE%\.gemini\config\mcp_config.json` no Windows) para uso global.
   - Credenciais (`env`, `headers`, `oauth`, `authProviderType: "google_credentials"`) devem ser adicionadas apenas localmente após exportar (ou via `agy mcp add`), nunca salvas no editor/Git.
   - Por padrão o Antigravity faz carregamento *lazy* e injeta `call_mcp_tool` automaticamente na sessão quando há MCP configurado (no CLI `agy --agent`, incluir `call_mcp_tool` no `tools:` do `.md` pode falhar no registro; para carregamento antecipado, use `"tools": { "<nome>": { "eager": true } }` no JSON local).
   - Recarregamento e diagnóstico: **CLI** (`agy mcp list`, `/mcp` na sessão), **App** (`Customizations → Installed → MCP Servers` → Restart/Authenticate) e **IDE** (`… → MCP Servers → Manage MCP Servers → View raw config`).

2. **Conexão do Agex ao Antigravity (`Agex Bridge` — Ponte local bidirecional):**
   - O navegador não permite que um agente externo acesse diretamente seu `localStorage`.
   - O programa auxiliar local (`bridge/dist/cli.mjs`) expõe um servidor MCP **stdio** sobre a biblioteca JSON compartilhada (`--file`) com 7 ferramentas: `get_studio_catalog`, `list_packs`, `get_pack`, `validate_pack`, `create_agent`, `update_agent` e `export_pack_to_project`.
   - **Fluxo com revisão visual obrigatória ("Dar OK"):** quando a IA chama `create_agent` ou `update_agent`, o agente entra na biblioteca com status `pending_review` (apagando qualquer aprovação anterior). Quando conectado ao vivo ao serviço HTTP (`--http`, protegido em `127.0.0.1` por origem exata e `AGEX_BRIDGE_TOKEN`), o site exibe automaticamente o agente criado pela IA para revisão visual no navegador.
   - **Exportação protegida por aprovação:** `export_pack_to_project` (e `POST /export`) só grava arquivos (`.agents/` e `AGEX-SETUP.md`) no diretório do projeto após o usuário clicar explicitamente em **Dar OK (aprovar para exportar)** no site sobre o hash exato da revisão atual, além de bloquear links simbólicos/path traversal e mesclar com segurança entradas novas em `.agents/mcp_config.json`.

## 10. Requisitos não funcionais

- **Privacidade:** nenhuma configuração enviada para uma API por padrão; nada de credenciais privadas em templates, URLs ou pacotes publicados.
- **Segurança:** sanitizar nomes/caminhos de arquivos, bloquear `../` e caminhos absolutos, validar conteúdo importado, limitar tamanho de arquivos e alertar sobre políticas de comando permissivas.
- **Confiabilidade:** geração determinística (mesma entrada = mesmos conteúdos), testes unitários para cada gerador e arquivos de exemplo testados contra a documentação.
- **Acessibilidade:** navegação por teclado, rótulos claros e contraste adequado.
- **Desempenho:** resposta imediata às alterações do editor, sem chamadas desnecessárias de rede.
- **Persistência:** lidar com `localStorage` indisponível, cheio ou apagado; incluir opção de backup JSON.
- **Compatibilidade:** mostrar mensagens quando recursos variam entre App, CLI e IDE ou entre versões do Antigravity.

## 11. MVP e prioridades

### Versão 1 — indispensável

- [ ] Interface clean e responsiva.
- [ ] Criar agente a partir de template ou do zero.
- [ ] Configurar identidade, modelo, agente principal/subagente, ferramentas e política de comandos.
- [ ] Escolher algumas regras e skills pré-definidas.
- [ ] Gerar Markdown/YAML corretamente e mostrar prévia em tempo real.
- [ ] Exportar arquivo individual e ZIP completo.
- [ ] Salvar rascunhos no navegador; importar/exportar backup JSON.
- [ ] Validar antes do download e testar os arquivos de exemplo.

### Versão 2 — melhorias

- [ ] Biblioteca maior de templates.
- [ ] Edição visual mais completa de regras e skills.
- [ ] Duplicação, busca, organização e comparação de conjuntos.
- [ ] Importação de configurações Antigravity existentes para reconstruir o formulário.
- [ ] Melhorias de acessibilidade e assistente de configuração.

### Versão 3 — integração

- [ ] Pacote auxiliar MCP local.
- [ ] Ferramentas de listagem, obtenção e validação de conjuntos locais.
- [ ] Sincronização navegador → ponte local, somente com ação/autorização explícita.
- [ ] Fluxo de aplicação no projeto com comparação e confirmação de alterações.

## 12. Critérios de aceite do MVP

1. Uma pessoa consegue criar e exportar um agente funcional sem escrever YAML ou Markdown.
2. O ZIP inclui apenas os arquivos necessários e respeita a organização da plataforma selecionada.
3. Ao alterar uma opção, a prévia exibe a mudança correspondente imediatamente.
4. Regras e skills são geradas em formatos válidos; nenhuma opção visual vira uma propriedade YAML inexistente.
5. Atualizar a página não apaga rascunhos salvos, desde que o armazenamento do navegador permaneça disponível.
6. Não é necessário cadastro, login, banco de dados nem serviço pago para usar a geração.
7. O usuário pode exportar suas configurações em JSON e importá-las novamente.
8. O sistema nunca promete sincronização MCP automática sem que a ponte local esteja instalada e configurada.

## 13. Fora do escopo inicial

Cadastro, perfis online, banco de dados, sincronização em nuvem, marketplace remoto, colaboração entre usuários, cobrança, painel administrativo, execução de agentes no próprio site e geração de conteúdo via modelos de IA pagos. **O site é um gerador e editor de configurações, não uma plataforma que hospeda ou executa agentes.**

## 14. Referências oficiais

- [Custom subagents — Google Antigravity](https://antigravity.google/docs/subagents#invoking-subagents)
- [Models — Google Antigravity](https://antigravity.google/docs/models)
- [Headless & CLI — Google Antigravity](https://antigravity.google/docs/cli/headless/)
- [Rules — Google Antigravity](https://antigravity.google/docs/rules/)
- [Agent skills — Google Antigravity](https://antigravity.google/docs/skills/)
- [MCP — Google Antigravity](https://antigravity.google/docs/mcp/)

---

**Definição resumida:** *Agex é um gerador visual, local-first e sem cadastro, que transforma escolhas simples em arquivos de configuração prontos para agentes de IA, com exportação imediata e integração MCP local bidirecional.*
