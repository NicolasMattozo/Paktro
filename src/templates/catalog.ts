import type { AgentConfig, AgentPackV2, Rule, Skill, TargetPlatform } from "../types";
import { convertPackTarget, migrateV1ToV2 } from "../platforms/common/convert";
export const RULES: Rule[] = [
  {
    id: "project-patterns",
    name: "Respeitar o projeto",
    description:
      "Ao desenvolver, siga a arquitetura e as convenções existentes.",
    content:
      "Leia as instruções do repositório e identifique suas linguagens, frameworks, versões e ferramentas antes de começar. Use os comandos de build, testes e análise definidos no próprio projeto; não presuma uma linguagem, um gerenciador de pacotes ou um framework. Reutilize os padrões e dependências existentes. Faça mudanças pequenas e explique decisões relevantes.",
    trigger: "always_on",
    globs: "",
    enabled: true,
  },
  {
    id: "prefer-tests",
    name: "Qualidade com testes",
    description:
      "Ao mudar comportamentos, verifique regressões com testes relevantes.",
    content:
      "Identifique os testes afetados pela alteração. Cubra casos de erro e limites de entrada. Execute as verificações disponíveis e informe claramente o que não pôde verificar.",
    trigger: "model_decision",
    globs: "",
    enabled: true,
  },
  {
    id: "approval",
    name: "Pedir aprovação para editar",
    description: "Peça aprovação antes de alterar arquivos.",
    content:
      "Apresente as alterações propostas e aguarde a aprovação do usuário antes de editar arquivos. Esta regra é uma instrução de comportamento; as permissões efetivas são controladas pela plataforma.",
    trigger: "always_on",
    globs: "",
    enabled: true,
  },
  {
    id: "data-contracts",
    name: "Contratos e validação",
    description:
      "Proteja as fronteiras de dados com os recursos da linguagem do projeto.",
    content:
      "Valide entradas externas, documente contratos e trate falhas explicitamente. Utilize os mecanismos de tipos, validação e tratamento de erros disponíveis na linguagem e no framework encontrados no projeto. Evite impor ferramentas ou convenções de outro ecossistema.",
    trigger: "model_decision",
    globs: "",
    enabled: true,
  },
  {
    id: "clear-communication",
    name: "Comunicar com clareza",
    description: "Explique resultados e limitações de forma direta.",
    content:
      "Responda em português. Comece pelo resultado, mencione os arquivos relevantes e descreva a validação realizada. Diferencie fatos verificados de hipóteses.",
    trigger: "always_on",
    globs: "",
    enabled: true,
  },
];
export const SKILLS: Skill[] = [
  {
    id: "review-checklist",
    name: "Revisão de PR",
    description:
      "Revisa alterações de código e pull requests para identificar defeitos e regressões.",
    content:
      "1. Leia o objetivo da mudança e o diff completo.\n2. Siga o fluxo dos dados e avalie casos de erro.\n3. Verifique compatibilidade, testes e impacto nos consumidores.\n4. Relate achados com gravidade, arquivo, evidência e correção sugerida.\n5. Se não encontrar problemas, informe o que foi verificado e as lacunas restantes.",
    enabled: true,
  },
  {
    id: "test-checklist",
    name: "Checklist de testes",
    description:
      "Planeja e executa testes relevantes ao implementar ou corrigir um comportamento.",
    content:
      "1. Identifique a linguagem, a ferramenta de testes, os comandos documentados e o comportamento esperado.\n2. Defina casos de sucesso, erro e valores de fronteira.\n3. Implemente testes que observam o comportamento público.\n4. Execute a suíte afetada usando os comandos do próprio projeto e as ferramentas permitidas.\n5. Registre resultados, falhas e verificações que não puderam ser executadas.",
    enabled: true,
  },
  {
    id: "security-audit",
    name: "Análise de segurança",
    description:
      "Analisa código em busca de falhas de autenticação, injeções e exposição de informações.",
    content:
      "1. Mapeie entradas não confiáveis e fronteiras de autorização.\n2. Confira validação, escape e uso seguro de consultas.\n3. Procure credenciais expostas e informações sensíveis nos logs.\n4. Verifique dependências e configurações relevantes.\n5. Relate evidências e medidas corretivas, sem explorar sistemas externos.",
    enabled: true,
  },
  {
    id: "accessible-ui",
    name: "Interface acessível",
    description:
      "Verifica acessibilidade em componentes e fluxos de uma interface web.",
    content:
      "1. Verifique nomes acessíveis e a estrutura semântica.\n2. Percorra o fluxo principal usando somente o teclado.\n3. Confira foco, mensagens de erro e contraste.\n4. Teste em telas estreitas e com zoom.\n5. Documente problemas reproduzíveis e correções.",
    enabled: true,
  },
];
export const TEMPLATES = [
  {
    id: "reviewer",
    name: "Revisor de código",
    description: "Um olhar atento para cada mudança.",
    specialty: "Qualidade de código",
    goal: "Revisar alterações e apontar defeitos, regressões e oportunidades de melhoria com evidências.",
    tools: [
      "view_file",
      "list_dir",
      "find_by_name",
      "grep_search",
    ] as AgentConfig["tools"],
    rules: ["project-patterns", "approval"],
    skills: ["review-checklist"],
    color: "violet",
    icon: "scan",
  },
  {
    id: "frontend",
    name: "Desenvolvedor frontend",
    description: "Interfaces bonitas, sólidas e acessíveis.",
    specialty: "Interfaces e acessibilidade na stack do projeto",
    goal: "Construir interfaces responsivas e acessíveis seguindo os padrões do projeto.",
    tools: [
      "view_file",
      "list_dir",
      "find_by_name",
      "grep_search",
      "write_to_file",
      "replace_file_content",
      "multi_replace_file_content",
      "run_command",
      "manage_task",
    ] as AgentConfig["tools"],
    rules: ["project-patterns", "data-contracts", "prefer-tests"],
    skills: ["accessible-ui", "test-checklist"],
    color: "blue",
    icon: "code",
  },
  {
    id: "security",
    name: "Analista de segurança",
    description: "Encontre riscos antes que virem problemas.",
    specialty: "Segurança de aplicações",
    goal: "Analisar o código e relatar vulnerabilidades com evidências e recomendações acionáveis.",
    tools: [
      "view_file",
      "list_dir",
      "find_by_name",
      "grep_search",
    ] as AgentConfig["tools"],
    rules: ["project-patterns", "approval"],
    skills: ["security-audit"],
    color: "orange",
    icon: "shield",
  },
  {
    id: "testing",
    name: "Especialista em testes",
    description: "Mais confiança em cada entrega.",
    specialty: "Testes e confiabilidade",
    goal: "Planejar e implementar testes para comportamentos críticos e regressões.",
    tools: [
      "view_file",
      "list_dir",
      "find_by_name",
      "grep_search",
      "write_to_file",
      "replace_file_content",
      "multi_replace_file_content",
      "run_command",
      "manage_task",
    ] as AgentConfig["tools"],
    rules: ["project-patterns", "prefer-tests"],
    skills: ["test-checklist"],
    color: "green",
    icon: "test",
  },
  {
    id: "generic",
    name: "Agente genérico",
    description: "Uma base flexível para a sua ideia.",
    specialty: "Desenvolvimento de software",
    goal: "Ajudar a resolver tarefas de desenvolvimento com clareza e qualidade.",
    tools: [
      "view_file",
      "list_dir",
      "find_by_name",
      "grep_search",
    ] as AgentConfig["tools"],
    rules: ["project-patterns", "clear-communication"],
    skills: [],
    color: "violet",
    icon: "spark",
  },
];
export function createAgent(templateId = "generic"): AgentConfig {
  const t = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[4];
  return {
    id: crypto.randomUUID(),
    name: t.name,
    slug: (
      {
        reviewer: "code-reviewer",
        frontend: "frontend-developer",
        security: "security-analyst",
        testing: "test-specialist",
        generic: "my-agent",
      } as Record<string, string>
    )[t.id],
    description: t.goal,
    specialty: t.specialty,
    goal: t.goal,
    instructions: "",
    model: "inherit",
    mainAgent: true,
    subagent: true,
    tools: [...t.tools],
    commandExecutionPolicy: "sandbox",
    rules: RULES.filter((r) => t.rules.includes(r.id)).map((r) => ({ ...r })),
    skills: SKILLS.filter((s) => t.skills.includes(s.id)).map((s) => ({
      ...s,
    })),
    mcpServers: [],
    tags: [],
    updatedAt: new Date().toISOString(),
  };
}

export function createPack(
  templateId = "generic",
  target: TargetPlatform = "antigravity",
): AgentPackV2 {
  const base = migrateV1ToV2(createAgent(templateId));
  if (target === "antigravity") return base;
  return convertPackTarget(base, target).pack;
}
