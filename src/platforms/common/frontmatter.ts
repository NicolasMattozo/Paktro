import { parseDocument, stringify } from "yaml";
import type { CommonAgentPack } from "../../types";

export function renderFrontmatterMarkdown(
  metadata: Record<string, unknown>,
  body: string,
): string {
  const cleanMeta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (v !== undefined) cleanMeta[k] = v;
  }
  const yaml = stringify(cleanMeta, { lineWidth: 0 }).trimEnd();
  const normalizedBody = body.replace(/\r\n/g, "\n").trim();
  return normalizedBody ? `---\n${yaml}\n---\n\n${normalizedBody}\n` : `---\n${yaml}\n---\n`;
}

export function parseFrontmatterMarkdown(content: string): {
  metadata: Record<string, unknown>;
  body: string;
} {
  const normalized = content.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n([\s\S]*))?$/);
  if (!match) {
    throw new Error("Arquivo Markdown sem metadados YAML válidos (---).");
  }
  const doc = parseDocument(match[1], {
    uniqueKeys: true,
  });
  if (doc.errors.length > 0) {
    throw new Error(doc.errors[0].message);
  }
  const data = doc.toJS({ maxAliasCount: 0 });
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Metadados YAML inválidos.");
  }
  return {
    metadata: data as Record<string, unknown>,
    body: (match[2] ?? "").trim(),
  };
}

export function renderAgentBody(common: CommonAgentPack): string {
  const parts: string[] = [`# ${common.name}`];
  if (common.specialty.trim()) {
    parts.push(`## Especialidade\n\n${common.specialty.trim()}`);
  }
  if (common.goal.trim()) {
    parts.push(`## Objetivo\n\n${common.goal.trim()}`);
  }
  if (common.instructions.trim()) {
    parts.push(`## Instruções\n\n${common.instructions.trim()}`);
  }
  return parts.join("\n\n");
}

export function parseAgentBodySections(body: string): {
  name: string;
  specialty: string;
  goal: string;
  instructions: string;
} {
  const normalized = body.replace(/\r\n/g, "\n").trim();
  const headingMatch = normalized.match(/^#\s+(.+)$/m);
  const name = headingMatch?.[1]?.trim() ?? "";

  const section = (title: string): string => {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `^##\\s+${escaped}\\s*\\n+([\\s\\S]*?)(?=^##\\s+|$)`,
      "m",
    );
    return normalized.match(regex)?.[1]?.trim() ?? "";
  };

  const specialty = section("Especialidade");
  const goal = section("Objetivo");
  let instructions = section("Instruções");

  if (!specialty && !goal && !instructions) {
    const withoutTitle = headingMatch
      ? normalized.replace(/^#\s+.+\n*/, "").trim()
      : normalized;
    instructions = withoutTitle;
  }

  return { name, specialty, goal, instructions };
}
