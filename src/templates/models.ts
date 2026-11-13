/** Session slugs verified with `agy models` on 2026-11-13 (excluding GPT-OSS).
 * The documented custom-agent YAML accepts tiers; concrete session choices
 * therefore export `inherit` and explicit activation instructions, never an
 * unverified frontmatter slug or an assumed tier-to-family mapping.
 */
export const MODEL_IDS = [
  "inherit",
  "flash",
  "pro",
  "gemini-4-hydrogen-low",
  "gemini-4-hydrogen-medium",
  "gemini-4-hydrogen-high",
  "gemini-4-hydrogen-xhigh",
  "gemini-4-argon-low",
  "gemini-4-argon-medium",
  "gemini-4-argon-high",
  "gemini-3.8-flash-low",
  "gemini-3.8-flash-medium",
  "gemini-3.8-flash-high",
  "gemini-pro-orchestrator-g1-pro",
  "claude-opus-5-5-low",
  "claude-opus-5-5-medium",
  "claude-opus-5-5-high",
  "claude-sonnet-5-5-low",
  "claude-sonnet-5-5-medium",
  "claude-sonnet-5-5-high",
] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export type EffortLevel = "low" | "medium" | "high" | "xhigh";

export interface ModelLevelOption {
  readonly id: ModelId;
  readonly level: EffortLevel;
  readonly label: string;
}

export interface ModelFamilyOption {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly defaultModel: ModelId;
  readonly session: boolean;
  readonly xhighAsExtra?: boolean;
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
    id: "hydrogen",
    name: "Gemini 4 Hydrogen",
    description: "Sessão · Low a Extra",
    defaultModel: "gemini-4-hydrogen-high",
    session: true,
    xhighAsExtra: true,
    levels: buildLevels("gemini-4-hydrogen", ["low", "medium", "high", "xhigh"]),
  },
  {
    id: "argon",
    name: "Gemini 4 Argon",
    description: "Sessão · Low a High",
    defaultModel: "gemini-4-argon-high",
    session: true,
    levels: buildLevels("gemini-4-argon", ["low", "medium", "high"]),
  },
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    description: "Sessão rápida · Low a High",
    defaultModel: "gemini-3.8-flash-high",
    session: true,
    levels: buildLevels("gemini-3.8-flash", ["low", "medium", "high"]),
  },
  {
    id: "orchestrator-argon",
    name: "Orchestrator (Argon)",
    description: "Sessão · Planejamento Argon",
    defaultModel: "gemini-pro-orchestrator-g1-pro",
    session: true,
    levels: [],
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
  const level = family.levels.find((l) => l.id === model);
  return level ? `${family.name} · ${level.level.toUpperCase()}` : family.name;
}
export function modelTier(model: ModelId): "inherit" | "flash" | "pro" {
  return isSessionModel(model)
    ? "inherit"
    : (model as "inherit" | "flash" | "pro");
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
    a.model === "gemini-4-hydrogen-xhigh"
      ? " No seletor visual do App/IDE, o nível XHigh aparece como **Extra**."
      : "";
  const claudeNote = family.id.startsWith("claude-")
    ? "\nModelos Claude dependem da liberação do plano ou do projeto Google Cloud vinculado à conta.\n"
    : "";
  return `# Ativar ${modelLabel(a.model)}

Esta é uma preferência de sessão do Agex. O arquivo do agente exporta \`model: inherit\` porque o YAML de agentes do Antigravity aceita apenas \`inherit\`, \`flash\` ou \`pro\` — o modelo exato e a força são escolhidos na sessão em que você conversa com o agente.

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
