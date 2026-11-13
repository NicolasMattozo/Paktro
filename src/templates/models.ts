/** Session slugs verified with `agy models` on 2026-11-12.
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
] as const;
export type ModelId = (typeof MODEL_IDS)[number];
export const MODEL_FAMILIES = [
  {
    id: "inherit",
    name: "Herdar modelo",
    description: "Usar a escolha da sessão",
    defaultModel: "inherit",
  },
  {
    id: "hydrogen",
    name: "Gemini 4 Hydrogen",
    description: "Modelo da sessão (Low a Extra)",
    defaultModel: "gemini-4-hydrogen-high",
  },
  {
    id: "argon",
    name: "Gemini 4 Argon",
    description: "Modelo da sessão (Low a High)",
    defaultModel: "gemini-4-argon-high",
  },
  {
    id: "flash",
    name: "Flash",
    description: "Categoria do subagente",
    defaultModel: "flash",
  },
  {
    id: "pro",
    name: "Pro",
    description: "Categoria do subagente",
    defaultModel: "pro",
  },
] as const;
export function modelFamily(model: ModelId) {
  return model.includes("hydrogen")
    ? "hydrogen"
    : model.includes("argon")
      ? "argon"
      : model;
}
export function isSessionModel(model: ModelId) {
  return model.startsWith("gemini-4-");
}
export function modelLabel(model: ModelId): string {
  if (!isSessionModel(model))
    return MODEL_FAMILIES.find((f) => f.id === model)!.name;
  const family = model.includes("hydrogen") ? "Hydrogen" : "Argon";
  return `Gemini 4 ${family} · ${model.split("-").at(-1)!.toUpperCase()}`;
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
  const xhighNote =
    a.model === "gemini-4-hydrogen-xhigh"
      ? " No seletor visual do App/IDE, o nível XHigh aparece como **Extra**."
      : "";
  return `# Ativar ${modelLabel(a.model)}

Esta é uma preferência de sessão do Agex. O arquivo do agente usa \`model: inherit\`: a plataforma deve iniciar a sessão no modelo selecionado, pois o YAML de agentes customizados documenta apenas \`inherit\`, \`flash\` e \`pro\`.

## Antigravity App e IDE

1. Instale os arquivos \`.agents/\` na raiz do projeto.
2. No seletor abaixo da caixa de mensagem, escolha **${modelLabel(a.model)}**.${xhighNote}
3. ${a.mainAgent ? `Selecione o agente \`${a.slug}\` no App para a conversa.` : `Use um agente principal que possa delegar ao subagente \`${a.slug}\`.`}

## Antigravity CLI

Na raiz do projeto, confira os modelos liberados para sua conta:

\`\`\`sh
agy models
\`\`\`

Se \`${a.model}\` aparecer na lista, inicie a sessão:

\`\`\`sh
${sessionCommand(a.slug, a.model, a.mainAgent)}
\`\`\`
${a.subagent ? `\nAo usar \`${a.slug}\` como subagente, configure também a sessão principal com \`${a.model}\`; \`inherit\` utiliza o modelo do agente que delega.\n` : ""}
A disponibilidade depende da versão, conta e liberação do modelo. Se o identificador não aparecer, atualize o Antigravity e confira o seletor; não substitua silenciosamente por outro modelo.

## Referências

- https://antigravity.google/docs/subagents
- https://antigravity.google/docs/cli/headless/
- https://antigravity.google/docs/models
`;
}
