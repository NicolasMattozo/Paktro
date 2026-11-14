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
import {
  createPack,
  RULES,
  SKILLS,
  TEMPLATES,
} from "@/templates/catalog";
import {
  generatePackFiles,
  PLATFORM_ADAPTERS,
} from "@/platforms/registry";
import {
  MAX_IMPORT_BYTES,
  parseBackup,
  readLibrary,
  saveLibrary,
  serializeBackup,
  STORAGE_KEY,
} from "@/storage/local";
import { createZip, download } from "@/features/export";
import {
  importFromRawFiles,
  importPlatform,
  type SafeUploadedFile,
} from "@/features/import";
import { modelLabel } from "@/templates/models";
import {
  agentContentKey,
  type ClientReviewInfo,
} from "@/features/bridge/review";
import {
  approveBridgeAgent,
  BridgeConflictClientError,
  exportBridgeAgent,
  fetchBridgeLibrary,
  type ExportConflictClient,
} from "@/features/bridge/client";
import type {
  AgentPackV2,
  GeneratedFile,
  TargetPlatform,
} from "@/types";

type View = "library" | "templates" | "catalog" | "editor" | "help" | "bridge";

function safeContentKey(agent: AgentPackV2, targetProject?: string): string {
  try {
    return agentContentKey(agent, targetProject);
  } catch {
    return "";
  }
}

function summarizePackModel(pack: AgentPackV2): string | null {
  if (pack.target === "antigravity" && pack.targets.antigravity) {
    return modelLabel(pack.targets.antigravity.model);
  }
  if (pack.target === "claude-code" && pack.targets.claudeCode) {
    return pack.targets.claudeCode.model === "inherit"
      ? "Herdar sessão"
      : pack.targets.claudeCode.model;
  }
  if (pack.target === "codex" && pack.targets.codex) {
    return pack.targets.codex.model === "inherit"
      ? "Herdar sessão"
      : pack.targets.codex.model;
  }
  return null;
}

function packMainPath(pack: AgentPackV2): string {
  const slug = pack.common.slug || "agente";
  if (pack.target === "claude-code") return `.claude/agents/${slug}.md`;
  if (pack.target === "codex") return `.codex/agents/${slug}.toml`;
  if (pack.target === "chatgpt-plugin") return `plugin.json · skills/${slug}`;
  return `.agents/agents/${slug}.md`;
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
  const [agents, setAgents] = useState<AgentPackV2[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [defaultTarget, setDefaultTarget] =
    useState<TargetPlatform>("antigravity");
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [legacyMigration, setLegacyMigration] = useState<{
    fromKey: string;
    rawBackup: string;
  } | null>(null);
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<TargetPlatform | "all">(
    "all",
  );
  const [sort, setSort] = useState("recent");
  const [step, setStep] = useState(0);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [menu, setMenu] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [importNotes, setImportNotes] = useState<string[]>([]);
  const [ambiguousImport, setAmbiguousImport] = useState<{
    candidates: TargetPlatform[];
    files: SafeUploadedFile[];
    warnings: string[];
  } | null>(null);
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
  const [exportConflicts, setExportConflicts] = useState<{
    packId: string;
    projectPath: string;
    conflicts: ExportConflictClient[];
    orphans: string[];
  } | null>(null);
  const [pendingOrphans, setPendingOrphans] = useState<{
    packId: string;
    projectPath: string;
    orphans: string[];
  } | null>(null);
  const bridgeRevisionRef = useRef("");
  bridgeRevisionRef.current = bridgeRevision;
  const fileInput = useRef<HTMLInputElement>(null);
  const externalInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const result = readLibrary(localStorage);
      setAgents(result.agents);
      if (result.migratedFromKey && result.legacyRawBackup) {
        setLegacyMigration({
          fromKey: result.migratedFromKey,
          rawBackup: result.legacyRawBackup,
        });
      }
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

  const a = agents.find((ag) => ag.common.id === activeId);

  const generated = useMemo(() => {
    if (!a) {
      return {
        files: [] as GeneratedFile[],
        errors: [] as string[],
        warnings: [] as string[],
      };
    }
    const adapter = PLATFORM_ADAPTERS[a.target];
    const validation = adapter.validate(a);
    if (!validation.valid) {
      return {
        files: [] as GeneratedFile[],
        errors: validation.errors,
        warnings: validation.warnings,
      };
    }
    return {
      files: [
        ...adapter.generate(a),
        {
          path: "agex.json",
          kind: "backup" as const,
          content: serializeBackup([a]),
        },
      ],
      errors: [],
      warnings: validation.warnings,
    };
  }, [a]);

  function navigate(v: View) {
    setView(v);
    setMenu(false);
  }

  function open(pack: AgentPackV2) {
    setActiveId(pack.common.id);
    setStep(0);
    setMobilePreview(false);
    navigate("editor");
  }

  function commitAgents(next: AgentPackV2[]): boolean {
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

  function create(id = "generic", target: TargetPlatform = defaultTarget) {
    if (agents.length >= 100) {
      setToast("Limite de 100 pacotes. Exporte um backup e remova itens.");
      return;
    }
    const next = createPack(id, target);
    if (!commitAgents([next, ...agents])) return;
    open(next);
  }

  function updatePack(nextPack: AgentPackV2) {
    commitAgents(
      agents.map((x) =>
        x.common.id === activeId
          ? {
              ...nextPack,
              common: {
                ...nextPack.common,
                updatedAt: new Date().toISOString(),
              },
            }
          : x,
      ),
    );
  }

  function duplicate(pack: AgentPackV2) {
    if (agents.length >= 100) {
      setToast("Limite de 100 pacotes atingido.");
      return;
    }
    const copy = structuredClone(pack);
    copy.common.id = crypto.randomUUID();
    copy.common.name = `${pack.common.name.slice(0, 90)} (cópia)`;
    copy.common.slug = `${pack.common.slug.slice(0, 57).replace(/-$/, "")}-copy`;
    copy.common.updatedAt = new Date().toISOString();
    if (!commitAgents([copy, ...agents])) return;
    open(copy);
    setToast("Pacote duplicado.");
  }

  async function exportZip() {
    if (!a) return;
    setBusy(true);
    try {
      download(await createZip(a), `${a.common.slug}.zip`);
      setToast("ZIP pronto. Extraia os arquivos na raiz do projeto.");
    } catch {
      setToast("Não foi possível gerar o ZIP. Verifique os campos.");
    } finally {
      setBusy(false);
    }
  }

  function commitImportedPacks(packs: AgentPackV2[], warnings: string[]) {
    if (agents.length + packs.length > 100) {
      throw new Error("A importação excederia o limite de 100 pacotes.");
    }
    const incoming = packs.map((p) => ({
      ...p,
      common: {
        ...p.common,
        id: crypto.randomUUID(),
      },
    }));
    if (!commitAgents([...incoming, ...agents])) return;
    setImportNotes(warnings);
    setToast(
      `${incoming.length} pacote(s) importado(s). Os existentes foram preservados.`,
    );
  }

  async function importFile(file: File | undefined, external = false) {
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) {
        throw new Error("O arquivo deve ter no máximo 1 MB.");
      }
      if (!external) {
        const parsed = parseBackup(await file.text());
        const notes =
          parsed.migratedFromVersion === 1
            ? [
                "Backup v1 (Antigravity) convertido automaticamente para o formato multiplataforma v2.",
              ]
            : [];
        commitImportedPacks(parsed.agents, notes);
      } else {
        const res = await importPlatform(file);
        if (res.status === "ambiguous") {
          setAmbiguousImport({
            candidates: res.candidateTargets,
            files: res.files,
            warnings: res.warnings,
          });
          return;
        }
        commitImportedPacks(res.packs, res.warnings);
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Não foi possível importar.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
      if (externalInput.current) externalInput.current.value = "";
    }
  }

  function resolveAmbiguousImport(chosenTarget: TargetPlatform) {
    if (!ambiguousImport) return;
    try {
      const res = importFromRawFiles(ambiguousImport.files, chosenTarget);
      if (res.status === "ok") {
        commitImportedPacks(res.packs, [
          ...ambiguousImport.warnings,
          ...res.warnings,
        ]);
      }
      setAmbiguousImport(null);
    } catch (e) {
      setAmbiguousImport(null);
      setToast(e instanceof Error ? e.message : "Falha na importação.");
    }
  }

  const filtered = agents
    .filter((ag) => {
      if (platformFilter !== "all" && ag.target !== platformFilter) {
        return false;
      }
      return `${ag.common.name} ${ag.common.description} ${ag.common.tags.join(" ")} ${ag.target}`
        .toLowerCase()
        .includes(query.toLowerCase());
    })
    .sort((x, y) =>
      sort === "name"
        ? x.common.name.localeCompare(y.common.name, "pt-BR")
        : y.common.updatedAt.localeCompare(x.common.updatedAt),
    );

  function effectiveReview(pack: AgentPackV2) {
    const id = pack.common.id;
    const r = reviews[id];
    if (!r) return "none" as const;
    if (r.effectiveStatus === "pending_review") return "pending_review" as const;
    if (r.effectiveStatus === "stale") return "stale" as const;
    const bound = r.targetProject?.trim() || undefined;
    return approvedKeys[id] === safeContentKey(pack, bound)
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
      const id = ag.common.id;
      if (res.reviews[id]?.effectiveStatus === "approved") {
        const bound = res.reviews[id]?.targetProject?.trim() || undefined;
        const key = safeContentKey(ag, bound);
        if (key) nextKeys[id] = key;
      }
    }
    setApprovedKeys((prev) => ({ ...prev, ...nextKeys }));
    setTargetProjects((prev) => {
      const next = { ...prev };
      for (const ag of res.agents) {
        const tp = res.reviews[ag.common.id]?.targetProject;
        if (tp && next[ag.common.id] === undefined) next[ag.common.id] = tp;
      }
      return next;
    });
    const added: string[] = [];
    const updated: string[] = [];
    setAgents((prev) => {
      const byId = new Map(prev.map((x) => [x.common.id, x]));
      const incomingNew: AgentPackV2[] = [];
      for (const remote of res.agents) {
        const current = byId.get(remote.common.id);
        if (!current) {
          added.push(remote.common.name);
          incomingNew.push(remote);
        } else if (
          remote.common.updatedAt > current.common.updatedAt &&
          JSON.stringify(remote) !== JSON.stringify(current)
        ) {
          updated.push(remote.common.name);
          byId.set(remote.common.id, remote);
        }
      }
      if (!added.length && !updated.length) return prev;
      return [
        ...incomingNew,
        ...prev.map((x) => byId.get(x.common.id) ?? x),
      ].slice(0, 100);
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
    const adapter = PLATFORM_ADAPTERS[a.target];
    const check = adapter.validate(a);
    if (!check.valid) {
      setToast("Corrija os erros do pacote antes de dar o OK.");
      return;
    }
    setBridgeBusy(true);
    try {
      const targetProject =
        targetProjects[a.common.id] ?? reviews[a.common.id]?.targetProject ?? "";
      const boundProject = targetProject.trim() || undefined;
      const res = await approveBridgeAgent({
        port: bridgePort,
        token: bridgeToken,
        agent: a,
        targetProject: boundProject,
        expectedRevision: bridgeRevision || undefined,
      });
      setBridgeRevision(res.revision);
      setReviews((prev) => ({ ...prev, [a.common.id]: res.review }));
      setApprovedKeys((prev) => ({
        ...prev,
        [a.common.id]: safeContentKey(a, boundProject),
      }));
      setToast(
        `OK registrado (${adapter.catalog.shortName})! Agora você pode exportar direto abaixo ou via MCP.`,
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

  async function exportCurrentAgentToProject(options?: {
    conflictResolution?: "abort" | "append-managed" | "overwrite";
    cleanOrphans?: boolean;
  }) {
    if (!a) return;
    setBridgeBusy(true);
    const projectPath =
      (
        targetProjects[a.common.id] ??
        reviews[a.common.id]?.targetProject ??
        ""
      ).trim() || undefined;
    try {
      const res = await exportBridgeAgent({
        port: bridgePort,
        token: bridgeToken,
        id: a.common.id,
        projectPath,
        ...(options?.conflictResolution
          ? { conflictResolution: options.conflictResolution }
          : {}),
        ...(options?.cleanOrphans ? { cleanOrphans: true } : {}),
      });
      setExportConflicts(null);
      if (res.orphans && res.orphans.length > 0) {
        setPendingOrphans({
          packId: a.common.id,
          projectPath: res.projectPath,
          orphans: res.orphans,
        });
      } else {
        setPendingOrphans(null);
      }
      setToast(
        `Exportado para ${res.projectPath} (${res.files.length} arquivo(s)).`,
      );
    } catch (e) {
      if (e instanceof BridgeConflictClientError) {
        setExportConflicts({
          packId: a.common.id,
          projectPath: projectPath ?? "",
          conflicts: e.conflicts,
          orphans: e.orphans,
        });
      } else {
        setToast(
          e instanceof Error
            ? e.message
            : "Não foi possível exportar para o projeto.",
        );
      }
    } finally {
      setBridgeBusy(false);
    }
  }

  const pendingReviewCount = agents.filter(
    (ag) => effectiveReview(ag) === "pending_review",
  ).length;

  const targetBar = (
    <div className="target-switcher" role="group" aria-label="Destino dos novos templates">
      <span className="target-switcher-label">Destino dos novos templates:</span>
      <div className="target-switcher-pills">
        {(
          [
            { id: "antigravity", label: "Google Antigravity" },
            { id: "claude-code", label: "Claude Code" },
            { id: "codex", label: "OpenAI · Codex" },
            { id: "chatgpt-plugin", label: "OpenAI · ChatGPT Plugin" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            className={`target-pill ${defaultTarget === t.id ? "active" : ""}`}
            aria-pressed={defaultTarget === t.id}
            onClick={() => setDefaultTarget(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );

  const templates = (
    <div className="template-grid">
      {TEMPLATES.map((t) => (
        <button
          key={t.id}
          className="template-card"
          onClick={() => create(t.id, defaultTarget)}
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
            <small>MULTIPLATAFORMA · MCP</small>
          </span>
        </button>
        <div className="workspace-label">
          WORKSPACE LOCAL <span>v2.0</span>
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
            <span className="version">v2.0 · MCP</span>
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
          {legacyMigration && !storageError && (
            <div className="banner migration-banner" role="status">
              <span>
                Biblioteca migrada de <code>{legacyMigration.fromKey}</code> para
                o formato v2 mantendo seus dados originais intactos no navegador.
              </span>
              <div>
                <button
                  type="button"
                  onClick={() =>
                    download(
                      legacyMigration.rawBackup,
                      "agex-backup-v1-original.json",
                      "application/json",
                    )
                  }
                >
                  Baixar backup v1 original
                </button>
                <button
                  type="button"
                  onClick={() => setLegacyMigration(null)}
                >
                  Dispensar
                </button>
              </div>
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
            accept=".md,.toml,.json,.zip"
            className="sr-only"
            aria-label="Selecionar pacote ou arquivo para importar"
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
                        Monte pacotes fieis ao formato oficial para Antigravity,
                        Claude Code, Codex e ChatGPT.
                      </p>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => create("generic", defaultTarget)}
                    >
                      <Plus size={18} />
                      Criar agente
                    </button>
                  </div>
                  <section className="welcome-banner">
                    <div>
                      <span className="pill">
                        <span className="status-dot" />
                        AGEX · MULTIPLATAFORMA
                      </span>
                      <h2>
                        Menos configuração.
                        <br />
                        <span>Mais criação.</span>
                      </h2>
                      <p>
                        Escolha o destino, encaixe regras, skills e MCPs{" "}
                        <br className="desktop-break" />e exporte arquivos fieis
                        para o seu projeto.
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
                      <div className="hero-cube-stage">
                        <picture>
                          <source
                            media="(prefers-reduced-motion: reduce)"
                            srcSet="/hero-cube-still.png"
                          />
                          <img
                            src="/hero-cube.webp"
                            alt=""
                            width={158}
                            height={190}
                            decoding="async"
                          />
                        </picture>
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
                  {targetBar}
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
                            setCompare(agents.slice(0, 2).map((x) => x.common.id))
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
                          placeholder="Buscar por nome, descrição, destino ou etiqueta…"
                        />
                      </div>
                      <select
                        aria-label="Filtrar por plataforma"
                        value={platformFilter}
                        onChange={(e) =>
                          setPlatformFilter(
                            e.target.value as TargetPlatform | "all",
                          )
                        }
                      >
                        <option value="all">Todas as plataformas</option>
                        <option value="antigravity">Google Antigravity</option>
                        <option value="claude-code">Claude Code</option>
                        <option value="codex">OpenAI · Codex</option>
                        <option value="chatgpt-plugin">
                          OpenAI · ChatGPT Plugin
                        </option>
                      </select>
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
                            ? "Tente outro nome, destino ou etiqueta."
                            : "Comece com um template ou crie uma configuração do seu jeito."}
                        </p>
                        <button
                          className="text-button"
                          onClick={() =>
                            agents.length
                              ? (setQuery(""), setPlatformFilter("all"))
                              : create()
                          }
                        >
                          {agents.length
                            ? "Limpar busca"
                            : "+ Criar meu primeiro agente"}
                        </button>
                      </div>
                    ) : (
                      <div className="agent-grid">
                        {filtered.map((pack) => {
                          const c = pack.common;
                          const activeRules = c.rules.filter(
                            (r) => r.enabled,
                          ).length;
                          const activeSkills = c.skills.filter(
                            (s) => s.enabled,
                          ).length;
                          const activeMcp = c.mcpServers.filter(
                            (m) => m.enabled,
                          ).length;
                          const modelSummary = summarizePackModel(pack);
                          const shortTarget =
                            PLATFORM_ADAPTERS[pack.target].catalog.shortName;
                          return (
                            <article className="agent-card" key={c.id}>
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
                                    {packMainPath(pack)}
                                  </span>
                                </div>
                                <div>
                                  <button
                                    className="icon-button"
                                    aria-label={`Duplicar ${c.name}`}
                                    title="Duplicar"
                                    onClick={() => duplicate(pack)}
                                  >
                                    <Copy size={16} />
                                  </button>
                                  <button
                                    className="icon-button danger"
                                    aria-label={`Excluir ${c.name}`}
                                    title="Excluir"
                                    onClick={() => setDeleteId(c.id)}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>
                              <button
                                className="agent-open"
                                onClick={() => open(pack)}
                              >
                                <h3>{c.name || "Agente sem nome"}</h3>
                                <p>
                                  {c.description ||
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
                                <span className={`platform-badge ${pack.target}`}>
                                  {shortTarget}
                                </span>
                                {effectiveReview(pack) ===
                                  "pending_review" && (
                                  <span className="review-pill pending">
                                    Criado pela IA · Aguarda OK
                                  </span>
                                )}
                                {effectiveReview(pack) === "approved" && (
                                  <span className="review-pill approved">
                                    Aprovado para exportar
                                  </span>
                                )}
                                {effectiveReview(pack) === "stale" && (
                                  <span className="review-pill stale">
                                    Alterado · Reaprovar
                                  </span>
                                )}
                                {modelSummary && <span>{modelSummary}</span>}
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
                                {c.tags.filter(Boolean).map((t, i) => (
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
                                  }).format(new Date(c.updatedAt))}
                                </span>
                                <button
                                  onClick={() => open(pack)}
                                  aria-label={`Editar ${c.name}`}
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
                      Já tem arquivos Antigravity, Claude Code, Codex ou
                      ChatGPT? Importar ZIP, Markdown ou TOML
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
                        Escolha o destino e comece com uma base pronta para
                        personalizar.
                      </p>
                    </div>
                  </div>
                  {targetBar}
                  {templates}
                  <div className="blank-template">
                    <PackCube variant="outline" size={34} />
                    <div>
                      <h3>Uma ideia diferente?</h3>
                      <p>
                        Comece com uma base genérica em{" "}
                        <strong>
                          {PLATFORM_ADAPTERS[defaultTarget].catalog.shortName}
                        </strong>{" "}
                        e personalize cada detalhe.
                      </p>
                    </div>
                    <button
                      className="button secondary"
                      onClick={() => create("generic", defaultTarget)}
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
                        CONSTRUTOR MULTIPLATAFORMA{" "}
                        <span className="mini-badge">
                          {PLATFORM_ADAPTERS[a.target].catalog.shortName}
                        </span>
                      </div>
                      <h1>{a.common.name || "Novo agente"}</h1>
                      <p>Configure visualmente. Acompanhe cada arquivo.</p>
                    </div>
                    <div className="heading-actions">
                      <button
                        className="button secondary"
                        onClick={() =>
                          download(
                            serializeBackup([a]),
                            `${a.common.slug || "agente"}.json`,
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
                  {(bridgeConnected || reviews[a.common.id]) && (
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
                        {reviews[a.common.id]?.note && (
                          <p className="review-note">
                            Nota da IA: {reviews[a.common.id].note}
                          </p>
                        )}
                        <p className="review-hint">
                          {!bridgeConnected
                            ? "Conecte a Ponte local ao vivo para dar o OK e liberar a exportação."
                            : effectiveReview(a) === "approved"
                              ? "Você já pode pedir à IA para exportar via MCP, ou informar a pasta abaixo para gravar de forma não destrutiva."
                              : "Nada é gravado em nenhum projeto até você clicar em Dar OK."}
                        </p>
                        {pendingOrphans && pendingOrphans.packId === a.common.id && (
                          <div className="orphan-banner" role="status">
                            <p>
                              Arquivos órfãos antigos mantidos por segurança:{" "}
                              <code>{pendingOrphans.orphans.join(", ")}</code>
                            </p>
                            <button
                              type="button"
                              className="inline-button"
                              disabled={bridgeBusy}
                              onClick={() =>
                                exportCurrentAgentToProject({
                                  cleanOrphans: true,
                                })
                              }
                            >
                              Remover órfãos rastreados
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="review-bar-actions">
                        <label className="field review-path-field">
                          Pasta do projeto de destino (opcional)
                          <input
                            value={
                              targetProjects[a.common.id] ??
                              reviews[a.common.id]?.targetProject ??
                              ""
                            }
                            onChange={(e) =>
                              setTargetProjects((prev) => ({
                                ...prev,
                                [a.common.id]: e.target.value,
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
                                  targetProjects[a.common.id] ??
                                  reviews[a.common.id]?.targetProject ??
                                  ""
                                ).trim()
                              }
                              onClick={() => exportCurrentAgentToProject()}
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
                      pack={a}
                      updatePack={updatePack}
                      step={step}
                      setStep={setStep}
                    />
                    <FilePreview
                      target={a.target}
                      files={generated.files}
                      errors={generated.errors}
                      warnings={generated.warnings}
                      onZip={exportZip}
                      notify={setToast}
                    />
                  </div>
                  <p className="compatibility-note">
                    Mapeamento {PLATFORM_ADAPTERS[a.target].catalog.shortName} ·{" "}
                    {PLATFORM_ADAPTERS[a.target].mappingVersion} (verificado em{" "}
                    {PLATFORM_ADAPTERS[a.target].catalog.docsVerifiedAt}).{" "}
                    <a
                      href={PLATFORM_ADAPTERS[a.target].catalog.docsUrl}
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
                        qualquer agente. Todos são adaptados ao destino ativo
                        sem depender de linguagem ou framework.
                      </p>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => create("generic", defaultTarget)}
                    >
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
                      <h1>Agex. Multiplataforma com fidelidade real.</h1>
                      <p>Cada destino usa seu próprio contrato oficial.</p>
                    </div>
                  </div>
                  <div className="help-grid">
                    {[
                      {
                        icon: "bot",
                        face: "agent",
                        title: "Google Antigravity",
                        text: "Gera .agents/agents/*.md, .agents/rules/*.md, .agents/skills/*/SKILL.md e .agents/mcp_config.json exatamente como antes.",
                      },
                      {
                        icon: "file",
                        face: "rule",
                        title: "Claude Code",
                        text: "Gera .claude/agents/*.md (aliases sonnet/opus/haiku, permissionMode e tools reais), .claude/rules/ (com paths:), .claude/skills/ e .mcp.json.",
                      },
                      {
                        icon: "spark",
                        face: "skill",
                        title: "OpenAI Codex",
                        text: "Gera AGENTS.md (via bloco gerenciado), .codex/agents/*.toml, .agents/skills/ e .codex/config.toml mesclado via parser TOML real.",
                      },
                      {
                        icon: "plug",
                        face: "mcp",
                        title: "ChatGPT Plugin",
                        text: "Gera plugin.json (agent-plugins.org 1.0.0), skills/*/SKILL.md e mcp.json (streamable-http para uso remoto na web).",
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
                    <h2>Mesclagem segura e proteção contra perda de dados</h2>
                    <ol>
                      <li>
                        Cada plataforma possui seu próprio catálogo e schema;
                        modelos e ferramentas nunca são misturados.
                      </li>
                      <li>
                        Ao exportar direto via Ponte local,{" "}
                        <code>.agex/manifest.json</code> registra hashes dos
                        arquivos gerenciados para detectar conflitos antes de
                        gravar.
                      </li>
                      <li>
                        <code>AGENTS.md</code> e <code>CLAUDE.md</code> utilizam
                        blocos delimitados{" "}
                        <code>&lt;!-- AGEX:BEGIN --&gt;</code> ou pedem
                        confirmação explícita.
                      </li>
                      <li>
                        Arquivos de configuração JSON e TOML preservam chaves e
                        servidores pré-existentes no projeto.
                      </li>
                    </ol>
                    <div className="help-links">
                      {Object.values(PLATFORM_ADAPTERS).map((ad) => (
                        <a
                          key={ad.id}
                          href={ad.catalog.docsUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {ad.catalog.shortName}
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
            “{agents.find((x) => x.common.id === deleteId)?.common.name}” será
            removido deste navegador. Exporte um backup se quiser guardá-lo.
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
                setAgents((prev) =>
                  prev.filter((x) => x.common.id !== deleteId),
                );
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
                  {agents.map((ag) => (
                    <option value={ag.common.id} key={ag.common.id}>
                      {ag.common.name} ({PLATFORM_ADAPTERS[ag.target].catalog.shortName})
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <Comparison
            agents={compare
              .map((id) => agents.find((ag) => ag.common.id === id)!)
              .filter(Boolean)}
          />
        </Modal>
      )}
      {ambiguousImport && (
        <Modal
          title="Confirmar plataforma da importação"
          onClose={() => setAmbiguousImport(null)}
        >
          <p>
            Os arquivos enviados são compatíveis com mais de uma plataforma.
            Escolha como deseja interpretar este pacote:
          </p>
          <ul>
            {ambiguousImport.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <div className="modal-actions">
            {ambiguousImport.candidates.map((cand) => (
              <button
                key={cand}
                type="button"
                className="button primary"
                onClick={() => resolveAmbiguousImport(cand)}
              >
                Importar como {PLATFORM_ADAPTERS[cand].catalog.shortName}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {exportConflicts && (
        <Modal
          title="Conflitos detectados no projeto"
          onClose={() => setExportConflicts(null)}
        >
          <p>
            A exportação foi pausada para não sobrescrever arquivos existentes
            em <code>{exportConflicts.projectPath}</code>:
          </p>
          <ul className="conflict-list">
            {exportConflicts.conflicts.map((c) => (
              <li key={c.path}>
                <code>{c.path}</code>: {c.reason}
              </li>
            ))}
          </ul>
          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setExportConflicts(null)}
            >
              Cancelar
            </button>
            {exportConflicts.conflicts.some((c) => c.canAppendManaged) &&
              exportConflicts.conflicts.every((c) => c.canAppendManaged) && (
                <button
                  type="button"
                  className="button signal"
                  disabled={bridgeBusy}
                  onClick={() =>
                    exportCurrentAgentToProject({
                      conflictResolution: "append-managed",
                    })
                  }
                >
                  Anexar bloco gerenciado
                </button>
              )}
            <button
              type="button"
              className="button danger-button"
              disabled={bridgeBusy}
              onClick={() =>
                exportCurrentAgentToProject({
                  conflictResolution: "overwrite",
                })
              }
            >
              Sobrescrever arquivos em conflito
            </button>
          </div>
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

function Comparison({ agents }: { agents: AgentPackV2[] }) {
  if (agents.length !== 2) return null;
  const files = agents.map((pack) => {
    try {
      return generatePackFiles(pack);
    } catch {
      return [];
    }
  });
  const paths = [...new Set(files.flat().map((f) => f.path))];
  const rows: { label: string; values: string[] }[] = [
    {
      label: "Plataforma",
      values: agents.map(
        (x) => PLATFORM_ADAPTERS[x.target].catalog.shortName,
      ),
    },
    {
      label: "Modelo",
      values: agents.map((x) => summarizePackModel(x) ?? "Não aplicável"),
    },
    {
      label: "Regras ativas",
      values: agents.map((x) =>
        String(x.common.rules.filter((r) => r.enabled).length),
      ),
    },
    {
      label: "Skills ativas",
      values: agents.map((x) =>
        String(x.common.skills.filter((s) => s.enabled).length),
      ),
    },
    {
      label: "MCP ativos",
      values: agents.map((x) =>
        String(x.common.mcpServers.filter((m) => m.enabled).length),
      ),
    },
    {
      label: "Etiquetas",
      values: agents.map((x) => x.common.tags.join(", ") || "—"),
    },
  ];
  return (
    <div className="comparison">
      <table>
        <thead>
          <tr>
            <th>Propriedade</th>
            {agents.map((pack, i) => (
              <th key={i}>{pack.common.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              className={row.values[0] !== row.values[1] ? "different" : ""}
              key={row.label}
            >
              <th>{row.label}</th>
              {row.values.map((val, i) => (
                <td key={i}>{val}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Arquivos gerados</h3>
      {files.some((f) => !f.length) && (
        <p className="warning">
          Um dos pacotes possui campos inválidos; corrija-os para comparar todos
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
