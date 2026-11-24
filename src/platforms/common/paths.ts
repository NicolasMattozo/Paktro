import { z } from "zod";

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugSchema = z
  .string()
  .min(1, "Informe um identificador válido.")
  .max(64, "Use até 64 caracteres.")
  .regex(SLUG_REGEX, "Use apenas letras minúsculas, números e hífens simples.");

export function slugify(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64)
      .replace(/-+$/g, "") || "my-agent"
  );
}

export function assertSafeRelativePath(relPath: string): string {
  if (!relPath || typeof relPath !== "string") {
    throw new Error("Caminho de arquivo inválido.");
  }
  if (
    relPath.startsWith("/") ||
    relPath.includes("\\") ||
    /[\x00-\x1f\x7f]/.test(relPath) ||
    /^[a-zA-Z]:/.test(relPath)
  ) {
    throw new Error(`Caminho inseguro bloqueado: ${relPath}`);
  }
  const parts = relPath.split("/");
  if (
    parts.some(
      (p) =>
        !p ||
        p === "." ||
        p === ".." ||
        p === ".git" ||
        p === ".env" ||
        p.startsWith(".env."),
    )
  ) {
    throw new Error(`Caminho inseguro bloqueado: ${relPath}`);
  }
  return relPath;
}

export function parsePatterns(globs: string): string[] {
  return globs
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 30);
}

