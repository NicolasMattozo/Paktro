import { useState } from "react";
import { Terminal, Copy, Check, Info } from "lucide-react";
import { PLATFORM_ADAPTERS } from "@/platforms/registry";
import { defaultAntigravityTarget, defaultClaudeCodeTarget, defaultCodexTarget } from "@/platforms/common/convert";
import type {
  AgentPackV2,
  ClaudeCodeTargetConfig,
  CodexTargetConfig,
} from "@/types";
import {
  findModelFamily,
  isSessionModel,
  MODEL_FAMILIES,
  modelLabel,
  modelTier,
  sessionCommand,
  type ModelFamilyOption,
  type ModelId,
} from "@/templates/models";

const BASE_MODELS: {
  id: Extract<ModelId, "inherit" | "flash" | "pro">;
  label: string;
  desc: string;
}[] = [
  { id: "inherit", label: "Herdar sessão", desc: "Usa o modelo padrão ativo no App" },
  { id: "flash", label: "Flash", desc: "Rápido e econômico para código direto" },
  { id: "pro", label: "Pro", desc: "Raciocínio mais profundo para análise" },
];

type Props = {
  pack: AgentPackV2;
  updatePack: (next: AgentPackV2) => void;
};

export default function ModelPicker({ pack, updatePack }: Props) {
  const [copiedCmd, setCopiedCmd] = useState(false);

  if (pack.target === "chatgpt-plugin") {
    return (
      <div className="field model-picker">
        <span>Modelo e execução</span>
        <div className="info-box compact-info">
          <Info size={16} />
          <p>
            Plugins e skills para ChatGPT não fixam modelo de IDE no{" "}
            <code>plugin.json</code> — executam no modelo selecionado pelo usuário na
            conversa do ChatGPT.
          </p>
        </div>
      </div>
    );
  }

  if (pack.target === "claude-code") {
    const cc = pack.targets.claudeCode ?? defaultClaudeCodeTarget(pack.common.capabilityIntents);
    const catalog = PLATFORM_ADAPTERS["claude-code"].catalog;
    const patchCc = (patch: Partial<ClaudeCodeTargetConfig>) =>
      updatePack({
        ...pack,
        targets: {
          ...pack.targets,
          claudeCode: { ...cc, ...patch },
        },
      });

    return (
      <div className="field model-picker">
        <span>Modelo no Claude Code</span>
        <div className="model-grid platform-model-grid">
          {catalog.models.map((m) => (
            <button
              type="button"
              key={m.id}
              className={`model-card ${cc.model === m.id ? "active" : ""}`}
              aria-pressed={cc.model === m.id}
              onClick={() =>
                patchCc({ model: m.id as ClaudeCodeTargetConfig["model"] })
              }
            >
              <strong>{m.label}</strong>
              <small>{m.badge ?? m.id}</small>
            </button>
          ))}
        </div>
        <label className="field" style={{ marginTop: 10 }}>
          Nível de esforço (effort no frontmatter)
          <select
            value={cc.effort}
            onChange={(e) =>
              patchCc({
                effort: e.target.value as ClaudeCodeTargetConfig["effort"],
              })
            }
          >
            {(catalog.efforts ?? []).map((ef) => (
              <option key={ef.id} value={ef.id}>
                {ef.label}
              </option>
            ))}
          </select>
        </label>
        <small>
          O subagente grava <code>model</code> com aliases oficiais (<code>sonnet</code>,{" "}
          <code>opus</code>, <code>haiku</code>, <code>inherit</code>) ou IDs Claude verificados.
        </small>
      </div>
    );
  }

  if (pack.target === "codex") {
    const cx = pack.targets.codex ?? defaultCodexTarget();
    const catalog = PLATFORM_ADAPTERS.codex.catalog;
    const patchCx = (patch: Partial<CodexTargetConfig>) =>
      updatePack({
        ...pack,
        targets: {
          ...pack.targets,
          codex: { ...cx, ...patch },
        },
      });

    return (
      <div className="field model-picker">
        <span>Modelo e raciocínio no Codex</span>
        <div className="model-grid platform-model-grid">
          {catalog.models.map((m) => (
            <button
              type="button"
              key={m.id}
              className={`model-card ${cx.model === m.id ? "active" : ""}`}
              aria-pressed={cx.model === m.id}
              onClick={() =>
                patchCx({ model: m.id as CodexTargetConfig["model"] })
              }
            >
              <strong>{m.label}</strong>
              <small>{m.badge ?? m.id}</small>
            </button>
          ))}
        </div>
        <label className="field" style={{ marginTop: 10 }}>
          Esforço de raciocínio (model_reasoning_effort)
          <select
            value={cx.reasoningEffort}
            onChange={(e) =>
              patchCx({
                reasoningEffort: e.target
                  .value as CodexTargetConfig["reasoningEffort"],
              })
            }
          >
            {(catalog.efforts ?? []).map((ef) => (
              <option key={ef.id} value={ef.id}>
                {ef.label}
              </option>
            ))}
          </select>
        </label>
        <small>
          Aplicado ao subagente <code>.codex/agents/{pack.common.slug || "agente"}.toml</code>{" "}
          quando diferente de <code>inherit</code>.
        </small>
      </div>
    );
  }

  // Google Antigravity (exact preserved UX & test selectors)
  const ag = pack.targets.antigravity ?? defaultAntigravityTarget(pack.common.capabilityIntents);
  const currentFamily = findModelFamily(ag.model);
  const tier = modelTier(ag.model);
  const isSession = isSessionModel(ag.model);

  const setAntigravityModel = (model: ModelId) =>
    updatePack({
      ...pack,
      targets: {
        ...pack.targets,
        antigravity: { ...ag, model },
      },
    });

  async function copyCommand(cmd: string) {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 1800);
    } catch {
      // Clipboard blocked in non-HTTPS test context without grant
    }
  }

  const pickFamily = (family: ModelFamilyOption) => {
    setAntigravityModel(family.defaultModel);
  };

  const cmd = sessionCommand(pack.common.slug || "my-agent", ag.model, ag.mainAgent);

  return (
    <div className="field model-picker">
      <span>Modelo</span>
      <div className="model-grid">
        {BASE_MODELS.map((m) => (
          <button
            type="button"
            key={m.id}
            className={`model-card ${tier === m.id && !isSession ? "active" : ""}`}
            aria-pressed={tier === m.id && !isSession}
            onClick={() => setAntigravityModel(m.id)}
          >
            <strong>{m.label}</strong>
            <small>{m.desc}</small>
          </button>
        ))}
      </div>

      <details className="session-models" open={isSession || undefined}>
        <summary>
          <span>Preferência de sessão (opcional)</span>
          <span className={`mini-badge ${isSession ? "is-session" : ""}`}>
            {isSession ? modelLabel(ag.model) : "Opcional · CLI"}
          </span>
        </summary>
        <div className="session-models-body">
          <p className="session-help">
            O YAML de subagentes do Antigravity aceita apenas <code>inherit</code>,{" "}
            <code>flash</code> ou <code>pro</code>. Escolha um modelo específico aqui para
            gerar o comando pronto do CLI e incluí-lo em <code>AGEX-SETUP.md</code>.
          </p>

          <div className="session-family-grid">
            <ModelFamiliesRow
              selectedId={isSession ? currentFamily.id : undefined}
              onPick={pickFamily}
            />
          </div>

          {isSession && (
            <div className="effort-and-command">
              {currentFamily.levels.length > 0 && (
                <label className="field">
                  Nível de raciocínio
                  <select
                    value={ag.model}
                    onChange={(e) => setAntigravityModel(e.target.value as ModelId)}
                  >
                    {currentFamily.levels.map((lv) => (
                      <option key={lv.id} value={lv.id}>
                        {lv.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="session-cmd-box">
                <div className="session-cmd-head">
                  <span>
                    <Terminal size={13} />
                    Comando sugerido no CLI
                  </span>
                  <button
                    type="button"
                    className="inline-button"
                    onClick={() => copyCommand(cmd)}
                  >
                    {copiedCmd ? <Check size={13} /> : <Copy size={13} />}
                    {copiedCmd ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <pre
                  tabIndex={0}
                  aria-label="Comando para ativar o modelo no CLI"
                  className="session-cmd-code"
                >
                  <code>{cmd}</code>
                </pre>
                <small>
                  No arquivo <code>.md</code> gerado será gravado{" "}
                  <code>model: inherit</code>, preservando o modelo real no{" "}
                  <code>AGEX-SETUP.md</code> e no <code>agex.json</code>.
                </small>
              </div>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

function ModelFamiliesRow({
  selectedId,
  onPick,
}: {
  selectedId?: string;
  onPick: (f: ModelFamilyOption) => void;
}) {
  return (
    <>
      {MODEL_FAMILIES.filter((f) => f.session).map((f) => {
        const badge = f.xhighAsExtra
          ? "Low–Extra"
          : f.levels.length > 0
            ? "Low–High"
            : "Sessão";
        return (
          <button
            type="button"
            key={f.id}
            className={`model-card session-family-card ${selectedId === f.id ? "active" : ""}`}
            aria-pressed={selectedId === f.id}
            onClick={() => onPick(f)}
          >
            <span className="session-card-top">
              <strong>{f.name}</strong>
              <span className="mini-badge">{badge}</span>
            </span>
            <small>{f.description}</small>
          </button>
        );
      })}
    </>
  );
}
