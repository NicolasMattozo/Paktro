// Exact identifiers confirmed in official Antigravity documentation on 2026-11-12.
// Hooks describes standard tools; availability still depends on the active surface/session.
export const TOOL_GROUPS = [
  { id: "files", name: "Arquivos e diretórios", icon: "folder" },
  { id: "research", name: "Busca e pesquisa", icon: "scan" },
  { id: "execution", name: "Execução e permissões", icon: "braces" },
  { id: "agents", name: "Colaboração entre agentes", icon: "bot" },
  { id: "interaction", name: "Interação e mídia", icon: "spark" },
  { id: "integrations", name: "Integrações MCP", icon: "plug" },
] as const;
export const TOOL_CATALOG = [
  {
    id: "view_file",
    name: "Ler arquivos",
    group: "files",
    description: "Consultar o conteúdo de arquivos.",
  },
  {
    id: "write_to_file",
    name: "Criar arquivos",
    group: "files",
    description: "Gravar conteúdo em arquivos.",
  },
  {
    id: "replace_file_content",
    name: "Editar um trecho",
    group: "files",
    description: "Substituir um bloco de texto.",
  },
  {
    id: "multi_replace_file_content",
    name: "Editar múltiplos trechos",
    group: "files",
    description: "Aplicar alterações em blocos separados.",
  },
  {
    id: "list_dir",
    name: "Listar diretório",
    group: "files",
    description: "Explorar arquivos e pastas.",
  },
  {
    id: "find_by_name",
    name: "Encontrar por nome",
    group: "files",
    description: "Localizar caminhos usando padrões glob.",
  },
  {
    id: "grep_search",
    name: "Buscar no código",
    group: "research",
    description: "Procurar ocorrências de texto.",
  },
  {
    id: "search_web",
    name: "Pesquisar na web",
    group: "research",
    description: "Consultar informações na internet.",
  },
  {
    id: "read_url_content",
    name: "Ler uma página",
    group: "research",
    description: "Obter o texto de uma URL pública.",
  },
  {
    id: "run_command",
    name: "Executar comandos",
    group: "execution",
    description: "Propor comandos para o terminal.",
  },
  {
    id: "manage_task",
    name: "Gerenciar tarefas",
    group: "execution",
    description: "Acompanhar e controlar tarefas em execução.",
  },
  {
    id: "schedule",
    name: "Agendar tarefas",
    group: "execution",
    description: "Configurar lembretes e recorrências.",
  },
  {
    id: "list_permissions",
    name: "Consultar permissões",
    group: "execution",
    description: "Inspecionar acessos concedidos.",
  },
  {
    id: "ask_permission",
    name: "Solicitar permissão",
    group: "execution",
    description: "Pedir autorização para um acesso.",
  },
  {
    id: "invoke_subagent",
    name: "Delegar para subagentes",
    group: "agents",
    description: "Iniciar especialistas para uma tarefa.",
  },
  {
    id: "define_subagent",
    name: "Definir subagente",
    group: "agents",
    description: "Criar um especialista na sessão.",
  },
  {
    id: "send_message",
    name: "Enviar mensagem",
    group: "agents",
    description:
      "Conversar com outro agente. A plataforma pode manter esta ferramenta disponível mesmo fora da lista.",
  },
  {
    id: "manage_subagents",
    name: "Gerenciar subagentes",
    group: "agents",
    description: "Acompanhar e encerrar especialistas.",
  },
  {
    id: "ask_question",
    name: "Perguntar ao usuário",
    group: "interaction",
    description: "Apresentar escolhas para esclarecimento.",
  },
  {
    id: "generate_image",
    name: "Gerar imagens",
    group: "interaction",
    description: "Criar ou editar imagens no Antigravity.",
  },
  {
    id: "call_mcp_tool",
    name: "Chamar ferramenta MCP",
    group: "integrations",
    description: "Acionar uma ferramenta de um servidor configurado.",
  },
] as const;
export type ToolName = (typeof TOOL_CATALOG)[number]["id"];
export const TOOL_NAMES = TOOL_CATALOG.map((t) => t.id);
export const TOOL_SOURCES = {
  standard: "https://antigravity.google/docs/hooks/#supported-tools",
  mcp: "https://antigravity.google/docs/mcp/#lazy-loading-default",
  agents: "https://antigravity.google/docs/build-plugins/#subagents",
};
