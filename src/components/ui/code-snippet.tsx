import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
export default function CodeSnippet({
  label,
  code,
}: {
  label: string;
  code: string;
}) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 3000);
    return () => clearTimeout(timer);
  }, [message]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setMessage("Copiado.");
    } catch {
      setMessage("Não foi possível copiar. Selecione o texto abaixo.");
    }
  }
  return (
    <div className="code-snippet">
      <div className="code-snippet-heading">
        <span>{label}</span>
        <button
          type="button"
          className="text-button"
          onClick={copy}
          aria-label={`Copiar ${label}`}
        >
          {message === "Copiado." ? <Check size={14} /> : <Copy size={14} />}
          Copiar
        </button>
      </div>
      <pre tabIndex={0} aria-label={label}>
        {code}
      </pre>
      {message && (
        <span className="snippet-feedback" role="status">
          {message}
        </span>
      )}
    </div>
  );
}
