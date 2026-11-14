import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateFiles } from "../src/generators/antigravity";
import { TEMPLATES } from "../src/templates/catalog";
import type { AgentConfig } from "../src/types";

async function collectFiles(
  rootDir: string,
  relPrefix = "",
): Promise<Record<string, string>> {
  const entries = await readdir(join(rootDir, relPrefix), {
    withFileTypes: true,
  });
  const out: Record<string, string> = {};
  for (const entry of entries) {
    const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      Object.assign(out, await collectFiles(rootDir, rel));
    } else if (entry.isFile()) {
      out[rel] = await readFile(join(rootDir, rel), "utf8");
    }
  }
  return out;
}

describe("regressão Antigravity (examples/*)", () => {
  it.each(TEMPLATES.map((t) => t.id))(
    "gera arquivos idênticos aos snapshots em examples/%s",
    async (templateId) => {
      const exampleDir = join(process.cwd(), "examples", templateId);
      const rawBackup = JSON.parse(
        await readFile(join(exampleDir, "agex.json"), "utf8"),
      ) as { agents: AgentConfig[] };
      const generated = generateFiles(rawBackup.agents[0]);
      const actual: Record<string, string> = {};
      for (const file of generated) {
        actual[file.path] = file.content;
      }
      const expected = await collectFiles(exampleDir, ".agents");
      expect(actual).toEqual(expected);
    },
  );
});

