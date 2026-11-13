import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createAgent, TEMPLATES } from "../src/templates/catalog";
import { generateFiles } from "../src/generators/antigravity";
import { serializeBackup } from "../src/storage/local";
async function main() {
  for (const [index, t] of TEMPLATES.entries()) {
    const baseDir = join("examples", t.id);
    await rm(baseDir, { recursive: true, force: true });
    const a = createAgent(t.id);
    a.id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    a.updatedAt = "2026-11-12T00:00:00.000Z";
    for (const f of [
      ...generateFiles(a),
      { path: "agex.json", content: serializeBackup([a]) },
    ]) {
      const path = join(baseDir, f.path);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, f.content);
    }
  }
  console.log("Exemplos gerados para todos os templates.");
}
main();
