import ModelPicker from "./model-picker";
import McpHelp from "./mcp-help";
import { useState } from "react";
import { TOOL_CATALOG, TOOL_GROUPS, TOOL_SOURCES } from "@/templates/tools";
import { Plus, Trash2, Info, Search, ExternalLink } from "lucide-react";
import type { AgentConfig, Rule, Skill, McpServer } from "@/types";
import { RULES, SKILLS } from "@/templates/catalog";
import { slugify } from "@/schemas/config";
import { Icon } from "../ui/icon";
export const STEPS = [
  { title: "Identidade", icon: "bot" },
  { title: "Ferramentas", icon: "code" },
  { title: "Regras e skills", icon: "boxes" },
  { title: "Integrações", icon: "plug" },
];
type Props = {
  agent: AgentConfig;
  update: (patch: Partial<AgentConfig>) => void;
  step: number;
  setStep: (step: number) => void;
};
export default function AgentEditor({
  agent: a,
  update,
  step,
  setStep,
}: Props) {
  const [toolQuery, setToolQuery] = useState("");
  const visibleTools = TOOL_CATALOG.filter((t) =>
    `${t.id} ${t.name} ${t.description}`
      .toLowerCase()
      .includes(toolQuery.toLowerCase()),
  );
  function patchRule(id: string, patch: Partial<Rule>) {
    update({
      rules: a.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  }
  function patchSkill(id: string, patch: Partial<Skill>) {
    update({
      skills: a.skills.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  }
  function patchMcp(index: number, patch: Partial<McpServer>) {
    update({
      mcpServers: a.mcpServers.map((m, i) =>
        i === index ? { ...m, ...patch } : m,
      ),
    });
  }
  function freshId(prefix: string, items: { id: string }[]) {
    let n = 1;
    while (items.some((i) => i.id === `${prefix}-${n}`)) n++;
    return `${prefix}-${n}`;
  }
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
            <div className="section-heading">
              <span className="section-icon">
                <Icon name="bot" />
              </span>
              <div>
                <h2>Vamos dar uma identidade?</h2>
                <p>Defina quem é seu agente e o que ele faz.</p>
              </div>
            </div>
            <label className="field">
              Nome do agente <span className="required">*</span>
              <input
                value={a.name}
                maxLength={100}
                placeholder="Ex.: Revisor de código"
                onChange={(e) => update({ name: e.target.value })}
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
                  value={a.slug}
                  maxLength={64}
                  onChange={(e) => update({ slug: e.target.value })}
                />
                <span>.md</span>
              </div>
              <small id="slug-help">
                Letras minúsculas, números e hífens.{" "}
                <button
                  className="inline-button"
                  onClick={() => update({ slug: slugify(a.name) })}
                >
                  Usar o nome do agente
                </button>
              </small>
            </div>
            <label className="field">
              Descrição <span className="required">*</span>
              <textarea
                value={a.description}
                maxLength={2000}
                rows={3}
                onChange={(e) => update({ description: e.target.value })}
                placeholder="Quando este agente deve ser utilizado?"
              />
              <small>
                Ajuda o Antigravity a escolher o agente certo para cada tarefa.
              </small>
            </label>
            <label className="field">
              Especialidade
              <input
                value={a.specialty}
                maxLength={300}
                onChange={(e) => update({ specialty: e.target.value })}
                placeholder="Ex.: APIs, arquitetura ou automação"
              />
            </label>
            <label className="field">
              Objetivo principal <span className="required">*</span>
              <textarea
                value={a.goal}
                maxLength={2000}
                rows={3}
                onChange={(e) => update({ goal: e.target.value })}
              />
            </label>
            <ModelPicker agent={a} update={update} />
            <div className="field">
              <span>Papel do agente</span>
              <div className="role-options">
                <label className="check-card">
                  <input
                    type="checkbox"
                    checked={a.mainAgent}
                    onChange={(e) => update({ mainAgent: e.target.checked })}
                  />
                  <span>
                    <strong>Agente principal</strong>
                    <small>Disponível para iniciar conversas</small>
                  </span>
                </label>
                <label className="check-card">
                  <input
                    type="checkbox"
                    checked={a.subagent}
                    onChange={(e) => update({ subagent: e.target.checked })}
                  />
                  <span>
                    <strong>Subagente</strong>
                    <small>Pode receber tarefas de outro agente</small>
                  </span>
                </label>
              </div>
            </div>
            <details className="advanced">
              <summary>Instruções avançadas e organização</summary>
              <label className="field">
                Instruções adicionais
                <textarea
                  value={a.instructions}
                  maxLength={12000}
                  rows={5}
                  onChange={(e) => update({ instructions: e.target.value })}
                />
              </label>
              <label className="field">
                Etiquetas (separadas por vírgula)
                <input
                  value={a.tags.join(", ")}
                  onChange={(e) =>
                    update({
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
                <p>Escolha quais capacidades o agente pode utilizar.</p>
              </div>
            </div>
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
                {a.tools.length} de {TOOL_CATALOG.length} selecionadas
              </span>
            </div>
            {TOOL_GROUPS.map((group) => {
              const tools = visibleTools.filter((t) => t.group === group.id);
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
                        className={`check-card ${a.tools.includes(tool.id) ? "checked" : ""}`}
                        key={tool.id}
                      >
                        <input
                          type="checkbox"
                          checked={a.tools.includes(tool.id)}
                          onChange={(e) =>
                            update({
                              tools: e.target.checked
                                ? [...a.tools, tool.id]
                                : a.tools.filter((t) => t !== tool.id),
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
            {!visibleTools.length && (
              <p className="small muted">
                Nenhuma ferramenta encontrada. Tente outro termo.
              </p>
            )}
            <div className="tool-sources">
              <span>Catálogo verificado em 12/11/2026.</span>
              <a href={TOOL_SOURCES.standard} target="_blank" rel="noreferrer">
                Ferramentas oficiais <ExternalLink size={11} />
              </a>
              <a href={TOOL_SOURCES.mcp} target="_blank" rel="noreferrer">
                MCP <ExternalLink size={11} />
              </a>
              <a href={TOOL_SOURCES.agents} target="_blank" rel="noreferrer">
                Permissões do agente <ExternalLink size={11} />
              </a>
            </div>
            <p className="small muted">
              A disponibilidade depende da versão, do ambiente e das permissões
              da sessão. O navegador é acessado pelo fluxo de subagentes do
              Antigravity. Ferramentas de servidores MCP são configuradas na
              etapa Integrações.
            </p>
            <label className="field">
              Política de execução de comandos
              <select
                value={a.commandExecutionPolicy}
                onChange={(e) =>
                  update({
                    commandExecutionPolicy: e.target
                      .value as AgentConfig["commandExecutionPolicy"],
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
                As permissões efetivas também dependem da sessão e do ambiente
                do Antigravity. Uma regra escrita no prompt não bloqueia acesso
                a arquivos ou execução de comandos.
              </p>
            </div>
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
                <p>Regras orientam. Skills ensinam como fazer.</p>
              </div>
            </div>
            <div className="subheading">
              <h3>
                <span className="face-dot rule" aria-hidden="true" />
                Regras de comportamento
              </h3>
              <button
                className="text-button"
                disabled={a.rules.length >= 30}
                onClick={() =>
                  update({
                    rules: [
                      ...a.rules,
                      {
                        id: freshId("custom-rule", a.rules),
                        name: "Minha regra",
                        description:
                          "Orientação personalizada para este projeto.",
                        content:
                          "Siga esta orientação ao trabalhar no projeto.",
                        trigger: "always_on",
                        globs: "",
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
              {RULES.filter((r) => !a.rules.some((x) => x.id === r.id)).map(
                (r) => (
                  <button
                    key={r.id}
                    disabled={a.rules.length >= 30}
                    onClick={() => update({ rules: [...a.rules, { ...r }] })}
                  >
                    <Plus size={13} />
                    {r.name}
                  </button>
                ),
              )}
            </div>
            {a.rules.map((r) => (
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
                      className="icon-button danger"
                      aria-label={`Remover ${r.name}`}
                      onClick={() =>
                        update({ rules: a.rules.filter((x) => x.id !== r.id) })
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
                      maxLength={1000}
                      onChange={(e) =>
                        patchRule(r.id, { description: e.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    Ativação
                    <select
                      value={r.trigger}
                      onChange={(e) =>
                        patchRule(r.id, {
                          trigger: e.target.value as Rule["trigger"],
                        })
                      }
                    >
                      <option value="always_on">Sempre ativa</option>
                      <option value="model_decision">Decisão do modelo</option>
                      <option value="glob">Por arquivos</option>
                      <option value="manual">Manual (menção no App)</option>
                    </select>
                  </label>
                  {r.trigger === "glob" && (
                    <label className="field">
                      Padrões de arquivos
                      <input
                        placeholder="Ex.: src/**, tests/**"
                        value={r.globs}
                        maxLength={500}
                        onChange={(e) =>
                          patchRule(r.id, { globs: e.target.value })
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
            ))}
            <div className="subheading skill-heading">
              <h3>
                <span className="face-dot skill" aria-hidden="true" />
                Skills
              </h3>
              <button
                className="text-button"
                disabled={a.skills.length >= 30}
                onClick={() =>
                  update({
                    skills: [
                      ...a.skills,
                      {
                        id: freshId("custom-skill", a.skills),
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
              {SKILLS.filter((s) => !a.skills.some((x) => x.id === s.id)).map(
                (s) => (
                  <button
                    key={s.id}
                    disabled={a.skills.length >= 30}
                    onClick={() => update({ skills: [...a.skills, { ...s }] })}
                  >
                    <Plus size={13} />
                    {s.name}
                  </button>
                ),
              )}
            </div>
            {a.skills.map((s) => (
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
                      className="icon-button danger"
                      aria-label={`Remover ${s.name}`}
                      onClick={() =>
                        update({
                          skills: a.skills.filter((x) => x.id !== s.id),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <label className="field">
                    Título da skill
                    <input
                      value={s.name}
                      maxLength={100}
                      onChange={(e) =>
                        patchSkill(s.id, { name: e.target.value })
                      }
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
                <p>Configure os servidores MCP disponíveis no projeto.</p>
              </div>
            </div>
            <div className="info-box">
              <Info size={18} />
              <p>
                Estes servidores serão incluídos no pacote do agente. O site não
                se conecta a eles. Configure credenciais diretamente no seu
                ambiente local.
              </p>
            </div>
            <McpHelp />
            {a.mcpServers.map((m, index) => (
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
                      update({
                        mcpServers: a.mcpServers.filter((_, i) => i !== index),
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
                    <code>mcpServers</code>).
                  </small>
                </label>
                <label className="field">
                  Transporte
                  <select
                    value={m.transport}
                    onChange={(e) =>
                      patchMcp(index, {
                        transport: e.target.value as McpServer["transport"],
                      })
                    }
                  >
                    <option value="stdio">Programa local (stdio)</option>
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
                        maxLength={500}
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
                              .slice(0, 50)
                              .map((s) => s.slice(0, 1000)),
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
              disabled={a.mcpServers.length >= 20}
              onClick={() =>
                update({
                  mcpServers: [
                    ...a.mcpServers,
                    {
                      id: freshId("mcp", a.mcpServers),
                      transport: "stdio",
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
              className="button secondary"
              onClick={() => setStep(step - 1)}
            >
              Voltar
            </button>
          )}
          {step < 3 && (
            <button
              className="button primary"
              onClick={() => setStep(step + 1)}
            >
              Continuar <span aria-hidden="true">→</span>
            </button>
          )}
          {step === 3 && (
            <span className="completion-note">
              Confira a prévia e exporte seu agente.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
