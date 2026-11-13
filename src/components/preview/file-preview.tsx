import { useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileCode2,
  Folder,
  ChevronDown,
  Code2,
  Files,
} from "lucide-react";
import type { GeneratedFile } from "@/types";
import { download } from "@/features/export";
type Props = {
  files: GeneratedFile[];
  errors: string[];
  warnings: string[];
  onZip: () => void;
  notify: (text: string) => void;
};
function Code({ content }: { content: string }) {
  let frontmatter = false;
  return (
    <pre className="code-view" tabIndex={0} aria-label="Conteúdo do arquivo">
      <code>
        {content.split("\n").map((line, i) => {
          if (line === "---") frontmatter = !frontmatter;
          const cls =
            line === "---"
              ? "syntax-divider"
              : line.startsWith("#")
                ? "syntax-heading"
                : frontmatter && line.includes(":")
                  ? "syntax-property"
                  : line.startsWith("  -")
                    ? "syntax-value"
                    : "";
          return (
            <span className={`code-line ${cls}`} key={i}>
              <span className="line-number" aria-hidden="true">
                {i + 1}
              </span>
              <span>{line || " "}</span>
            </span>
          );
        })}
      </code>
    </pre>
  );
}
export default function FilePreview({
  files,
  errors,
  warnings,
  onZip,
  notify,
}: Props) {
  const [path, setPath] = useState("");
  const [tab, setTab] = useState<"files" | "code">("files");
  const file = files.find((f) => f.path === path) ?? files[0];
  async function copy() {
    try {
      if (!file) return;
      await navigator.clipboard.writeText(file.content);
      notify("Conteúdo copiado.");
    } catch {
      notify("Não foi possível copiar. Use o download do arquivo.");
    }
  }
  return (
    <aside className="preview-card" aria-label="Pré-visualização">
      <div className="preview-heading">
        <div>
          <span className="eyebrow">O RESULTADO, EM TEMPO REAL</span>
          <h2>Pré-visualização</h2>
        </div>
        <span className="live-dot" title="Atualização em tempo real" />
      </div>
      <div className="preview-tabs" role="tablist" aria-label="Modo de prévia">
        <button
          role="tab"
          aria-selected={tab === "files"}
          aria-controls="preview-panel"
          id="tab-files"
          onClick={() => setTab("files")}
        >
          <Files size={15} />
          Arquivos <span>{files.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === "code"}
          aria-controls="preview-panel"
          id="tab-code"
          onClick={() => setTab("code")}
        >
          <Code2 size={15} />
          Código
        </button>
      </div>
      <div id="preview-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {errors.length > 0 ? (
          <div className="validation-errors" role="status">
            <strong>Vamos ajustar alguns detalhes</strong>
            <ul>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            <p>A prévia volta assim que os campos estiverem válidos.</p>
          </div>
        ) : (
          <>
            {tab === "files" ? (
              <div className="file-tree">
                <div className="tree-root">
                  <ChevronDown size={14} />
                  <Folder size={16} />
                  <strong>seu-projeto/</strong>
                </div>
                {files.map((f) => (
                  <button
                    key={f.path}
                    className={file?.path === f.path ? "selected" : ""}
                    onClick={() => setPath(f.path)}
                    aria-pressed={file?.path === f.path}
                  >
                    <FileCode2 size={15} />
                    <span>{f.path}</span>
                  </button>
                ))}
              </div>
            ) : (
              <label className="file-selector">
                <span className="sr-only">Arquivo para visualizar</span>
                <select
                  value={file?.path ?? ""}
                  onChange={(e) => setPath(e.target.value)}
                >
                  {files.map((f) => (
                    <option key={f.path} value={f.path}>
                      {f.path}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {file && (
              <>
                <div className="code-heading">
                  <span>
                    <FileCode2 size={14} />
                    {file.path.split("/").pop()}
                  </span>
                  <div>
                    <button
                      className="icon-button"
                      title="Copiar conteúdo"
                      aria-label="Copiar conteúdo"
                      onClick={copy}
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      className="icon-button"
                      title="Baixar arquivo"
                      aria-label="Baixar arquivo"
                      onClick={() =>
                        download(
                          file.content,
                          file.path.split("/").pop()!,
                          file.kind === "mcp" || file.kind === "backup"
                            ? "application/json"
                            : "text/markdown;charset=utf-8",
                        )
                      }
                    >
                      <Download size={15} />
                    </button>
                  </div>
                </div>
                <Code content={file.content} />
              </>
            )}
          </>
        )}
      </div>
      <div className="preview-bottom">
        {errors.length === 0 && (
          <div className="valid-message">
            <Check size={15} />
            Estrutura validada • Antigravity
          </div>
        )}
        {warnings.map((w, i) => (
          <p className="warning" key={i}>
            {w}
          </p>
        ))}
        <button
          className="button primary export-button"
          disabled={errors.length > 0}
          onClick={onZip}
        >
          <Download size={18} />
          Exportar ZIP
        </button>
        <p>Arquivos do agente + backup editável em JSON</p>
      </div>
      <div className="install-tip">
        <span>01</span>
        <p>
          Extraia o ZIP na raiz do seu projeto.
          <br />
          Revise os arquivos antes de substituir configurações existentes.
        </p>
      </div>
    </aside>
  );
}
