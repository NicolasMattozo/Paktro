import { AlertTriangle, Check, Layers } from "lucide-react";
import { useState } from "react";
import { convertPackTarget } from "@/platforms/common/convert";
import { PLATFORM_ADAPTERS } from "@/platforms/registry";
import type { AgentPackV2, TargetPlatform } from "@/types";

type Props = {
  pack: AgentPackV2;
  onSelect: (next: AgentPackV2) => void;
};

export default function PlatformPicker({ pack, onSelect }: Props) {
  const [conversionInfo, setConversionInfo] = useState<{
    from: TargetPlatform;
    to: TargetPlatform;
    notes: string[];
    losses: string[];
  } | null>(null);

  const isOpenAiSelected =
    pack.target === "codex" || pack.target === "chatgpt-plugin";

  function chooseTarget(target: TargetPlatform) {
    if (target === pack.target) return;
    const res = convertPackTarget(pack, target);
    onSelect(res.pack);
    if (res.notes.length > 0 || res.losses.length > 0) {
      setConversionInfo({
        from: pack.target,
        to: target,
        notes: res.notes,
        losses: res.losses,
      });
    } else {
      setConversionInfo(null);
    }
  }

  return (
    <div className="platform-picker" role="region" aria-label="Plataforma de destino">
      <div className="platform-picker-head">
        <div>
          <span className="platform-step-eyebrow">
            <Layers size={13} />
            DESTINO DO PACOTE
          </span>
          <h3>Onde você vai usar este agente?</h3>
        </div>
        <span className="mini-badge">
          {PLATFORM_ADAPTERS[pack.target].mappingVersion}
        </span>
      </div>

      <div className="platform-vendor-grid">
        <button
          type="button"
          className={`platform-card ${pack.target === "antigravity" ? "active" : ""}`}
          aria-pressed={pack.target === "antigravity"}
          onClick={() => chooseTarget("antigravity")}
        >
          <span className="platform-card-title">
            <strong>Google Antigravity</strong>
            {pack.target === "antigravity" && <Check size={15} />}
          </span>
          <small>
            <code>.agents/</code> (subagentes, regras, skills e mcp_config.json)
          </small>
        </button>

        <button
          type="button"
          className={`platform-card ${pack.target === "claude-code" ? "active" : ""}`}
          aria-pressed={pack.target === "claude-code"}
          onClick={() => chooseTarget("claude-code")}
        >
          <span className="platform-card-title">
            <strong>Claude Code</strong>
            {pack.target === "claude-code" && <Check size={15} />}
          </span>
          <small>
            <code>.claude/agents/</code>, <code>.claude/rules/</code>,{" "}
            <code>.claude/skills/</code> e <code>.mcp.json</code>
          </small>
        </button>

        <div className={`platform-card-group ${isOpenAiSelected ? "active" : ""}`}>
          <div className="platform-card-group-label">
            <strong>OpenAI</strong>
            <small>Escolha o formato de destino:</small>
          </div>
          <div className="openai-subchoices">
            <button
              type="button"
              className={`openai-subcard ${pack.target === "codex" ? "active" : ""}`}
              aria-pressed={pack.target === "codex"}
              onClick={() => chooseTarget("codex")}
            >
              <span className="platform-card-title">
                <strong>Codex em projeto</strong>
                {pack.target === "codex" && <Check size={14} />}
              </span>
              <small>
                <code>AGENTS.md</code>, <code>.codex/agents/*.toml</code>,{" "}
                <code>.agents/skills/</code> e <code>config.toml</code>
              </small>
            </button>
            <button
              type="button"
              className={`openai-subcard ${pack.target === "chatgpt-plugin" ? "active" : ""}`}
              aria-pressed={pack.target === "chatgpt-plugin"}
              onClick={() => chooseTarget("chatgpt-plugin")}
            >
              <span className="platform-card-title">
                <strong>Skill / plugin para ChatGPT</strong>
                {pack.target === "chatgpt-plugin" && <Check size={14} />}
              </span>
              <small>
                <code>plugin.json</code>, <code>skills/*/SKILL.md</code> e{" "}
                <code>mcp.json</code> (HTTP)
              </small>
            </button>
          </div>
        </div>
      </div>

      {conversionInfo && (
        <div className="conversion-notice" role="status">
          <div className="conversion-notice-head">
            <span>
              <AlertTriangle size={15} />
              <strong>
                Conversão {PLATFORM_ADAPTERS[conversionInfo.from].catalog.shortName} →{" "}
                {PLATFORM_ADAPTERS[conversionInfo.to].catalog.shortName}
              </strong>
            </span>
            <button
              type="button"
              className="inline-button"
              onClick={() => setConversionInfo(null)}
            >
              Dispensar
            </button>
          </div>
          <ul>
            {conversionInfo.losses.map((l, i) => (
              <li key={`loss-${i}`}>{l}</li>
            ))}
            {conversionInfo.notes.map((n, i) => (
              <li key={`note-${i}`}>{n}</li>
            ))}
          </ul>
          <small>
            As configurações da plataforma anterior continuam preservadas em{" "}
            <code>targets</code> caso você decida voltar.
          </small>
        </div>
      )}
    </div>
  );
}

