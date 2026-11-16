import { useState } from "react";
import {
  Plus,
  Trash2,
  Info,
  Search,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import ModelPicker from "./model-picker";
import PlatformPicker from "./platform-picker";
import McpHelp from "./mcp-help";
import { Icon } from "../ui/icon";
import { PLATFORM_ADAPTERS } from "@/platforms/registry";
import {
  defaultAntigravityTarget,
  defaultChatGptPluginTarget,
  defaultClaudeCodeTarget,
  defaultCodexTarget,
} from "@/platforms/common/convert";
import {
  activationToLegacyTrigger,
  legacyTriggerToActivation,
} from "@/platforms/common/instructions";
import { parsePatterns, slugify } from "@/platforms/common/paths";
import { TOOL_CATALOG, TOOL_GROUPS, TOOL_SOURCES } from "@/templates/tools";
import { CLAUDE_CODE_TOOLS } from "@/platforms/claude-code/adapter";
import { RULES, SKILLS } from "@/templates/catalog";
import type {
  AgentPackV2,
  AntigravityTargetConfig,
  ChatGptPluginTargetConfig,
  ClaudeCodeTargetConfig,
  ClaudeCodeToolName,
  CodexTargetConfig,
  CommonAgentPack,
  CommonMcpServer,
  CommonRule,
  CommonSkill,
  InstructionActivation,
  Rule,
} from "@/types";

export const STEPS = [
  { title: "Identidade", icon: "bot" },
  { title: "Ferramentas", icon: "code" },
  { title: "Regras e skills", icon: "boxes" },
  { title: "Integrações", icon: "plug" },
];

type Props = {
  pack: AgentPackV2;
  updatePack: (next: AgentPackV2) => void;
  step: number;
  setStep: (step: number) => void;
};

function ruleOutputHint(
  rule: CommonRule,
  target: AgentPackV2["target"],
): string {
  if (!rule.enabled) return "Desativada — não incluída na exportação";
  if (target === "antigravity") {
    return `.agents/rules/${rule.id}.md`;
  }
  if (target === "claude-code") {
    if (rule.activation.type === "always") {
      return `.claude/rules/${rule.id}.md (sem frontmatter — sempre ativa)`;
    }
    if (rule.activation.type === "path") {
      return `.claude/rules/${rule.id}.md (paths: YAML)`;
    }
    if (rule.activation.type === "manual") {
      return `.claude/skills/${rule.id}/SKILL.md (manual via /${rule.id})`;
    }
    return `.claude/skills/${rule.id}/SKILL.md (sob demanda por descrição)`;
  }
  if (target === "codex") {
    if (rule.activation.type === "always") {
      return "Incluída em AGENTS.md";
    }
    if (rule.activation.type === "path") {
      return "Anotada em AGENTS.md (sem gerar AGENTS.override.md)";
    }
    if (rule.activation.type === "manual") {
      return `.agents/skills/${rule.id}/SKILL.md (invoque via $${rule.id})`;
    }
    return `.agents/skills/${rule.id}/SKILL.md (descoberta por contexto)`;
  }
  return rule.activation.type === "always"
    ? "Incorporada em skills/<slug>/SKILL.md"
    : "Aviso: plugins ChatGPT não possuem gatilho separado para esta ativação";
}

export default function AgentEditor({
  pack,
  updatePack,
  step,
  setStep,
}: Props) {
  const [toolQuery, setToolQuery] = useState("");
  const c = pack.common;
  const target = pack.target;
  const adapter = PLATFORM_ADAPTERS[target];

  const ag =
    pack.targets.antigravity ?? defaultAntigravityTarget(c.capabilityIntents);
  const cc =
    pack.targets.claudeCode ?? defaultClaudeCodeTarget(c.capabilityIntents);
  const cx = pack.targets.codex ?? defaultCodexTarget();
  const cgp = pack.targets.chatgptPlugin ?? defaultChatGptPluginTarget();

  function updateCommon(patch: Partial<CommonAgentPack>) {
    updatePack({
      ...pack,
      common: {
        ...pack.common,
        ...patch,
      },
    });
  }

  function updateAntigravity(patch: Partial<AntigravityTargetConfig>) {
    updatePack({
      ...pack,
      targets: {
        ...pack.targets,
        antigravity: { ...ag, ...patch },
      },
    });
  }

  function updateClaudeCode(patch: Partial<ClaudeCodeTargetConfig>) {
    updatePack({
      ...pack,
      targets: {
        ...pack.targets,
        claudeCode: { ...cc, ...patch },
      },
    });
  }

  function updateCodex(patch: Partial<CodexTargetConfig>) {
    updatePack({
      ...pack,
      targets: {
        ...pack.targets,
        codex: { ...cx, ...patch },
      },
    });
  }

  function updateChatGptPlugin(patch: Partial<ChatGptPluginTargetConfig>) {
    updatePack({
      ...pack,
      targets: {
        ...pack.targets,
        chatgptPlugin: { ...cgp, ...patch },
      },
    });
  }

  function patchRule(id: string, patch: Partial<CommonRule>) {
    updateCommon({
      rules: c.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  }

  function patchSkill(id: string, patch: Partial<CommonSkill>) {
    updateCommon({
      skills: c.skills.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  }

  function patchMcp(index: number, patch: Partial<CommonMcpServer>) {
    updateCommon({
      mcpServers: c.mcpServers.map((m, i) =>
        i === index ? { ...m, ...patch } : m,
      ),
    });
  }

  function freshId(prefix: string, items: { id: string }[]) {
    let n = 1;
    while (items.some((i) => i.id === `${prefix}-${n}`)) n++;
    return `${prefix}-${n}`;
  }

  const visibleAgTools = TOOL_CATALOG.filter((t) =>
    `${t.id} ${t.name} ${t.description}`
      .toLowerCase()
      .includes(toolQuery.toLowerCase()),
  );

  const visibleClaudeTools = CLAUDE_CODE_TOOLS.filter((t) =>
    `${t.id} ${t.name} ${t.description}`
      .toLowerCase()
      .includes(toolQuery.toLowerCase()),
  );

  const slugSuffix =
    target === "codex"
      ? ".toml"
      : target === "chatgpt-plugin"
        ? " (plugin)"
        : ".md";

  const hasStdioOnChatGpt =
    target === "chatgpt-plugin" &&
    c.mcpServers.some((m) => m.enabled && m.transport === "stdio");

  return (
    <div className="editor-card">
      <nav className="steps" aria-label="Etapas do editor">
        {STEPS.map((s, i) => (
          <button
            key={s.title}
            className={step === i ? "active" : ""}
            onClick={() => setStep(i)}
            aria-current={step === i ? "step" : undefined}
          >
            <span className="step-number">{i + 1}</span>
            <span>{s.title}</span>
          </button>
        ))}
      </nav>
      <div className="editor-body">
        {step === 0 && (
          <>
            <PlatformPicker pack={pack} onSelect={updatePack} />

            <div className="section-heading">
              <span className="section-icon">
                <Icon name="bot" />
              </span>
              <div>
                <h2>Vamos dar uma identidade?</h2>
                <p>
                  Defina quem é o especialista, o que ele resolve e onde ele atua em{" "}
                  <strong>{adapter.catalog.shortName}</strong>.
                </p>
              </div>
            </div>

            <label className="field">
              Nome do agente <span className="required">*</span>
              <input
                value={c.name}
                maxLength={100}
                placeholder="Ex.: Revisor de código"
                onChange={(e) => updateCommon({ name: e.target.value })}
              />
            </label>

            <div className="field">
              <label htmlFor="agent-slug">
                Nome do arquivo <span className="required">*</span>
              </label>
              <div className="input-suffix">
                <input
                  id="agent-slug"
                  aria-describedby="slug-help"
                  value={c.slug}
                  maxLength={64}
                  onChange={(e) => updateCommon({ slug: e.target.value })}
                />
                <span>{slugSuffix}</span>
              </div>
              <small id="slug-help">
                Letras minúsculas, números e hífens.{" "}
                <button
                  type="button"
                  className="inline-button"
                  onClick={() => updateCommon({ slug: slugify(c.name) })}
                >
                  Usar o nome do agente
                </button>
              </small>
            </div>

            <label className="field">
              Descrição <span className="required">*</span>
              <textarea
                value={c.description}
                maxLength={2000}
                rows={3}
                onChange={(e) => updateCommon({ description: e.target.value })}
                placeholder="Quando este agente deve ser utilizado?"
              />
              <small>
                Ajuda o {adapter.catalog.shortName} a escolher o conjunto certo
                para cada tarefa.
              </small>
            </label>

            <label className="field">
              Especialidade
              <input
                value={c.specialty}
                maxLength={300}
                onChange={(e) => updateCommon({ specialty: e.target.value })}
                placeholder="Ex.: APIs, arquitetura ou automação"
              />
            </label>

            <label className="field">
              Objetivo principal <span className="required">*</span>
              <textarea
                value={c.goal}
                maxLength={2000}
                rows={3}
                onChange={(e) => updateCommon({ goal: e.target.value })}
              />
            </label>

            <ModelPicker pack={pack} updatePack={updatePack} />

            {target === "antigravity" && (
              <div className="field">
                <span>Papel do agente</span>
                <div className="role-options">
                  <label className="check-card">
                    <input
                      type="checkbox"
                      checked={ag.mainAgent}
                      onChange={(e) =>
                        updateAntigravity({ mainAgent: e.target.checked })
                      }
                    />
                    <span>
                      <strong>Agente principal</strong>
                      <small>Disponível para iniciar conversas</small>
                    </span>
                  </label>
                  <label className="check-card">
                    <input
                      type="checkbox"
                      checked={ag.subagent}
                      onChange={(e) =>
                        updateAntigravity({ subagent: e.target.checked })
                      }
                    />
                    <span>
                      <strong>Subagente</strong>
                      <small>Pode receber tarefas de outro agente</small>
                    </span>
                  </label>
                </div>
              </div>
            )}

            {target === "claude-code" && (
              <div className="field">
                <span>Exposição no projeto (Claude Code)</span>
                <div className="role-options role-options-triple">
                  {(
                    [
                      {
                        id: "subagent",
                        title: "Subagente",
                        desc: ".claude/agents/<slug>.md",
                      },
                      {
                        id: "main",
                        title: "Principal",
                        desc: "Regras, skills e CLAUDE.md opcional",
                      },
                      {
                        id: "both",
                        title: "Ambos",
                        desc: "Subagente + estrutura do projeto",
                      },
                    ] as const
                  ).map((opt) => (
                    <button
                      type="button"
                      key={opt.id}
                      className={`model-card ${cc.exposure === opt.id ? "active" : ""}`}
                      aria-pressed={cc.exposure === opt.id}
                      onClick={() => updateClaudeCode({ exposure: opt.id })}
                    >
                      <strong>{opt.title}</strong>
                      <small>{opt.desc}</small>
                    </button>
                  ))}
                </div>
                <label className="check-card" style={{ marginTop: 10 }}>
                  <input
                    type="checkbox"
                    checked={cc.includeClaudeMd}
                    onChange={(e) =>
                      updateClaudeCode({ includeClaudeMd: e.target.checked })
                    }
                  />
                  <span>
                    <strong>Gerar/atualizar bloco em CLAUDE.md</strong>
                    <small>
                      Usa marcadores gerenciados <code>&lt;!-- AGEX:BEGIN --&gt;</code>{" "}
                      para nunca sobrescrever instruções existentes sem sua confirmação.
                    </small>
                  </span>
                </label>
                {cc.includeClaudeMd && (
                  <label className="check-card" style={{ marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={cc.referenceAgentsMd}
                      onChange={(e) =>
                        updateClaudeCode({
                          referenceAgentsMd: e.target.checked,
                        })
                      }
                    />
                    <span>
                      <strong>Referenciar @AGENTS.md dentro do CLAUDE.md</strong>
                      <small>
                        Evita duplicação quando você já mantém um{" "}
                        <code>AGENTS.md</code> no repositório.
                      </small>
                    </span>
                  </label>
                )}
              </div>
            )}

            {target === "codex" && (
              <div className="field">
                <span>Exposição no Codex</span>
                <div className="role-options role-options-triple">
                  {(
                    [
                      {
                        id: "subagent",
                        title: "Subagente (.toml)",
                        desc: ".codex/agents/<slug>.toml",
                      },
                      {
                        id: "root",
                        title: "Projeto (AGENTS.md)",
                        desc: "Instruções na raiz + skills",
                      },
                      {
                        id: "both",
                        title: "Ambos",
                        desc: "AGENTS.md + .codex/agents/<slug>.toml",
                      },
                    ] as const
                  ).map((opt) => (
                    <button
                      type="button"
                      key={opt.id}
                      className={`model-card ${cx.exposure === opt.id ? "active" : ""}`}
                      aria-pressed={cx.exposure === opt.id}
                      onClick={() =>
                        updateCodex({
                          exposure: opt.id,
                          includeAgentsMd:
                            opt.id === "root" || opt.id === "both"
                              ? true
                              : cx.includeAgentsMd,
                        })
                      }
                    >
                      <strong>{opt.title}</strong>
                      <small>{opt.desc}</small>
                    </button>
                  ))}
                </div>
                {cx.exposure === "subagent" && (
                  <label className="check-card" style={{ marginTop: 10 }}>
                    <input
                      type="checkbox"
                      checked={cx.includeAgentsMd}
                      onChange={(e) =>
                        updateCodex({ includeAgentsMd: e.target.checked })
                      }
                    />
                    <span>
                      <strong>Também incluir AGENTS.md na raiz</strong>
                      <small>
                        Mesclado via bloco gerenciado sem apagar conteúdo próprio
                        do projeto.
                      </small>
                    </span>
                  </label>
                )}
              </div>
            )}

            {target === "chatgpt-plugin" && (
              <label className="field">
                Versão do manifesto (plugin.json)
                <input
                  value={cgp.version}
                  maxLength={32}
                  placeholder="1.0.0"
                  onChange={(e) =>
                    updateChatGptPlugin({ version: e.target.value })
                  }
                />
                <small>
                  Formato SemVer para <code>plugin.json</code>. Papéis locais de
                  IDE ficam ocultos por não se aplicarem a plugins portáteis.
                </small>
              </label>
            )}

            <details className="advanced">
              <summary>Instruções avançadas e organização</summary>
              <label className="field">
                Instruções adicionais
                <textarea
                  value={c.instructions}
                  maxLength={12000}
                  rows={5}
                  onChange={(e) =>
                    updateCommon({ instructions: e.target.value })
                  }
                />
              </label>
              <label className="field">
                Etiquetas (separadas por vírgula)
                <input
                  value={c.tags.join(", ")}
                  onChange={(e) =>
                    updateCommon({
                      tags: e.target.value
                        .split(",")
                        .map((s) => s.trim().slice(0, 32))
                        .slice(0, 10),
                    })
                  }
                />
              </label>
            </details>
          </>
        )}

        {step === 1 && (
          <>
            <div className="section-heading">
              <span className="section-icon">
                <Icon name="code" />
              </span>
              <div>
                <h2>As ferramentas certas</h2>
                <p>
                  Controles reais de capacidades e permissões para{" "}
                  <strong>{adapter.catalog.shortName}</strong>.
                </p>
              </div>
            </div>

            {target === "antigravity" && (
              <>
                <div className="tool-toolbar">
                  <div className="search-input">
                    <Search size={16} />
                    <input
                      aria-label="Buscar ferramentas"
                      placeholder="Buscar ferramenta ou capacidade…"
                      value={toolQuery}
                      onChange={(e) => setToolQuery(e.target.value)}
                    />
                  </div>
                  <span>
                    {ag.tools.length} de {TOOL_CATALOG.length} selecionadas
                  </span>
                </div>
                {TOOL_GROUPS.map((group) => {
                  const tools = visibleAgTools.filter(
                    (t) => t.group === group.id,
                  );
                  if (!tools.length) return null;
                  return (
                    <fieldset className="tool-group" key={group.id}>
                      <legend>
                        <Icon name={group.icon} size={15} />
                        {group.name}
                      </legend>
                      <div className="selection-list">
                        {tools.map((tool) => (
                          <label
                            className={`check-card ${ag.tools.includes(tool.id) ? "checked" : ""}`}
                            key={tool.id}
                          >
                            <input
                              type="checkbox"
                              checked={ag.tools.includes(tool.id)}
                              onChange={(e) =>
                                updateAntigravity({
                                  tools: e.target.checked
                                    ? [...ag.tools, tool.id]
                                    : ag.tools.filter((t) => t !== tool.id),
                                })
                              }
                            />
                            <span>
                              <strong>{tool.name}</strong>
                              <code>{tool.id}</code>
                              <small>{tool.description}</small>
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
                {!visibleAgTools.length && (
                  <p className="small muted">
                    Nenhuma ferramenta encontrada. Tente outro termo.
                  </p>
                )}
                <div className="tool-sources">
                  <span>Catálogo verificado em 12/11/2026.</span>
                  <a href={TOOL_SOURCES.standard} target="_blank" rel="noopener noreferrer">
                    Ferramentas oficiais <ExternalLink size={11} />
                  </a>
                  <a href={TOOL_SOURCES.mcp} target="_blank" rel="noopener noreferrer">
                    MCP <ExternalLink size={11} />
                  </a>
                  <a href={TOOL_SOURCES.agents} target="_blank" rel="noopener noreferrer">
                    Permissões do agente <ExternalLink size={11} />
                  </a>
                </div>
                <p className="small muted">
                  A disponibilidade depende da versão, do ambiente e das
                  permissões da sessão. O navegador é acessado pelo fluxo de
                  subagentes do Antigravity. Ferramentas de servidores MCP são
                  configuradas na etapa Integrações.
                </p>
                <label className="field">
                  Política de execução de comandos
                  <select
                    value={ag.commandExecutionPolicy}
                    onChange={(e) =>
                      updateAntigravity({
                        commandExecutionPolicy: e.target
                          .value as AntigravityTargetConfig["commandExecutionPolicy"],
                      })
                    }
                  >
                    <option value="sandbox">
                      Sandbox — respeitar o ambiente isolado
                    </option>
                    <option value="off">Off — desativar execução automática</option>
                    <option value="auto">
                      Auto — decisão automática da plataforma
                    </option>
                    <option value="eager">
                      Eager — execução automática permissiva
                    </option>
                  </select>
                </label>
                <div className="info-box">
                  <Info size={18} />
                  <p>
                    As permissões efetivas também dependem da sessão e do
                    ambiente do Antigravity. Uma regra escrita no prompt não
                    bloqueia acesso a arquivos ou execução de comandos.
                  </p>
                </div>
              </>
            )}

            {target === "claude-code" && (
              <>
                <div className="tool-toolbar">
                  <div className="search-input">
                    <Search size={16} />
                    <input
                      aria-label="Buscar ferramentas"
                      placeholder="Buscar ferramenta nativa do Claude Code…"
                      value={toolQuery}
                      onChange={(e) => setToolQuery(e.target.value)}
                    />
                  </div>
                  <span>
                    {cc.tools.length} permitidas · {cc.disallowedTools.length}{" "}
                    bloqueadas
                  </span>
                </div>

                <fieldset className="tool-group">
                  <legend>Ferramentas permitidas (tools)</legend>
                  <div className="selection-list">
                    {visibleClaudeTools.map((tool) => {
                      const id = tool.id as ClaudeCodeToolName;
                      const checked = cc.tools.includes(id);
                      return (
                        <label
                          className={`check-card ${checked ? "checked" : ""}`}
                          key={tool.id}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const nextTools = e.target.checked
                                ? [...cc.tools, id]
                                : cc.tools.filter((t) => t !== id);
                              updateClaudeCode({
                                tools: nextTools,
                                disallowedTools: cc.disallowedTools.filter(
                                  (t) => !nextTools.includes(t),
                                ),
                              });
                            }}
                          />
                          <span>
                            <strong>{tool.name}</strong>
                            <code>{tool.id}</code>
                            <small>{tool.description}</small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <fieldset className="tool-group">
                  <legend>Ferramentas explicitamente bloqueadas (disallowedTools)</legend>
                  <div className="catalog-chips">
                    {CLAUDE_CODE_TOOLS.map((tool) => {
                      const id = tool.id as ClaudeCodeToolName;
                      const blocked = cc.disallowedTools.includes(id);
                      return (
                        <button
                          type="button"
                          key={tool.id}
                          aria-pressed={blocked}
                          className={blocked ? "danger-chip" : ""}
                          onClick={() => {
                            const nextDisallowed = blocked
                              ? cc.disallowedTools.filter((t) => t !== id)
                              : [...cc.disallowedTools, id];
                            updateClaudeCode({
                              disallowedTools: nextDisallowed,
                              tools: cc.tools.filter(
                                (t) => !nextDisallowed.includes(t),
                              ),
                            });
                          }}
                        >
                          {blocked ? `Bloqueada: ${tool.id}` : `Bloquear ${tool.id}`}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <label className="field">
                  Modo de permissão (permissionMode)
                  <select
                    value={cc.permissionMode}
                    onChange={(e) =>
                      updateClaudeCode({
                        permissionMode: e.target
                          .value as ClaudeCodeTargetConfig["permissionMode"],
                      })
                    }
                  >
                    {adapter.catalog.permissionModes.map((pm) => (
                      <option key={pm.id} value={pm.id}>
                        {pm.label}
                      </option>
                    ))}
                  </select>
                </label>

                {cc.permissionMode === "bypassPermissions" && (
                  <div className="warning" role="status">
                    <AlertTriangle size={15} /> Aviso de risco: <code>bypassPermissions</code>{" "}
                    pula confirmações no subagente. Use apenas em sandboxes isolados.
                  </div>
                )}

                <label className="field">
                  Isolamento de workspace (isolation)
                  <select
                    value={cc.isolation}
                    onChange={(e) =>
                      updateClaudeCode({
                        isolation: e.target
                          .value as ClaudeCodeTargetConfig["isolation"],
                      })
                    }
                  >
                    <option value="none">Nenhum — trabalhar no workspace atual</option>
                    <option value="worktree">
                      worktree — criar git worktree isolada para o subagente
                    </option>
                  </select>
                </label>
              </>
            )}

            {target === "codex" && (
              <>
                <div className="info-box">
                  <Info size={18} />
                  <p>
                    No OpenAI Codex, subagentes (<code>.codex/agents/*.toml</code>)
                    não usam lista granular de ferramentas por agente. Eles herdam
                    o sandbox e a política de aprovação da sessão principal.
                  </p>
                </div>
                <label className="field">
                  Recurso shell_tool no subagente ([features])
                  <select
                    value={cx.shellTool}
                    onChange={(e) =>
                      updateCodex({
                        shellTool: e.target
                          .value as CodexTargetConfig["shellTool"],
                      })
                    }
                  >
                    <option value="inherit">
                      Herdar sandbox da sessão principal (recomendado)
                    </option>
                    <option value="disabled">
                      Desabilitar shell_tool neste subagente (shell_tool = false)
                    </option>
                  </select>
                </label>
              </>
            )}

            {target === "chatgpt-plugin" && (
              <div className="info-box">
                <Info size={18} />
                <p>
                  Plugins para ChatGPT empacotam conhecimento em{" "}
                  <code>skills/*/SKILL.md</code> e conectores remotos{" "}
                  <code>mcp.json</code>. Não há controle local de ferramentas de
                  sistema de arquivos ou terminal.
                </p>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <div className="section-heading">
              <span className="section-icon">
                <Icon name="boxes" />
              </span>
              <div>
                <h2>Seu jeito de trabalhar</h2>
                <p>
                  Regras orientam. Skills ensinam como fazer. Abaixo mostramos como
                  cada item é emitido em <strong>{adapter.catalog.shortName}</strong>.
                </p>
              </div>
            </div>
            <div className="subheading">
              <h3>
                <span className="face-dot rule" aria-hidden="true" />
                Regras de comportamento
              </h3>
              <button
                type="button"
                className="text-button"
                disabled={c.rules.length >= 30}
                onClick={() =>
                  updateCommon({
                    rules: [
                      ...c.rules,
                      {
                        id: freshId("custom-rule", c.rules),
                        name: "Minha regra",
                        description:
                          "Orientação personalizada para este projeto.",
                        content:
                          "Siga esta orientação ao trabalhar no projeto.",
                        activation: { type: "always" },
                        enabled: true,
                      },
                    ],
                  })
                }
              >
                <Plus size={15} />
                Criar regra
              </button>
            </div>
            <div className="catalog-chips">
              {RULES.filter((r) => !c.rules.some((x) => x.id === r.id)).map(
                (r) => (
                  <button
                    type="button"
                    key={r.id}
                    disabled={c.rules.length >= 30}
                    onClick={() =>
                      updateCommon({
                        rules: [
                          ...c.rules,
                          {
                            id: r.id,
                            name: r.name,
                            description: r.description,
                            content: r.content,
                            activation: legacyTriggerToActivation(
                              r.trigger,
                              r.globs,
                              r.description,
                            ),
                            enabled: true,
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={13} />
                    {r.name}
                  </button>
                ),
              )}
            </div>
            {c.rules.map((r) => {
              const legacyAct = activationToLegacyTrigger(r.activation);
              return (
                <details
                  className={`item-editor ${!r.enabled ? "disabled-item" : ""}`}
                  key={r.id}
                >
                  <summary>
                    <span>
                      <span className="face-dot rule" aria-hidden="true" />
                      {r.name || r.id}
                    </span>
                    <span className="mini-badge">
                      {r.enabled ? "Ativa" : "Desativada"}
                    </span>
                  </summary>
                  <div className="item-body">
                    <p className="target-rule-hint">
                      Saída em <strong>{adapter.catalog.shortName}</strong>:{" "}
                      <code>{ruleOutputHint(r, target)}</code>
                    </p>
                    <div className="item-actions">
                      <label className="toggle-label">
                        <input
                          type="checkbox"
                          checked={r.enabled}
                          onChange={(e) =>
                            patchRule(r.id, { enabled: e.target.checked })
                          }
                        />
                        Incluir na exportação
                      </label>
                      <button
                        type="button"
                        className="icon-button danger"
                        aria-label={`Remover ${r.name}`}
                        onClick={() =>
                          updateCommon({
                            rules: c.rules.filter((x) => x.id !== r.id),
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <label className="field">
                      Título da regra
                      <input
                        value={r.name}
                        maxLength={100}
                        onChange={(e) =>
                          patchRule(r.id, { name: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      Descrição
                      <input
                        value={r.description}
                        maxLength={500}
                        onChange={(e) => {
                          const desc = e.target.value;
                          patchRule(r.id, {
                            description: desc,
                            activation:
                              r.activation.type === "automatic"
                                ? { type: "automatic", description: desc }
                                : r.activation,
                          });
                        }}
                      />
                    </label>
                    <label className="field">
                      Ativação
                      <select
                        value={legacyAct.trigger}
                        onChange={(e) => {
                          const nextTrig = e.target.value as Rule["trigger"];
                          const nextActivation: InstructionActivation =
                            legacyTriggerToActivation(
                              nextTrig,
                              legacyAct.globs,
                              r.description,
                            );
                          patchRule(r.id, { activation: nextActivation });
                        }}
                      >
                        <option value="always_on">Sempre ativa</option>
                        <option value="model_decision">
                          Decisão do modelo / contexto
                        </option>
                        <option value="glob">Por arquivos</option>
                        <option value="manual">Manual (menção / comando)</option>
                      </select>
                    </label>
                    {r.activation.type === "path" && (
                      <label className="field">
                        Padrões de arquivos
                        <input
                          placeholder="Ex.: src/**, tests/**"
                          value={legacyAct.globs}
                          maxLength={500}
                          onChange={(e) =>
                            patchRule(r.id, {
                              activation: {
                                type: "path",
                                patterns: parsePatterns(e.target.value),
                              },
                            })
                          }
                        />
                      </label>
                    )}
                    <label className="field">
                      Instruções
                      <textarea
                        value={r.content}
                        maxLength={12000}
                        rows={4}
                        onChange={(e) =>
                          patchRule(r.id, { content: e.target.value })
                        }
                      />
                    </label>
                  </div>
                </details>
              );
            })}

            <div className="subheading skill-heading">
              <h3>
                <span className="face-dot skill" aria-hidden="true" />
                Skills
              </h3>
              <button
                type="button"
                className="text-button"
                disabled={c.skills.length >= 30}
                onClick={() =>
                  updateCommon({
                    skills: [
                      ...c.skills,
                      {
                        id: freshId("custom-skill", c.skills),
                        name: "Minha skill",
                        description:
                          "Procedimento personalizado para tarefas deste projeto.",
                        content:
                          "1. Entenda o objetivo.\n2. Execute o procedimento.\n3. Verifique o resultado.",
                        enabled: true,
                      },
                    ],
                  })
                }
              >
                <Plus size={15} />
                Criar skill
              </button>
            </div>
            <div className="catalog-chips">
              {SKILLS.filter((s) => !c.skills.some((x) => x.id === s.id)).map(
                (s) => (
                  <button
                    type="button"
                    key={s.id}
                    disabled={c.skills.length >= 30}
                    onClick={() =>
                      updateCommon({ skills: [...c.skills, { ...s }] })
                    }
                  >
                    <Plus size={13} />
                    {s.name}
                  </button>
                ),
              )}
            </div>
            {c.skills.map((s) => (
              <details
                className={`item-editor ${!s.enabled ? "disabled-item" : ""}`}
                key={s.id}
              >
                <summary>
                  <span>
                    <span className="face-dot skill" aria-hidden="true" />
                    {s.name || s.id}
                  </span>
                  <span className="mini-badge">
                    {s.enabled ? "Ativa" : "Desativada"}
                  </span>
                </summary>
                <div className="item-body">
                  <div className="item-actions">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={(e) =>
                          patchSkill(s.id, { enabled: e.target.checked })
                        }
                      />
                      Incluir na exportação
                    </label>
                    <button
                      type="button"
                      className="icon-button danger"
                      aria-label={`Remover ${s.name}`}
                      onClick={() =>
                        updateCommon({
                          skills: c.skills.filter((x) => x.id !== s.id),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {target === "claude-code" && (
                    <label className="toggle-label" style={{ marginBottom: 10 }}>
                      <input
                        type="checkbox"
                        checked={cc.disableModelInvocationSkills.includes(s.id)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...cc.disableModelInvocationSkills, s.id]
                            : cc.disableModelInvocationSkills.filter(
                                (id) => id !== s.id,
                              );
                          updateClaudeCode({
                            disableModelInvocationSkills: next,
                          });
                        }}
                      />
                      Invocação manual apenas (/comando —{" "}
                      <code>disable-model-invocation: true</code>)
                    </label>
                  )}
                  <label className="field">
                    Título da skill
                    <input
                      value={s.name}
                      maxLength={100}
                      onChange={(e) => patchSkill(s.id, { name: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    Quando utilizar
                    <input
                      value={s.description}
                      maxLength={1000}
                      onChange={(e) =>
                        patchSkill(s.id, { description: e.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    Passo a passo
                    <textarea
                      value={s.content}
                      maxLength={12000}
                      rows={6}
                      onChange={(e) =>
                        patchSkill(s.id, { content: e.target.value })
                      }
                    />
                  </label>
                </div>
              </details>
            ))}
          </>
        )}

        {step === 3 && (
          <>
            <div className="section-heading">
              <span className="section-icon">
                <Icon name="plug" />
              </span>
              <div>
                <h2>Conecte outras possibilidades</h2>
                <p>
                  Configure os servidores MCP para{" "}
                  <strong>{adapter.catalog.shortName}</strong>.
                </p>
              </div>
            </div>

            <div className="info-box">
              <Info size={18} />
              <p>
                Saída gerada neste destino:{" "}
                <code>
                  {target === "antigravity"
                    ? ".agents/mcp_config.json"
                    : target === "claude-code"
                      ? ".mcp.json (type: http/stdio)"
                      : target === "codex"
                        ? ".codex/config.toml ([mcp_servers.<id>])"
                        : "mcp.json (type: streamable-http)"}
                </code>
                . Credenciais nunca são salvas no backup do Agex.
              </p>
            </div>

            {hasStdioOnChatGpt && (
              <div className="warning" role="alert">
                <strong>Incompatibilidade ChatGPT Web:</strong> servidores MCP{" "}
                <code>stdio</code> locais não funcionam no ChatGPT Web; use{" "}
                <code>Streamable HTTP (HTTPS)</code> ou desative os servidores
                locais abaixo.
              </div>
            )}

            <McpHelp />

            {c.mcpServers.map((m, index) => (
              <div className="item-editor item-body" key={index}>
                <div className="item-actions">
                  <strong className="mcp-server-title">
                    <span className="face-dot mcp" aria-hidden="true" />
                    {m.id || "novo-servidor"}
                  </strong>
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={m.enabled}
                      onChange={(e) =>
                        patchMcp(index, { enabled: e.target.checked })
                      }
                    />
                    Ativo
                  </label>
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label={`Remover ${m.id || `servidor ${index + 1}`}`}
                    onClick={() =>
                      updateCommon({
                        mcpServers: c.mcpServers.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <label className="field">
                  Identificador do servidor
                  <input
                    value={m.id}
                    maxLength={64}
                    placeholder="Ex.: postgres, github ou meu-mcp"
                    onChange={(e) => patchMcp(index, { id: e.target.value })}
                  />
                  <small>
                    Letras minúsculas, números e hífens (chave em{" "}
                    <code>
                      {target === "codex" ? "mcp_servers" : "mcpServers"}
                    </code>
                    ).
                  </small>
                </label>
                <label className="field">
                  Transporte
                  <select
                    value={m.transport}
                    onChange={(e) =>
                      patchMcp(index, {
                        transport: e.target.value as CommonMcpServer["transport"],
                      })
                    }
                  >
                    <option value="stdio">
                      Programa local (stdio)
                      {target === "chatgpt-plugin"
                        ? " — incompatível com ChatGPT Web"
                        : ""}
                    </option>
                    <option value="http">
                      Servidor remoto (Streamable HTTP)
                    </option>
                  </select>
                </label>
                {m.transport === "stdio" ? (
                  <>
                    <label className="field">
                      Comando
                      <input
                        value={m.command}
                        maxLength={200}
                        placeholder="Ex.: uvx, python3, npx, docker ou /caminho/binario"
                        onChange={(e) =>
                          patchMcp(index, { command: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      Argumentos (um por linha)
                      <textarea
                        rows={3}
                        placeholder={"Ex.:\n-m\nmeu_servidor_mcp"}
                        value={m.args.join("\n")}
                        onChange={(e) =>
                          patchMcp(index, {
                            args: e.target.value
                              .split("\n")
                              .slice(0, 30)
                              .map((s) => s.slice(0, 300)),
                          })
                        }
                      />
                    </label>
                  </>
                ) : (
                  <label className="field">
                    URL do servidor
                    <input
                      type="url"
                      value={m.serverUrl}
                      maxLength={2000}
                      placeholder="https://seu-servidor.com/mcp"
                      onChange={(e) =>
                        patchMcp(index, { serverUrl: e.target.value })
                      }
                    />
                  </label>
                )}
              </div>
            ))}

            <button
              type="button"
              className="button secondary full-width"
              disabled={c.mcpServers.length >= 20}
              onClick={() =>
                updateCommon({
                  mcpServers: [
                    ...c.mcpServers,
                    {
                      id: freshId("mcp", c.mcpServers),
                      transport: target === "chatgpt-plugin" ? "http" : "stdio",
                      command: "",
                      args: [],
                      serverUrl: "",
                      enabled: true,
                    },
                  ],
                })
              }
            >
              <Plus size={17} />
              Adicionar servidor MCP
            </button>
            <p className="muted small">
              A ponte local do Agex (Agex Bridge) é uma integração separada.
              Acesse “Ponte local” no menu para conectar sua IA e sincronizar
              seus conjuntos com ela.
            </p>
          </>
        )}
      </div>
      <div className="editor-footer">
        <span>Etapa {step + 1} de 4</span>
        <div>
          {step > 0 && (
            <button
              type="button"
              className="button secondary"
              onClick={() => setStep(step - 1)}
            >
              Voltar
            </button>
          )}
          {step < 3 && (
            <button
              type="button"
              className="button primary"
              onClick={() => setStep(step + 1)}
            >
              Continuar <span aria-hidden="true">→</span>
            </button>
          )}
          {step === 3 && (
            <span className="completion-note">
              Confira a prévia e exporte seu pacote.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
