"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  Download,
  ExternalLink,
  GitCompareArrows,
  Import,
  Laptop,
  Layers,
  LayoutGrid,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Icon } from "./ui/icon";
import { AgexMark, PackCube, PackLoader } from "./ui/brand";
import AgentEditor from "./editor/agent-editor";
import FilePreview from "./preview/file-preview";
import BridgePanel from "./bridge-panel";
import { createAgent, RULES, SKILLS, TEMPLATES } from "@/templates/catalog";
import { configSchema, warnings as getWarnings } from "@/schemas/config";
import { generateFiles } from "@/generators/antigravity";
import {
  MAX_IMPORT_BYTES,
  parseBackup,
  readLibrary,
  saveLibrary,
  serializeBackup,
  STORAGE_KEY,
} from "@/storage/local";
import { createZip, download } from "@/features/export";
import { importAntigravity } from "@/features/import";
import { modelLabel } from "@/templates/models";
import {
  agentContentKey,
  type ClientReviewInfo,
} from "@/features/bridge/review";
import {
  approveBridgeAgent,
  exportBridgeAgent,
  fetchBridgeLibrary,
} from "@/features/bridge/client";
import type { AgentConfig, GeneratedFile } from "@/types";
type View = "library" | "templates" | "catalog" | "editor" | "help" | "bridge";
function safeContentKey(agent: AgentConfig): string {
  try {
    return agentContentKey(agent);
  } catch {
    return "";
  }
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Fechar">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function Studio() {
  const [view, setView] = useState<View>("library");
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [step, setStep] = useState(0);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [menu, setMenu] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [importNotes, setImportNotes] = useState<string[]>([]);
  const [bridgePort, setBridgePort] = useState("4319");
  const [bridgeToken, setBridgeToken] = useState("");
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [bridgeRevision, setBridgeRevision] = useState("");
  const [reviews, setReviews] = useState<Record<string, ClientReviewInfo>>({});
  const [approvedKeys, setApprovedKeys] = useState<Record<string, string>>({});
  const [targetProjects, setTargetProjects] = useState<Record<string, string>>(
    {},
  );
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const bridgeRevisionRef = useRef("");
  bridgeRevisionRef.current = bridgeRevision;
  const fileInput = useRef<HTMLInputElement>(null);
  const externalInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      const result = readLibrary(localStorage);
      setAgents(result.agents);
      if (result.error) {
        setStorageError(result.error);
        setSaveBlocked(true);
      }
    } catch {
      setStorageError(
        "O armazenamento está indisponível. Exporte um backup para guardar seu trabalho.",
      );
      setSaveBlocked(true);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready || saveBlocked) return;
    const err = saveLibrary(localStorage, agents);
    setStorageError(err ?? "");
  }, [agents, ready, saveBlocked]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    function changed(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        setSaveBlocked(true);
        setStorageError(
          "A biblioteca mudou em outra aba. Exporte seu trabalho atual e recarregue para evitar sobrescrever alterações.",
        );
      }
    }
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  const a = agents.find((a) => a.id === activeId);
  const generated = useMemo(() => {
    if (!a)
      return {
        files: [] as GeneratedFile[],
        errors: [] as string[],
        warnings: [] as string[],
      };
    const result = configSchema.safeParse(a);
    if (!result.success)
      return {
        files: [],
        errors: result.error.issues.map((i) => i.message),
        warnings: getWarnings(a),
      };
    return {
      files: [
        ...generateFiles(a),
        {
          path: "agex.json",
          kind: "backup" as const,
          content: serializeBackup([a]),
        },
      ],
      errors: [],
      warnings: getWarnings(a),
    };
  }, [a]);
  function navigate(v: View) {
    setView(v);
    setMenu(false);
  }
  function open(agent: AgentConfig) {
    setActiveId(agent.id);
    setStep(0);
    setMobilePreview(false);
    navigate("editor");
  }
  function commitAgents(next: AgentConfig[]): boolean {
    // Keep every accepted library state portable through the bounded backup format.
    try {
      const bytes = new TextEncoder().encode(serializeBackup(next)).byteLength;
      if (bytes > MAX_IMPORT_BYTES) {
        setToast(
          "A biblioteca atingiu 1 MB. Exporte um backup e remova itens antes de adicionar mais conteúdo.",
        );
        return false;
      }
      setAgents(next);
      return true;
    } catch {
      setToast(
        "Esta alteração excede os limites do editor. Revise a quantidade e o tamanho dos itens.",
      );
      return false;
    }
  }
  function create(id = "generic") {
    if (agents.length >= 100) {
      setToast("Limite de 100 agentes. Exporte um backup e remova itens.");
      return;
    }
    const next = createAgent(id);
    if (!commitAgents([next, ...agents])) return;
    open(next);
  }
  function update(patch: Partial<AgentConfig>) {
    commitAgents(
      agents.map((x) =>
        x.id === activeId
          ? { ...x, ...patch, updatedAt: new Date().toISOString() }
          : x,
      ),
    );
  }
  function duplicate(agent: AgentConfig) {
    if (agents.length >= 100) {
      setToast("Limite de 100 agentes atingido.");
      return;
    }
    const next = {
      ...structuredClone(agent),
      id: crypto.randomUUID(),
      name: `${agent.name.slice(0, 90)} (cópia)`,
      slug: `${agent.slug.slice(0, 57).replace(/-$/, "")}-copy`,
      updatedAt: new Date().toISOString(),
    };
    if (!commitAgents([next, ...agents])) return;
    open(next);
    setToast("Agente duplicado.");
  }
  async function exportZip() {
    if (!a) return;
    setBusy(true);
    try {
      download(await createZip(a), `${a.slug}.zip`);
      setToast("ZIP pronto. Extraia os arquivos na raiz do projeto.");
    } catch {
      setToast("Não foi possível gerar o ZIP. Verifique os campos.");
    } finally {
      setBusy(false);
    }
  }
  async function importFile(file: File | undefined, external = false) {
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES)
        throw new Error("O arquivo deve ter no máximo 1 MB.");
      const result = external
        ? await importAntigravity(file)
        : { agents: parseBackup(await file.text()).agents, warnings: [] };
      if (agents.length + result.agents.length > 100)
        throw new Error("A importação excederia o limite de 100 agentes.");
      const incoming = result.agents.map((a) => ({
        ...a,
        id: crypto.randomUUID(),
      }));
      if (!commitAgents([...incoming, ...agents])) return;
      setImportNotes(result.warnings);
      setToast(
        `${incoming.length} agente(s) importado(s). Os existentes foram preservados.`,
      );
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Não foi possível importar.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
      if (externalInput.current) externalInput.current.value = "";
    }
  }
  const filtered = agents
    .filter((a) =>
      `${a.name} ${a.description} ${a.tags.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "pt-BR")
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  function effectiveReview(agent: AgentConfig) {
    const r = reviews[agent.id];
    if (!r) return "none" as const;
    if (r.effectiveStatus === "pending_review") return "pending_review" as const;
    if (r.effectiveStatus === "stale") return "stale" as const;
    return approvedKeys[agent.id] === safeContentKey(agent)
      ? ("approved" as const)
      : ("stale" as const);
  }
  async function syncFromBridge({ initial = false } = {}) {
    const res = await fetchBridgeLibrary({
      port: bridgePort,
      token: bridgeToken,
      since: initial ? undefined : bridgeRevisionRef.current || undefined,
    });
    if (!res.changed) return;
    setBridgeRevision(res.revision);
    setReviews(res.reviews);
    const nextKeys: Record<string, string> = {};
    for (const ag of res.agents) {
      if (res.reviews[ag.id]?.effectiveStatus === "approved") {
        const key = safeContentKey(ag);
        if (key) nextKeys[ag.id] = key;
      }
    }
    setApprovedKeys((prev) => ({ ...prev, ...nextKeys }));
    setTargetProjects((prev) => {
      const next = { ...prev };
      for (const ag of res.agents) {
        const tp = res.reviews[ag.id]?.targetProject;
        if (tp && next[ag.id] === undefined) next[ag.id] = tp;
      }
      return next;
    });
    const added: string[] = [];
    const updated: string[] = [];
    setAgents((prev) => {
      const byId = new Map(prev.map((x) => [x.id, x]));
      const incomingNew: AgentConfig[] = [];
      for (const remote of res.agents) {
        const current = byId.get(remote.id);
        if (!current) {
          added.push(remote.name);
          incomingNew.push(remote);
        } else if (
          remote.updatedAt > current.updatedAt &&
          JSON.stringify(remote) !== JSON.stringify(current)
        ) {
          updated.push(remote.name);
          byId.set(remote.id, remote);
        }
      }
      if (!added.length && !updated.length) return prev;
      const merged = [
        ...incomingNew,
        ...prev.map((x) => byId.get(x.id) ?? x),
      ].slice(0, 100);
      return merged;
    });
    if (initial) {
      setToast(
        `Ponte conectada ao vivo (${res.agents.length} conjunto(s) na biblioteca local).`,
      );
    } else if (added.length) {
      setToast(
        `Novo agente criado pela IA: "${added[0]}". Revise e clique em Dar OK para liberar a exportação.`,
      );
    } else if (updated.length) {
      setToast(
        `A IA atualizou "${updated[0]}" — revise as mudanças antes de dar o OK.`,
      );
    }
  }
  async function connectBridgeLive() {
    try {
      await syncFromBridge({ initial: true });
      setBridgeConnected(true);
    } catch (e) {
      setBridgeConnected(false);
      setToast(
        e instanceof Error
          ? e.message
          : "Não foi possível conectar ao vivo à ponte.",
      );
    }
  }
  function disconnectBridgeLive() {
    setBridgeConnected(false);
    setToast("Conexão ao vivo com a ponte encerrada.");
  }
  async function refreshBridgeLive() {
    try {
      await syncFromBridge({ initial: true });
    } catch (e) {
      setToast(
        e instanceof Error ? e.message : "Erro ao atualizar da ponte.",
      );
    }
  }
  useEffect(() => {
    if (!bridgeConnected) return;
    let active = true;
    let inFlight = false;
    const timer = setInterval(async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        await syncFromBridge({ initial: false });
      } catch {
        if (active) {
          setBridgeConnected(false);
          setToast("Conexão ao vivo com a ponte perdida.");
        }
      } finally {
        inFlight = false;
      }
    }, 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [bridgeConnected, bridgePort, bridgeToken]);
  async function approveCurrentAgent() {
    if (!a) return;
    const parsed = configSchema.safeParse(a);
    if (!parsed.success) {
      setToast("Corrija os erros do agente antes de dar o OK.");
      return;
    }
    setBridgeBusy(true);
    try {
      const targetProject =
        targetProjects[a.id] ?? reviews[a.id]?.targetProject ?? "";
      const res = await approveBridgeAgent({
        port: bridgePort,
        token: bridgeToken,
        agent: parsed.data,
        targetProject: targetProject.trim() || undefined,
        expectedRevision: bridgeRevision || undefined,
      });
      setBridgeRevision(res.revision);
      setReviews((prev) => ({ ...prev, [a.id]: res.review }));
      setApprovedKeys((prev) => ({
        ...prev,
        [a.id]: safeContentKey(parsed.data),
      }));
      setToast(
        "OK registrado! Agora peça à IA no Antigravity para exportar ou exporte direto abaixo.",
      );
    } catch (e) {
      setToast(
        e instanceof Error
          ? e.message
          : "Não foi possível registrar a aprovação na ponte.",
      );
    } finally {
      setBridgeBusy(false);
    }
  }
  async function exportCurrentAgentToProject() {
    if (!a) return;
    setBridgeBusy(true);
    try {
      const projectPath =
        (targetProjects[a.id] ?? reviews[a.id]?.targetProject ?? "").trim() ||
        undefined;
      const res = await exportBridgeAgent({
        port: bridgePort,
        token: bridgeToken,
        id: a.id,
        projectPath,
      });
      setToast(
        `Exportado para ${res.projectPath} (${res.files.length} arquivo(s)).`,
      );
    } catch (e) {
      setToast(
        e instanceof Error
          ? e.message
          : "Não foi possível exportar para o projeto.",
      );
    } finally {
      setBridgeBusy(false);
    }
  }
  const pendingReviewCount = agents.filter(
    (ag) => effectiveReview(ag) === "pending_review",
  ).length;
  const templates = (
    <div className="template-grid">
      {TEMPLATES.map((t) => (
        <button
          key={t.id}
          className="template-card"
          onClick={() => create(t.id)}
        >
          <span className="template-card-top">
            <span className={`template-icon ${t.color}`}>
              <Icon name={t.icon} size={19} />
            </span>
            <PackCube
              size={22}
              hasRules={t.rules.length > 0}
              hasSkills={t.skills.length > 0}
              eyes={t.id !== "generic"}
            />
          </span>
          <h3>{t.name}</h3>
          <p>{t.description}</p>
          <span className="template-link">
            Usar template <ArrowRight size={14} />
          </span>
        </button>
      ))}
    </div>
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Pular para o conteúdo
      </a>
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <button
          className="brand"
          onClick={() => navigate("library")}
          aria-label="Agex, início"
        >
          <span className="brand-mark">
            <AgexMark size={40} />
          </span>
          <span>
            <span className="brand-wordmark">
              ag<span className="brand-light">ex</span>
            </span>
            <small>PACKS .AGENTS · PONTE MCP</small>
          </span>
        </button>
        <div className="workspace-label">
          WORKSPACE LOCAL <span>v1.0</span>
        </div>
        <nav className="main-nav" aria-label="Menu principal">
          <button
            className={["library", "editor"].includes(view) ? "active" : ""}
            onClick={() => navigate("library")}
          >
            <LayoutGrid size={18} />
            Meus agentes<span className="nav-count">{agents.length}</span>
          </button>
          <button
            className={view === "templates" ? "active" : ""}
            onClick={() => navigate("templates")}
          >
            <Sparkles size={18} />
            Templates<span className="new-tag">{TEMPLATES.length}</span>
          </button>
          <button
            className={view === "catalog" ? "active" : ""}
            onClick={() => navigate("catalog")}
          >
            <Layers size={18} />
            Regras e skills
          </button>
          <div className="nav-divider" />
          <button
            className={view === "bridge" ? "active" : ""}
            onClick={() => navigate("bridge")}
          >
            <Icon name="plug" size={18} />
            Ponte local
            {pendingReviewCount > 0 && (
              <span className="nav-count">{pendingReviewCount}</span>
            )}
          </button>
          <button
            className={view === "help" ? "active" : ""}
            onClick={() => navigate("help")}
          >
            <CircleHelp size={18} />
            Como funciona
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <span className="privacy-icon">
              <ShieldCheck size={20} />
            </span>
            <strong>Seu espaço. Seus dados.</strong>
            <p>Suas configurações ficam no navegador, sob seu controle.</p>
            <span>
              <span className="status-dot" />
              Sem conta. Sem nuvem.
            </span>
          </div>
          <div className="sidebar-footer">
            <span>Feito para construir.</span>
            <span className="version">v1.0 · MCP</span>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="menu-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menu"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb">
              Workspace <ChevronRight size={13} />{" "}
              <strong>
                {
                  {
                    library: "Meus agentes",
                    templates: "Templates",
                    catalog: "Regras e skills",
                    editor: "Editor de agente",
                    help: "Como funciona",
                    bridge: "Ponte local",
                  }[view]
                }
              </strong>
            </span>
          </div>
          <div className="topbar-meta">
            {bridgeConnected && (
              <button
                type="button"
                className="bridge-live-pill"
                onClick={() => navigate("bridge")}
              >
                <span className="status-dot" aria-hidden="true" />
                {pendingReviewCount > 0
                  ? `Ponte ativa · ${pendingReviewCount} pendente(s)`
                  : "Ponte ativa (ao vivo)"}
              </button>
            )}
            <span className={`storage-status ${storageError ? "error" : ""}`}>
              <Laptop size={15} />
              {storageError
                ? "Alterações não salvas"
                : "Salvo apenas neste navegador"}
              {!storageError && <span className="status-dot" />}
            </span>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {storageError && (
            <div className="banner warning" role="alert">
              {storageError}
              <button
                onClick={() => {
                  try {
                    download(
                      serializeBackup(agents),
                      "agex-backup.json",
                      "application/json",
                    );
                  } catch {
                    setToast("Não foi possível gerar o backup.");
                  }
                }}
              >
                Exportar backup
              </button>
            </div>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-label="Selecionar backup JSON"
            onChange={(e) => importFile(e.target.files?.[0])}
          />
          <input
            ref={externalInput}
            type="file"
            accept=".md,.zip"
            className="sr-only"
            aria-label="Selecionar configuração Antigravity"
            onChange={(e) => importFile(e.target.files?.[0], true)}
          />
          {!ready ? (
            <div className="loading">
              <PackLoader size={42} />
              <span>Preparando seu workspace…</span>
            </div>
          ) : (
            <>
              {view === "library" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow purple">
                        DO SEU JEITO, DO INÍCIO AO ARQUIVO
                      </span>
                      <h1>
                        Seus agentes. <span>Suas possibilidades.</span>
                      </h1>
                      <p>
                        Transforme suas ideias em agentes prontos para
                        trabalhar.
                      </p>
                    </div>
                    <button className="button primary" onClick={() => create()}>
                      <Plus size={18} />
                      Criar agente
                    </button>
                  </div>
                  <section className="welcome-banner">
                    <div>
                      <span className="pill">
                        <span className="status-dot" />
                        AGEX · PARA GOOGLE ANTIGRAVITY
                      </span>
                      <h2>
                        Menos configuração.
                        <br />
                        <span>Mais criação.</span>
                      </h2>
                      <p>
                        Escolha um ponto de partida, encaixe regras, skills e
                        MCPs <br className="desktop-break" />e leve os arquivos
                        prontos para o seu projeto.
                      </p>
                      <button
                        className="button signal"
                        onClick={() => navigate("templates")}
                      >
                        Explorar templates <ArrowRight size={17} />
                      </button>
                    </div>
                    <div className="agent-illustration" aria-hidden="true">
                      <div className="orbit orbit-one" />
                      <div className="orbit orbit-two" />
                      <div className="float-chip chip-code">
                        <span className="face-dot mcp" />
                        MCP · Ferramentas
                        <Check size={12} />
                      </div>
                      <div className="float-chip chip-skill">
                        <span className="face-dot skill" />
                        Skills
                        <Check size={12} />
                      </div>
                      <div className="float-chip chip-rule">
                        <span className="face-dot rule" />
                        Regras
                        <Check size={12} />
                      </div>
                      <div className="central-agent">
                        <PackCube size={78} seam="#0B0D1A" />
                        <span>seu-agente.md</span>
                        <small>PRONTO PARA EXPORTAR</small>
                      </div>
                    </div>
                  </section>
                  <div className="section-title">
                    <div>
                      <h2>Um bom começo faz a diferença</h2>
                      <p>Templates pensados para o seu fluxo de trabalho.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("templates")}
                    >
                      Ver todos <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="home-templates">{templates}</div>
                  <section className="library-section">
                    <div className="section-title">
                      <div className="title-with-count">
                        <h2>Meus agentes</h2>
                        <span className="count-badge">{agents.length}</span>
                      </div>
                      <div className="library-actions">
                        <button
                          className="text-button"
                          onClick={() => fileInput.current?.click()}
                        >
                          <Upload size={15} />
                          Importar JSON
                        </button>
                        <button
                          className="text-button"
                          disabled={!agents.length}
                          onClick={() =>
                            download(
                              serializeBackup(agents),
                              "agex-backup.json",
                              "application/json",
                            )
                          }
                        >
                          <Download size={15} />
                          Exportar JSON
                        </button>
                        <button
                          className="icon-button"
                          title="Comparar agentes"
                          aria-label="Comparar agentes"
                          disabled={agents.length < 2}
                          onClick={() =>
                            setCompare(agents.slice(0, 2).map((a) => a.id))
                          }
                        >
                          <GitCompareArrows size={18} />
                        </button>
                      </div>
                    </div>
                    <div className="library-toolbar">
                      <div className="search-input">
                        <Search size={17} />
                        <input
                          aria-label="Buscar agentes"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Buscar por nome, descrição ou etiqueta…"
                        />
                      </div>
                      <select
                        aria-label="Ordenar agentes"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="recent">Editados recentemente</option>
                        <option value="name">Nome: A → Z</option>
                      </select>
                    </div>
                    {!filtered.length ? (
                      <div className="empty-state">
                        <span>
                          <PackCube variant="outline" size={32} />
                        </span>
                        <h3>
                          {agents.length
                            ? "Nenhum agente encontrado"
                            : "Seu primeiro agente está a uma ideia de distância"}
                        </h3>
                        <p>
                          {agents.length
                            ? "Tente outro nome ou etiqueta."
                            : "Comece com um template ou crie uma configuração do seu jeito."}
                        </p>
                        <button
                          className="text-button"
                          onClick={() =>
                            agents.length ? setQuery("") : create()
                          }
                        >
                          {agents.length
                            ? "Limpar busca"
                            : "+ Criar meu primeiro agente"}
                        </button>
                      </div>
                    ) : (
                      <div className="agent-grid">
                        {filtered.map((agent) => {
                          const activeRules = agent.rules.filter(
                            (r) => r.enabled,
                          ).length;
                          const activeSkills = agent.skills.filter(
                            (s) => s.enabled,
                          ).length;
                          const activeMcp = agent.mcpServers.filter(
                            (m) => m.enabled,
                          ).length;
                          return (
                            <article className="agent-card" key={agent.id}>
                              <div className="agent-card-top">
                                <div className="agent-card-identity">
                                  <span className="pack-avatar">
                                    <PackCube
                                      size={30}
                                      hasRules={activeRules > 0}
                                      hasSkills={activeSkills > 0}
                                    />
                                  </span>
                                  <span className="agent-card-slug">
                                    agents/{agent.slug || "agente"}.md
                                  </span>
                                </div>
                                <div>
                                  <button
                                    className="icon-button"
                                    aria-label={`Duplicar ${agent.name}`}
                                    title="Duplicar"
                                    onClick={() => duplicate(agent)}
                                  >
                                    <Copy size={16} />
                                  </button>
                                  <button
                                    className="icon-button danger"
                                    aria-label={`Excluir ${agent.name}`}
                                    title="Excluir"
                                    onClick={() => setDeleteId(agent.id)}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>
                              <button
                                className="agent-open"
                                onClick={() => open(agent)}
                              >
                                <h3>{agent.name || "Agente sem nome"}</h3>
                                <p>
                                  {agent.description ||
                                    "Adicione uma descrição ao seu agente."}
                                </p>
                              </button>
                              <div className="pack-bar" aria-hidden="true">
                                <span
                                  className="pack-seg-agent"
                                  style={{ flex: 1 }}
                                />
                                {activeRules > 0 && (
                                  <span
                                    className="pack-seg-rules"
                                    style={{ flex: activeRules }}
                                  />
                                )}
                                {activeSkills > 0 && (
                                  <span
                                    className="pack-seg-skills"
                                    style={{ flex: activeSkills }}
                                  />
                                )}
                                {activeMcp > 0 && (
                                  <span
                                    className="pack-seg-mcp"
                                    style={{ flex: activeMcp }}
                                  />
                                )}
                              </div>
                              <div className="agent-tags">
                                {effectiveReview(agent) ===
                                  "pending_review" && (
                                  <span className="review-pill pending">
                                    Criado pela IA · Aguarda OK
                                  </span>
                                )}
                                {effectiveReview(agent) === "approved" && (
                                  <span className="review-pill approved">
                                    Aprovado para exportar
                                  </span>
                                )}
                                {effectiveReview(agent) === "stale" && (
                                  <span className="review-pill stale">
                                    Alterado · Reaprovar
                                  </span>
                                )}
                                <span>{modelLabel(agent.model)}</span>
                                <span className="face-tag">
                                  <i
                                    className="face-dot rule"
                                    aria-hidden="true"
                                  />
                                  {activeRules} regras
                                </span>
                                <span className="face-tag">
                                  <i
                                    className="face-dot skill"
                                    aria-hidden="true"
                                  />
                                  {activeSkills} skills
                                </span>
                                {activeMcp > 0 && (
                                  <span className="face-tag">
                                    <i
                                      className="face-dot mcp"
                                      aria-hidden="true"
                                    />
                                    {activeMcp} MCP
                                  </span>
                                )}
                                {agent.tags.filter(Boolean).map((t, i) => (
                                  <span key={i}>{t}</span>
                                ))}
                              </div>
                              <div className="agent-card-bottom">
                                <span>
                                  Editado em{" "}
                                  {new Intl.DateTimeFormat("pt-BR", {
                                    day: "2-digit",
                                    month: "short",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }).format(new Date(agent.updatedAt))}
                                </span>
                                <button
                                  onClick={() => open(agent)}
                                  aria-label={`Editar ${agent.name}`}
                                >
                                  <ArrowRight size={17} />
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                    <button
                      className="external-import text-button"
                      onClick={() => externalInput.current?.click()}
                    >
                      <Import size={15} />
                      Já tem arquivos Antigravity? Importar Markdown ou ZIP
                    </button>
                  </section>
                  <div className="page-footer">
                    <span>
                      <ShieldCheck size={14} />
                      Privacidade por padrão. Criatividade sem limites.
                    </span>
                    <span>Agex · 2026</span>
                  </div>
                </>
              )}
              {view === "templates" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow purple">
                        UM PONTO DE PARTIDA
                      </span>
                      <h1>Encontre seu próximo agente.</h1>
                      <p>
                        Configurações prontas para personalizar, sem começar do
                        zero.
                      </p>
                    </div>
                  </div>
                  {templates}
                  <div className="blank-template">
                    <PackCube variant="outline" size={34} />
                    <div>
                      <h3>Uma ideia diferente?</h3>
                      <p>
                        Comece com uma base genérica e personalize cada detalhe.
                      </p>
                    </div>
                    <button
                      className="button secondary"
                      onClick={() => create()}
                    >
                      Criar do meu jeito <ArrowRight size={16} />
                    </button>
                  </div>
                </>
              )}
              {view === "editor" && a && (
                <>
                  <button
                    className="back-link"
                    onClick={() => navigate("library")}
                  >
                    <ArrowLeft size={15} />
                    Meus agentes
                  </button>
                  <div className="page-heading editor-page-heading">
                    <div>
                      <div className="eyebrow purple">
                        CONSTRUTOR DE AGENTES{" "}
                        <span className="mini-badge">Antigravity</span>
                      </div>
                      <h1>{a.name || "Novo agente"}</h1>
                      <p>Configure visualmente. Acompanhe cada arquivo.</p>
                    </div>
                    <div className="heading-actions">
                      <button
                        className="button secondary"
                        onClick={() =>
                          download(
                            serializeBackup([a]),
                            `${a.slug || "agente"}.json`,
                            "application/json",
                          )
                        }
                      >
                        <Download size={16} />
                        Backup JSON
                      </button>
                      <button
                        className="button primary"
                        disabled={busy || !!generated.errors.length}
                        onClick={exportZip}
                      >
                        <Download size={17} />
                        {busy ? "Gerando…" : "Exportar ZIP"}
                      </button>
                    </div>
                  </div>
                  {(bridgeConnected || reviews[a.id]) && (
                    <section
                      className={`review-bar ${effectiveReview(a)}`}
                      aria-label="Revisão e aprovação da ponte MCP"
                    >
                      <div className="review-bar-copy">
                        <div className="review-bar-title">
                          {effectiveReview(a) === "approved" ? (
                            <strong>
                              Aprovado para exportar no projeto
                            </strong>
                          ) : effectiveReview(a) === "stale" ? (
                            <strong>
                              Alterado após a aprovação — dê o OK novamente
                            </strong>
                          ) : effectiveReview(a) === "pending_review" ? (
                            <strong>
                              Agente enviado pela IA — revise e dê o OK para
                              exportar
                            </strong>
                          ) : (
                            <strong>
                              Ponte ao vivo ativa — aprove este agente para
                              liberar a exportação via MCP
                            </strong>
                          )}
                        </div>
                        {reviews[a.id]?.note && (
                          <p className="review-note">
                            Nota da IA: {reviews[a.id].note}
                          </p>
                        )}
                        <p className="review-hint">
                          {!bridgeConnected
                            ? "Conecte a Ponte local ao vivo para dar o OK e liberar a exportação."
                            : effectiveReview(a) === "approved"
                              ? "Você já pode pedir à IA no Antigravity para exportar, ou informar a pasta abaixo para gravar direto."
                              : "Nada é gravado em nenhum projeto até você clicar em Dar OK."}
                        </p>
                      </div>
                      <div className="review-bar-actions">
                        <label className="field review-path-field">
                          Pasta do projeto de destino (opcional)
                          <input
                            value={
                              targetProjects[a.id] ??
                              reviews[a.id]?.targetProject ??
                              ""
                            }
                            onChange={(e) =>
                              setTargetProjects((prev) => ({
                                ...prev,
                                [a.id]: e.target.value,
                              }))
                            }
                            placeholder="/caminho/do/seu-projeto (ou deixe vazio para a IA escolher)"
                          />
                        </label>
                        <div className="review-buttons">
                          <button
                            type="button"
                            className={`button ${effectiveReview(a) === "approved" ? "secondary" : "signal"}`}
                            disabled={
                              bridgeBusy ||
                              !bridgeConnected ||
                              !!generated.errors.length
                            }
                            onClick={approveCurrentAgent}
                          >
                            <Check size={16} />
                            {bridgeBusy
                              ? "Enviando…"
                              : effectiveReview(a) === "approved"
                                ? "Reaprovar OK"
                                : "Dar OK (aprovar para exportar)"}
                          </button>
                          {effectiveReview(a) === "approved" && (
                            <button
                              type="button"
                              className="button signal"
                              disabled={
                                bridgeBusy ||
                                !bridgeConnected ||
                                !(
                                  targetProjects[a.id] ??
                                  reviews[a.id]?.targetProject ??
                                  ""
                                ).trim()
                              }
                              onClick={exportCurrentAgentToProject}
                            >
                              <Upload size={16} />
                              Exportar direto para a pasta
                            </button>
                          )}
                        </div>
                      </div>
                    </section>
                  )}
                  <div className="mobile-view-tabs">
                    <button
                      className={!mobilePreview ? "active" : ""}
                      onClick={() => setMobilePreview(false)}
                    >
                      Editor
                    </button>
                    <button
                      className={mobilePreview ? "active" : ""}
                      onClick={() => setMobilePreview(true)}
                    >
                      Pré-visualização <span>{generated.files.length}</span>
                    </button>
                  </div>
                  <div
                    className={`editor-layout ${mobilePreview ? "show-preview" : "show-editor"}`}
                  >
                    <AgentEditor
                      agent={a}
                      update={update}
                      step={step}
                      setStep={setStep}
                    />
                    <FilePreview
                      files={generated.files}
                      errors={generated.errors}
                      warnings={generated.warnings}
                      onZip={exportZip}
                      notify={setToast}
                    />
                  </div>
                  <p className="compatibility-note">
                    Mapeamento Antigravity · 12/11/2026. Agentes customizados:
                    App e CLI. Recursos e permissões podem variar no IDE.{" "}
                    <a
                      href="https://antigravity.google/docs/subagents"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver documentação <ExternalLink size={12} />
                    </a>
                  </p>
                </>
              )}
              {view === "catalog" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow purple">
                        CONHECIMENTO REUTILIZÁVEL
                      </span>
                      <h1>Um jeito melhor de trabalhar.</h1>
                      <p>
                        Escolha estes itens na etapa “Regras e skills” de
                        qualquer agente. Todos são universais para qualquer
                        linguagem, framework ou gerenciador de pacotes.
                      </p>
                    </div>
                    <button className="button primary" onClick={() => create()}>
                      Criar agente <Plus size={17} />
                    </button>
                  </div>
                  <h2 className="catalog-title">
                    <span className="face-dot rule" aria-hidden="true" />
                    Regras de comportamento
                  </h2>
                  <div className="catalog-grid">
                    {RULES.map((r) => (
                      <details className="catalog-card" key={r.id}>
                        <summary>
                          <span className="face-dot rule" aria-hidden="true" />
                          <h3>{r.name}</h3>
                          <ChevronRight size={16} />
                        </summary>
                        <p>{r.description}</p>
                        <div className="catalog-detail">{r.content}</div>
                      </details>
                    ))}
                  </div>
                  <h2 className="catalog-title">
                    <span className="face-dot skill" aria-hidden="true" />
                    Skills e procedimentos
                  </h2>
                  <div className="catalog-grid">
                    {SKILLS.map((s) => (
                      <details className="catalog-card" key={s.id}>
                        <summary>
                          <span className="face-dot skill" aria-hidden="true" />
                          <h3>{s.name}</h3>
                          <ChevronRight size={16} />
                        </summary>
                        <p>{s.description}</p>
                        <div className="catalog-detail">{s.content}</div>
                      </details>
                    ))}
                  </div>
                </>
              )}
              {view === "help" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow purple">
                        DA IDEIA AO PROJETO
                      </span>
                      <h1>Agex. Do rascunho ao projeto.</h1>
                      <p>Tudo o que você precisa para começar.</p>
                    </div>
                  </div>
                  <div className="help-grid">
                    {[
                      {
                        icon: "bot",
                        face: "agent",
                        title: "Agentes",
                        text: "Definem a identidade, o objetivo e as ferramentas de um especialista. Podem atuar como principal ou receber tarefas como subagentes.",
                      },
                      {
                        icon: "file",
                        face: "rule",
                        title: "Regras",
                        text: "Orientações de comportamento do workspace. Podem estar sempre ativas, ser escolhidas pelo modelo, ativadas por arquivos ou mencionadas manualmente.",
                      },
                      {
                        icon: "spark",
                        face: "skill",
                        title: "Skills",
                        text: "Procedimentos reutilizáveis. Cada skill tem uma descrição que indica quando utilizá-la e instruções que explicam o passo a passo.",
                      },
                      {
                        icon: "plug",
                        face: "mcp",
                        title: "MCPs",
                        text: "Conectam ferramentas e dados externos (banco, APIs, documentação) em qualquer linguagem via .agents/mcp_config.json. Para conectar o próprio Agex ao Antigravity, use a Ponte local.",
                      },
                    ].map((x) => (
                      <article className="help-card" key={x.title}>
                        <div className="help-card-top">
                          <span className="template-icon violet">
                            <Icon name={x.icon} size={19} />
                          </span>
                          <span
                            className={`face-dot ${x.face}`}
                            aria-hidden="true"
                          />
                        </div>
                        <h2>{x.title}</h2>
                        <p>{x.text}</p>
                      </article>
                    ))}
                  </div>
                  <article className="help-article">
                    <h2>Do template ao seu projeto</h2>
                    <ol>
                      <li>Escolha um template e personalize a identidade.</li>
                      <li>
                        Selecione modelo (Herdar, Gemini 4 Hydrogen, Gemini 4
                        Argon, Flash ou Pro), ferramentas, regras, skills e
                        integrações MCP.
                      </li>
                      <li>Confira o conteúdo de cada arquivo na prévia.</li>
                      <li>
                        Exporte o ZIP (ou use a Ponte local ao vivo para aprovar
                        e gravar direto no repositório) em qualquer linguagem ou
                        stack, revisando arquivos existentes.
                      </li>
                      <li>
                        Abra o projeto no Antigravity, confira os agentes e
                        recarregue os servidores MCP (<code>/mcp</code> ou
                        Configurações). Se escolheu Hydrogen ou Argon, siga{" "}
                        <code>AGEX-SETUP.md</code> na sessão.
                      </li>
                    </ol>
                    <h3>Universal para qualquer linguagem</h3>
                    <p>
                      Os agentes, regras e skills gerados funcionam em projetos
                      de qualquer ecossistema (Python, Go, Rust, Java, PHP,
                      C#, Ruby, JS/TS e outros). O agente identifica a stack e
                      os comandos diretamente no repositório. Node.js 22+ é
                      exigido apenas se você optar por executar a Ponte local.
                    </p>
                    <h3>Seus dados ficam com você</h3>
                    <p>
                      Os rascunhos são salvos somente neste navegador. Limpar os
                      dados do site ou usar outro navegador não transfere seus
                      agentes. Faça backups em JSON. A ponte local recebe
                      alterações somente mediante sua conexão e aprovação explícitas.
                    </p>
                    <h3>Compatibilidade e limites</h3>
                    <p>
                      Agentes customizados são destinados ao App e CLI. Regras
                      manuais não têm menções no CLI. Skills e MCPs podem
                      depender da versão e do ambiente. A validação do Agex
                      verifica os formatos documentados; a execução e as
                      permissões são definidas pelo Antigravity.
                    </p>
                    <div className="help-links">
                      {["subagents", "rules", "skills", "mcp"].map((p) => (
                        <a
                          key={p}
                          href={`https://antigravity.google/docs/${p}/`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {p}
                          <ExternalLink size={13} />
                        </a>
                      ))}
                    </div>
                  </article>
                </>
              )}
              {view === "bridge" && (
                <BridgePanel
                  agents={agents}
                  reviews={reviews}
                  port={bridgePort}
                  token={bridgeToken}
                  connected={bridgeConnected}
                  onPortChange={(p) => {
                    setBridgePort(p);
                    setBridgeConnected(false);
                  }}
                  onTokenChange={(t) => {
                    setBridgeToken(t);
                    setBridgeConnected(false);
                  }}
                  onConnectLive={connectBridgeLive}
                  onDisconnectLive={disconnectBridgeLive}
                  onRefreshLive={refreshBridgeLive}
                  onOpenAgent={open}
                  notify={setToast}
                />
              )}
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span className="status-dot" aria-hidden="true" />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Fechar aviso"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {deleteId && (
        <Modal title="Excluir este agente?" onClose={() => setDeleteId(null)}>
          <p>
            “{agents.find((a) => a.id === deleteId)?.name}” será removido deste
            navegador. Exporte um backup se quiser guardá-lo.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeleteId(null)}
            >
              Cancelar
            </button>
            <button
              className="button danger-button"
              onClick={() => {
                setAgents((prev) => prev.filter((a) => a.id !== deleteId));
                setDeleteId(null);
                setToast("Agente excluído.");
              }}
            >
              Excluir agente
            </button>
          </div>
        </Modal>
      )}
      {compare && (
        <Modal title="Comparar configurações" onClose={() => setCompare(null)}>
          <div className="compare-selectors">
            {[0, 1].map((i) => (
              <label className="field" key={i}>
                Agente {i + 1}
                <select
                  value={compare[i]}
                  onChange={(e) =>
                    setCompare(
                      compare.map((id, j) => (j === i ? e.target.value : id)),
                    )
                  }
                >
                  {agents.map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <Comparison
            agents={compare
              .map((id) => agents.find((a) => a.id === id)!)
              .filter(Boolean)}
          />
        </Modal>
      )}
      {!!importNotes.length && (
        <Modal title="Revise a importação" onClose={() => setImportNotes([])}>
          <ul>
            {importNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <button className="button primary" onClick={() => setImportNotes([])}>
            Entendi
          </button>
        </Modal>
      )}
    </div>
  );
}
function Comparison({ agents }: { agents: AgentConfig[] }) {
  if (agents.length !== 2) return null;
  const files = agents.map((a) => {
    try {
      return generateFiles(a);
    } catch {
      return [];
    }
  });
  const paths = [...new Set(files.flat().map((f) => f.path))];
  return (
    <div className="comparison">
      <table>
        <thead>
          <tr>
            <th>Propriedade</th>
            {agents.map((a, i) => (
              <th key={i}>{a.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(
            [
              "model",
              "commandExecutionPolicy",
              "mainAgent",
              "subagent",
              "tools",
              "tags",
            ] as const
          ).map((key) => (
            <tr
              className={
                JSON.stringify(agents[0][key]) !==
                JSON.stringify(agents[1][key])
                  ? "different"
                  : ""
              }
              key={key}
            >
              <th>{key}</th>
              {agents.map((a, i) => (
                <td key={i}>
                  {Array.isArray(a[key])
                    ? (a[key] as string[]).join(", ")
                    : String(a[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Arquivos gerados</h3>
      {files.some((f) => !f.length) && (
        <p className="warning">
          Um dos agentes possui campos inválidos; corrija-os para comparar todos
          os arquivos.
        </p>
      )}
      {paths.map((path) => {
        const values = files.map(
          (fs) => fs.find((f) => f.path === path)?.content,
        );
        return (
          <details className="diff-file" key={path}>
            <summary>
              <span>{path}</span>
              <span className="mini-badge">
                {values[0] === values[1] ? "Igual" : "Diferente"}
              </span>
            </summary>
            <div className="diff-columns">
              {values.map((value, i) => (
                <pre key={i}>{value ?? "Arquivo ausente neste conjunto."}</pre>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
