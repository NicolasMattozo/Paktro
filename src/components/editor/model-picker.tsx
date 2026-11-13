import { useEffect, useState } from "react";
import CodeSnippet from "../ui/code-snippet";
import type { AgentConfig } from "@/types";
import {
  MODEL_FAMILIES,
  findModelFamily,
  isSessionModel,
  modelLabel,
  sessionCommand,
  type ModelFamilyOption,
  type ModelId,
} from "@/templates/models";

const TIER_FAMILIES = MODEL_FAMILIES.filter((f) => !f.session);
const SESSION_FAMILIES = MODEL_FAMILIES.filter((f) => f.session);

export default function ModelPicker({
  agent,
  update,
}: {
  agent: AgentConfig;
  update: (patch: Partial<AgentConfig>) => void;
}) {
  const family = findModelFamily(agent.model);
  const sessionActive = isSessionModel(agent.model);
  const [sessionOpen, setSessionOpen] = useState(sessionActive);

  useEffect(() => {
    if (sessionActive) setSessionOpen(true);
  }, [sessionActive]);

  const renderOption = (option: ModelFamilyOption, wide = false) => (
    <button
      type="button"
      key={option.id}
      className={`model-option ${wide ? "model-option-wide " : ""}${family.id === option.id ? "selected" : ""}`}
      aria-pressed={family.id === option.id}
      onClick={() => update({ model: option.defaultModel })}
    >
      <span className="radio-dot" />
      <strong>{option.name}</strong>
      <small>{option.description}</small>
    </button>
  );

  return (
    <div className="field model-picker">
      <span>Modelo</span>
      <div className="model-options">
        {TIER_FAMILIES.map((option) =>
          renderOption(option, option.id === "inherit"),
        )}
      </div>
      <small>
        Estes são os valores gravados diretamente no <code>.md</code> (
        <code>inherit</code>, <code>flash</code> ou <code>pro</code>). Para
        manter Claude ou o modelo ativo na conversa, escolha{" "}
        <strong>Herdar modelo</strong>; <code>Flash</code> e <code>Pro</code>{" "}
        roteiam subagentes para tiers Gemini.
      </small>

      <details
        className="session-models"
        open={sessionOpen}
        onToggle={(e) => setSessionOpen(e.currentTarget.open)}
      >
        <summary>
          <span>Preferência de sessão (opcional)</span>
          <span className={`mini-badge ${sessionActive ? "is-session" : ""}`}>
            {sessionActive
              ? modelLabel(agent.model)
              : "Gemini, Orchestrator e Claude"}
          </span>
        </summary>
        <div className="session-models-body">
          <p className="session-models-intro">
            Registra qual modelo e força você pretende usar na sessão ao abrir
            este agente (exporta <code>model: inherit</code> no <code>.md</code>{" "}
            e gera <code>AGEX-SETUP.md</code>).
          </p>
          <div className="model-options">
            {SESSION_FAMILIES.map((option) => renderOption(option))}
          </div>

          {sessionActive && (
            <div className="model-setup">
              {family.levels.length > 0 ? (
                <label className="field">
                  Nível de raciocínio
                  <select
                    value={agent.model}
                    onChange={(e) =>
                      update({ model: e.target.value as ModelId })
                    }
                  >
                    {family.levels.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="model-single-note">
                  <strong>Modo único de orquestração:</strong> combina
                  planejamento Argon com execução rápida automaticamente, sem
                  seleção manual de força em <code>agy models</code>.
                </p>
              )}
              <p>
                <strong>No App ou IDE (sem comando):</strong> basta selecionar
                este modelo{family.levels.length > 0 ? " e a força" : ""} no menu
                abaixo da caixa de mensagem
                {family.xhighAsExtra ? (
                  <>
                    {" "}
                    (em Hydrogen, <code>xhigh</code> aparece como <b>Extra</b>)
                  </>
                ) : null}
                . Não é necessário rodar nada no terminal.
              </p>
              <p>
                <strong>Apenas se você usar o CLI (<code>agy</code>):</strong>{" "}
                inicie o terminal já com essa escolha usando o comando abaixo (se
                quiser conferir antes, rode <code>agy models</code>):
              </p>
              <CodeSnippet
                label="Comando para ativar o modelo no CLI"
                code={sessionCommand(
                  agent.slug || "nome-do-agente",
                  agent.model,
                  agent.mainAgent,
                )}
              />
              {family.id.startsWith("claude-") && (
                <p>
                  Modelos Claude dependem da liberação da conta/plano ou do
                  projeto Google Cloud ativo.
                </p>
              )}
              {agent.subagent && (
                <p>
                  Como subagente, ele herda o modelo da sessão que delega a
                  tarefa (é isso que permite rodar em Claude ou no modelo ativo
                  da sessão principal). A escolha desta tela não troca uma
                  sessão já aberta.
                </p>
              )}
              <p>
                O ZIP inclui <code>AGEX-SETUP.md</code> com estas instruções. A
                disponibilidade depende da sua conta e da versão instalada.
              </p>
            </div>
          )}
        </div>
      </details>

      <small>
        Identificadores conferidos na documentação e com{" "}
        <code>agy models</code> em 13/11/2026 (GPT-OSS omitido; outros modelos
        dependem da conta/autenticação).{" "}
        <a
          href="https://antigravity.google/docs/models"
          target="_blank"
          rel="noreferrer"
        >
          Modelos no Antigravity
        </a>{" "}
        ·{" "}
        <a
          href="https://antigravity.google/docs/cli/headless/"
          target="_blank"
          rel="noreferrer"
        >
          Como escolher no CLI
        </a>{" "}
        ·{" "}
        <a
          href="https://antigravity.google/docs/subagents"
          target="_blank"
          rel="noreferrer"
        >
          Campo model do agente
        </a>
      </small>
    </div>
  );
}
