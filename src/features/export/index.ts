import JSZip from "jszip";
import { generateFiles } from "../../generators/antigravity";
import { serializeBackup } from "../../storage/local";
import type { AgentConfig } from "../../types";
export async function createZip(config: AgentConfig): Promise<Blob> {
  const zip = new JSZip();
  for (const f of generateFiles(config))
    zip.file(f.path, f.content, {
      date: new Date("2000-01-01T00:00:00Z"),
      createFolders: false,
    });
  zip.file("agex.json", serializeBackup([config]), {
    date: new Date("2000-01-01T00:00:00Z"),
  });
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
export function download(
  content: string | Blob,
  name: string,
  mime = "text/plain;charset=utf-8",
) {
  const url = URL.createObjectURL(
    typeof content === "string" ? new Blob([content], { type: mime }) : content,
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
