import JSZip from "jszip";
import { ensureAgentPackV2 } from "../../platforms/common/convert";
import { generatePackFiles } from "../../platforms/registry";
import { serializeBackup } from "../../storage/local";
import type { AgentConfig, AgentPackV2 } from "../../types";

export async function createZip(
  config: AgentPackV2 | AgentConfig,
): Promise<Blob> {
  const pack = ensureAgentPackV2(config);
  const zip = new JSZip();
  for (const f of generatePackFiles(pack)) {
    zip.file(f.path, f.content, {
      date: new Date("2000-01-01T00:00:00Z"),
      createFolders: false,
    });
  }
  zip.file("agex.json", serializeBackup([pack]), {
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
