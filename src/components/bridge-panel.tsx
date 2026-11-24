import { useState } from "react";
import BridgeSetup from "./bridge-setup";
import { ArrowRight, Plug, RefreshCw, Unplug } from "lucide-react";
import type { AgentPackV2 } from "@/types";
import type { ClientReviewInfo } from "@/features/bridge/review";
import type { BridgePlan } from "@/features/bridge/client";
import { requestBridgeSync } from "@/features/bridge/client";
import { PLATFORM_ADAPTERS } from "@/platforms/registry";
import { serializeBackup } from "@/storage/local";

export default function BridgePanel({
  agents,
  reviews,
  port,
  token,
  connected,
  onPortChange,
  onTokenChange,
  onConnectLive,
  onDisconnectLive,
  onRefreshLive,
  onOpenAgent,
  notify,
}: {
  agents: AgentPackV2[];
  reviews: Record<string, ClientReviewInfo>;
  port: string;
  token: string;
  connected: boolean;
  onPortChange: (port: string) => void;
  onTokenChange: (token: string) => void;
  onConnectLive: () => Promise<void>;
  onDisconnectLive: () => void;
  onRefreshLive: () => Promise<void>;
  onOpenAgent: (agent: AgentPackV2) => void;
  notify: (text: string) => void;
}) {
  const [plan, setPlan] = useState<BridgePlan | null>(null);
  const [payload, setPayload] = useState("");
  const [busy, setBusy] = useState(false);

  const pendingAgents = agents.filter(
    (ag) => reviews[ag.common.id]?.effectiveStatus === "pending_review",
  );

  async function requestSync(action: "preview" | "sync") {
    setBusy(true);
    try {
      const backup = action === "preview" ? serializeBackup(agents) : payload;
      const result = await requestBridgeSync({
        port,
        token,
        action,
        backupJson: backup,
        expectedRevision: action === "sync" ? plan?.revision : undefined,
      });
      if (action === "preview") {
        setPayload(backup);
        setPlan(result as BridgePlan);
        notify("Comparação recebida. Revise as mudanças antes de sincronizar.");
      } else {
        setPlan(null);
        setPayload("");
        notify("Configurações sincronizadas com a ponte local.");
      }
    } catch (e) {
      setPlan(null);
      notify(
        e instanceof Error
          ? e.message
          : "Não foi possível sincronizar com a ponte.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleConnect() {
    setBusy(true);
    try {
      await onConnectLive();
    } finally {
      setBusy(false);
    }
  }

  async function handleRefresh() {
    setBusy(true);
    try {
      await onRefreshLive();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow purple">DO NAVEGADOR AO SEU AMBIENTE</span>
          <h1>Uma ponte para seus agentes.</h1>
          <p>
            Conecte a IA do Antigravity ao Paktro para criar agentes por MCP,
            revisar aqui no site, dar o OK e exportar direto para o seu projeto.
          </p>
        </div>
      </div>
      <div className="info-box bridge-purpose">
        <Plug size={18} />
        <p>
          <strong>Qual conexão você precisa?</strong> Esta tela conecta o
          próprio <strong>Paktro</strong> ao Antigravity (via MCP) para que a IA
          crie e exporte seus conjuntos mediante seu OK. Para conectar outros
          MCPs que o seu agente gerado vai usar (banco de dados, APIs, etc.),
          use a etapa <b>Integrações</b> no editor.
        </p>
      </div>
      <div className="bridge-layout">
        <BridgeSetup agents={agents} port={port} />
        <section className="bridge-card bridge-sync">
          <h2>Conexão com o navegador</h2>
          <p>
            Inicie a ponte HTTP no terminal usando o guia ao lado e cole o token
            abaixo. Nenhuma conexão acontece antes de clicar em{" "}
            <strong>Conectar ao vivo</strong> ou{" "}
            <strong>Conferir mudanças</strong>.
          </p>
          <label className="field">
            Porta local
            <input
              inputMode="numeric"
              value={port}
              onChange={(e) => {
                onPortChange(e.target.value);
                setPlan(null);
              }}
            />
          </label>
          <label className="field">
            Token da ponte
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => {
                onTokenChange(e.target.value);
                setPlan(null);
              }}
              placeholder="Token definido no seu ambiente"
            />
            <small>
              Mantido apenas na memória desta aba, sem gravação no navegador.
            </small>
          </label>
          <p className="connection-status">
            <span
              className={`status-dot ${connected ? "online" : ""}`}
              aria-hidden="true"
            />
            {connected
              ? "Conectado ao vivo em 127.0.0.1 — recebendo agentes da IA"
              : "Conexão exclusiva com 127.0.0.1"}
          </p>
          {!connected ? (
            <button
              className="button primary"
              disabled={busy}
              onClick={handleConnect}
            >
              <Plug size={16} />
              {busy ? "Conectando…" : "Conectar ao vivo (IA ↔ Site)"}
            </button>
          ) : (
            <div className="bridge-live-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={handleRefresh}
              >
                <RefreshCw size={15} />
                Atualizar agora
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={onDisconnectLive}
              >
                <Unplug size={15} />
                Desconectar
              </button>
            </div>
          )}

          {!!pendingAgents.length && (
            <div className="bridge-pending-list">
              <h3>Aguardando seu OK ({pendingAgents.length})</h3>
              <ul>
                {pendingAgents.map((ag) => (
                  <li key={ag.common.id}>
                    <span>
                      {ag.common.name}{" "}
                      <span className="mini-badge">
                        {PLATFORM_ADAPTERS[ag.target].catalog.shortName}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => onOpenAgent(ag)}
                    >
                      Revisar e dar OK <ArrowRight size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bridge-manual-sync">
            <h3>Enviar rascunhos do navegador</h3>
            <p>
              Use para enviar agentes criados manualmente no navegador para o
              arquivo da ponte.
            </p>
            <button
              className="button secondary"
              disabled={busy || !agents.length}
              onClick={() => requestSync("preview")}
            >
              {busy ? "Aguardando ponte…" : "Conferir mudanças"}
              <ArrowRight size={16} />
            </button>
            {plan && (
              <div className="sync-plan">
                <h4 style={{ marginTop: 16 }}>Mudanças na biblioteca local</h4>
                <p>
                  {plan.added.length} novo(s), {plan.changed.length}{" "}
                  alterado(s), {plan.unchanged} sem mudanças. Outros conjuntos
                  da ponte serão preservados.
                </p>
                {!!plan.added.length && (
                  <p>Adicionar: {plan.added.join(", ")}</p>
                )}
                {!!plan.changed.length && (
                  <p>Atualizar: {plan.changed.join(", ")}</p>
                )}
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => requestSync("sync")}
                >
                  Confirmar sincronização
                </button>
                <p className="bridge-note">
                  Será enviada a versão conferida acima. Alterações posteriores
                  no editor podem ser sincronizadas em seguida.
                </p>
              </div>
            )}
          </div>
          <p className="bridge-note">
            A sincronização atualiza apenas a biblioteca da ponte. Projetos só
            recebem arquivos quando você dá o OK em um conjunto aprovado.
          </p>
        </section>
      </div>
    </>
  );
}
