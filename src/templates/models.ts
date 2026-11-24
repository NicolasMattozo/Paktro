/** Session slugs verified with `agy models` (CLI 1.5.11) and official docs on 2026-11-24.
 * The documented custom-agent YAML accepts tiers (`inherit`, `flash_lite`, `flash`, `pro`);
 * concrete session choices therefore export `inherit` and explicit activation instructions,
 * never an unverified frontmatter slug or an assumed tier-to-family mapping.
 */
export const MODEL_IDS = [
  "inherit",
  "flash_lite",
  "flash",
  "pro",
  "gemini-4-neon-low",
  "gemini-4-neon-medium",
  "gemini-4-neon-high",
  "gemini-4-neon-xhigh",
  "gemini-4-carbon-low",
  "gemini-4-carbon-medium",
  "gemini-4-carbon-high",
  "gemini-4-hydrogen-low",
  "gemini-4-hydrogen-medium",
  "gemini-4-hydrogen-high",
  "gemini-4-hydrogen-xhigh",
  "gemini-4-argon-low",
  "gemini-4-argon-medium",
  "gemini-4-argon-high",
  "gemini-pro-orchestrator-neon",
  "gemini-pro-orchestrator",
  "gemini-pro-orchestrator-argon",
  "gemini-3.8-flash-low",
  "gemini-3.8-flash-medium",
  "gemini-3.8-flash-high",
  "claude-opus-5-5-low",
  "claude-opus-5-5-medium",
  "claude-opus-5-5-high",
  "claude-sonnet-5-5-low",
  "claude-sonnet-5-5-medium",
  "claude-sonnet-5-5-high",
] as const;
export type ModelId = (typeof MODEL_IDS)[number];

const LEGACY_MODEL_ALIASES: Record<string, ModelId> = {
  "gemini-pro-orchestrator-g1-pro": "gemini-pro-orchestrator-argon",
};

export function normalizeAntigravityModelId(raw: string): ModelId | null {
  if ((MODEL_IDS as readonly string[]).includes(raw)) {
    return raw as ModelId;
  }
  return LEGACY_MODEL_ALIASES[raw] ?? null;
}

export type EffortLevel = "low" | "medium" | "high" | "xhigh";

export interface ModelLevelOption {
  readonly id: ModelId;
  readonly level: EffortLevel | string;
  readonly label: string;
}

export interface ModelFamilyOption {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly defaultModel: ModelId;
  readonly session: boolean;
  readonly xhighAsExtra?: boolean;
  readonly deprecatedAt?: string;
  readonly levels: readonly ModelLevelOption[];
}

const LEVEL_LABELS: Record<EffortLevel, string> = {
  low: "Low — baixo",
  medium: "Medium — médio",
  high: "High — alto",
  xhigh: "Extra (XHigh) — extra alto",
};

function buildLevels(
  prefix: string,
  levels: readonly EffortLevel[],
): readonly ModelLevelOption[] {
  return levels.map((level) => ({
    id: `${prefix}-${level}` as ModelId,
    level,
    label: LEVEL_LABELS[level],
  }));
}

export const MODEL_FAMILIES: readonly ModelFamilyOption[] = [
  {
    id: "inherit",
    name: "Herdar modelo",
    description: "Usar a escolha da sessão",
    defaultModel: "inherit",
    session: false,
    levels: [],
  },
  {
    id: "neon",
    name: "Gemini 4 Neon",
    description: "Sessão · Padrão Pro/Ultra (Low a Extra)",
    defaultModel: "gemini-4-neon-high",
    session: true,
    xhighAsExtra: true,
    levels: buildLevels("gemini-4-neon", ["low", "medium", "high", "xhigh"]),
  },
  {
    id: "carbon",
    name: "Gemini 4 Carbon",
    description: "Sessão · Raciocínio profundo (Low a High)",
    defaultModel: "gemini-4-carbon-high",
    session: true,
    levels: buildLevels("gemini-4-carbon", ["low", "medium", "high"]),
  },
  {
    id: "hydrogen",
    name: "Gemini 4 Hydrogen",
    description: "Sessão · Todos os planos (Low a Extra)",
    defaultModel: "gemini-4-hydrogen-high",
    session: true,
    xhighAsExtra: true,
    levels: buildLevels("gemini-4-hydrogen", ["low", "medium", "high", "xhigh"]),
  },
  {
    id: "orchestrator",
    name: "Orchestrator",
    description: "Sessão · Planejador + Executor",
    defaultModel: "gemini-pro-orchestrator-neon",
    session: true,
    levels: [
      {
        id: "gemini-pro-orchestrator-neon",
        level: "neon",
        label: "Planner Neon (padrão Pro/Ultra)",
      },
      {
        id: "gemini-pro-orchestrator",
        level: "carbon",
        label: "Planner Carbon (Pro/Ultra e Enterprise)",
      },
      {
        id: "gemini-pro-orchestrator-argon",
        level: "argon",
        label: "Planner Argon (descontinuação em 30/11/2026)",
      },
    ],
  },
  {
    id: "argon",
    name: "Gemini 4 Argon",
    description: "Sessão · Low a High (até 30/11/2026)",
    defaultModel: "gemini-4-argon-high",
    session: true,
    deprecatedAt: "2026-11-30",
    levels: buildLevels("gemini-4-argon", ["low", "medium", "high"]),
  },
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    description: "Sessão rápida · Low a High (até 30/11/2026)",
    defaultModel: "gemini-3.8-flash-high",
    session: true,
    deprecatedAt: "2026-11-30",
    levels: buildLevels("gemini-3.8-flash", ["low", "medium", "high"]),
  },
  {
    id: "claude-opus-5-5",
    name: "Claude Opus 5.5",
    description: "Anthropic · Low a High",
    defaultModel: "claude-opus-5-5-high",
    session: true,
    levels: buildLevels("claude-opus-5-5", ["low", "medium", "high"]),
  },
  {
    id: "claude-sonnet-5-5",
    name: "Claude Sonnet 5.5",
    description: "Anthropic · Low a High",
    defaultModel: "claude-sonnet-5-5-high",
    session: true,
    levels: buildLevels("claude-sonnet-5-5", ["low", "medium", "high"]),
  },
  {
    id: "flash_lite",
    name: "Flash Lite",
    description: "Categoria ultrarrápida do subagente",
    defaultModel: "flash_lite",
    session: false,
    levels: [],
  },
  {
    id: "flash",
    name: "Flash",
    description: "Categoria do subagente",
    defaultModel: "flash",
    session: false,
    levels: [],
  },
  {
    id: "pro",
    name: "Pro",
    description: "Categoria do subagente",
    defaultModel: "pro",
    session: false,
    levels: [],
  },
];

export function findModelFamily(model: ModelId): ModelFamilyOption {
  return (
    MODEL_FAMILIES.find(
      (f) => f.defaultModel === model || f.levels.some((l) => l.id === model),
    ) ?? MODEL_FAMILIES[0]
  );
}

export function modelFamily(model: ModelId) {
  return findModelFamily(model).id;
}
export function isSessionModel(model: ModelId) {
  return findModelFamily(model).session;
}
export function modelLabel(model: ModelId): string {
  const family = findModelFamily(model);
  if (family.id === "orchestrator") {
    if (model === "gemini-pro-orchestrator-neon") return "Orchestrator (Neon)";
    if (model === "gemini-pro-orchestrator") return "Orchestrator (Carbon)";
    if (model === "gemini-pro-orchestrator-argon") return "Orchestrator (Argon)";
  }
  const level = family.levels.find((l) => l.id === model);
  return level ? `${family.name} · ${level.level.toUpperCase()}` : family.name;
}
export function modelTier(
  model: ModelId,
): "inherit" | "flash_lite" | "flash" | "pro" {
  return isSessionModel(model)
    ? "inherit"
    : (model as "inherit" | "flash_lite" | "flash" | "pro");
}
export function sessionCommand(
  slug: string,
  model: ModelId,
  mainAgent = true,
): string {
  // Slug and model must come from the validated config/catalog, not arbitrary shell input.
  return `agy${mainAgent ? ` --agent ${slug}` : ""} --model ${model}`;
}
export function modelSetupGuide(a: {
  slug: string;
  model: ModelId;
  mainAgent: boolean;
  subagent: boolean;
}): string {
  const family = findModelFamily(a.model);
  const xhighNote =
    a.model.endsWith("-xhigh")
      ? " No seletor visual do App/IDE, o nível XHigh aparece como **Extra**."
      : "";
  const claudeNote = family.id.startsWith("claude-")
    ? "\nModelos Claude dependem da liberação do plano pago (Google AI Pro sem trial, Google AI Ultra ou Enterprise).\n"
    : "";
  const deprecationNote =
    family.deprecatedAt || a.model === "gemini-pro-orchestrator-argon"
      ? "\n> **Aviso de ciclo de vida:** A documentação oficial do Antigravity informa que os modelos **Gemini 4 Argon** e **Gemini 3.8 Flash** serão removidos em **30/11/2026**. Prefira **Gemini 4 Neon**, **Gemini 4 Carbon** ou **Gemini 4 Hydrogen** para novos fluxos.\n"
      : "";
  return `# Ativar ${modelLabel(a.model)}

Esta é uma preferência de sessão do Paktro. O arquivo do agente exporta \`model: inherit\` porque o YAML de agentes do Antigravity aceita apenas tiers (\`inherit\`, \`flash_lite\`, \`flash\` ou \`pro\`) — o modelo concreto e o nível de raciocínio são escolhidos na sessão em que você conversa com o agente.
${deprecationNote}
## Antigravity App e IDE (sem comando)

Não precisa rodar nada no terminal para usar no App/IDE:

1. Instale os arquivos \`.agents/\` na raiz do projeto.
2. No seletor abaixo da caixa de mensagem, escolha **${modelLabel(a.model)}**.${xhighNote}
3. ${a.mainAgent ? `Selecione o agente \`${a.slug}\` no App para a conversa.` : `Use um agente principal que possa delegar ao subagente \`${a.slug}\`.`}

## Antigravity CLI (opcional — apenas para terminal)

Na raiz do projeto, confira os modelos liberados para sua conta:

\`\`\`sh
agy models
\`\`\`

Se \`${a.model}\` aparecer na lista, inicie a sessão:

\`\`\`sh
${sessionCommand(a.slug, a.model, a.mainAgent)}
\`\`\`
${claudeNote}${a.subagent ? `\nAo usar \`${a.slug}\` como subagente, configure também a sessão principal com \`${a.model}\`; \`inherit\` utiliza o modelo do agente que delega.\n` : ""}
A disponibilidade depende da versão, conta e liberação do modelo. Se o identificador não aparecer, atualize o Antigravity e confira o seletor; não substitua silenciosamente por outro modelo.

## Referências

- https://antigravity.google/docs/subagents
- https://antigravity.google/docs/cli/headless/
- https://antigravity.google/docs/models
`;
}
