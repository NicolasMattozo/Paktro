import CodeSnippet from "../ui/code-snippet";
import type { AgentConfig } from "@/types";
import {
  MODEL_FAMILIES,
  isSessionModel,
  modelFamily,
  sessionCommand,
  type ModelId,
} from "@/templates/models";
export default function ModelPicker({
  agent,
  update,
}: {
  agent: AgentConfig;
  update: (patch: Partial<AgentConfig>) => void;
}) {
  const family = modelFamily(agent.model);
  return (
    <div className="field model-picker">
      <span>Modelo</span>
      <div className="model-options">
        {MODEL_FAMILIES.map((option) => (
          <button
            type="button"
            key={option.id}
            className={`model-option ${family === option.id ? "selected" : ""}`}
            aria-pressed={family === option.id}
            onClick={() => update({ model: option.defaultModel })}
          >
            <span className="radio-dot" />
            <strong>{option.name}</strong>
            <small>{option.description}</small>
          </button>
        ))}
      </div>
      {isSessionModel(agent.model) ? (
        <div className="model-setup">
          <label className="field">
            Nível de raciocínio
            <select
              value={agent.model}
              onChange={(e) => update({ model: e.target.value as ModelId })}
            >
              {(family === "hydrogen"
                ? ["low", "medium", "high", "xhigh"]
                : ["low", "medium", "high"]
              ).map((level) => (
                <option key={level} value={`gemini-4-${family}-${level}`}>
                  {
                    (
                      {
                        low: "Low — baixo",
                        medium: "Medium — médio",
                        high: "High — alto",
                        xhigh: "Extra (XHigh) — extra alto",
                      } as Record<string, string>
                    )[level]
                  }
                </option>
              ))}
            </select>
          </label>
          <p>
            <strong>Ative este modelo na sessão do Antigravity.</strong> O
            agente exporta <code>model: inherit</code> para usar essa escolha.
            No App/IDE, selecione a família e o nível abaixo da caixa de
            mensagem (em Hydrogen, <code>xhigh</code> aparece como <b>Extra</b>
            ). No CLI, confira <code>agy models</code> e use:
          </p>
          <CodeSnippet
            label="Comando para ativar o modelo no CLI"
            code={sessionCommand(
              agent.slug || "nome-do-agente",
              agent.model,
              agent.mainAgent,
            )}
          />
          {agent.subagent && (
            <p>
              Como subagente, ele herda o modelo da sessão que delega a tarefa.
              A escolha desta tela não troca o modelo de uma sessão já aberta.
            </p>
          )}
          <p>
            O ZIP inclui <code>AGEX-SETUP.md</code> com estas instruções. A
            disponibilidade depende da sua conta e da versão instalada.
          </p>
        </div>
      ) : (
        <small>
          Herdar usa o modelo atual da sessão. Flash e Pro são categorias
          documentadas para subagentes; não fixam automaticamente uma família
          Gemini.
        </small>
      )}
      <small>
        Hydrogen e Argon: identificadores conferidos na documentação e com{" "}
        <code>agy models</code> em 12/11/2026.{" "}
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
