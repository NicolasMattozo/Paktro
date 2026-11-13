import { createServer, type IncomingMessage } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { backupSchema, configSchema } from "../src/schemas/config";
import { MAX_IMPORT_BYTES } from "../src/storage/local";
import {
  approvePackFromUi,
  exportApprovedPack,
  planMerge,
  readLibraryState,
  readStore,
  withStoreLock,
  writeStore,
} from "./store";

const syncRequestSchema = z
  .object({
    backup: backupSchema,
    expectedRevision: z.string().max(64).optional(),
  })
  .strict();

const approveRequestSchema = z
  .object({
    agent: configSchema,
    targetProject: z.string().max(4096).optional(),
    expectedRevision: z.string().max(128).optional(),
  })
  .strict();

const exportRequestSchema = z
  .object({
    id: z.string().uuid(),
    projectPath: z.string().max(4096).optional(),
  })
  .strict();

async function readBody(req: IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_IMPORT_BYTES) throw new Error("Solicitação maior que 1 MB.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function createBridgeHttp({
  file,
  token,
  origin,
}: {
  file: string;
  token: string;
  origin: string;
}) {
  if (token.length < 32)
    throw new Error("O token precisa ter pelo menos 32 caracteres.");
  const parsed = new URL(origin);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.origin !== origin
  )
    throw new Error("Defina uma origem HTTP(S) exata, sem caminho.");
  let writes = Promise.resolve();
  return createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status: number, data: unknown) => {
      res.writeHead(status);
      res.end(JSON.stringify(data));
    };
    if (
      !/^127\.0\.0\.1:\d+$/.test(req.headers.host ?? "") ||
      req.headers.origin !== origin
    ) {
      send(403, { error: "Origem ou host não autorizado." });
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET, POST");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );
      res.setHeader("Access-Control-Allow-Private-Network", "true");
      res.writeHead(204);
      res.end();
      return;
    }
    const auth = Buffer.from(req.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) {
      send(401, { error: "Token inválido." });
      return;
    }
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/library") {
      try {
        const state = await readLibraryState(file);
        const since = url.searchParams.get("since");
        if (since && since === state.revision) {
          send(200, { changed: false, revision: state.revision });
          return;
        }
        send(200, {
          changed: true,
          revision: state.revision,
          agents: state.agents,
          reviews: state.reviews,
        });
      } catch (e) {
        send(400, {
          error:
            e instanceof Error ? e.message : "Erro ao ler a biblioteca local.",
        });
      }
      return;
    }
    if (
      req.method !== "POST" ||
      !["/preview", "/sync", "/approve", "/export"].includes(url.pathname)
    ) {
      send(404, { error: "Rota não disponível." });
      return;
    }
    if (!req.headers["content-type"]?.startsWith("application/json")) {
      send(415, { error: "Envie JSON." });
      return;
    }
    try {
      const rawJson = JSON.parse(await readBody(req));
      if (url.pathname === "/approve") {
        const body = approveRequestSchema.parse(rawJson);
        const operation = async () => {
          const outcome = await approvePackFromUi(file, body.agent, {
            targetProject: body.targetProject,
            expectedRevision: body.expectedRevision,
          });
          if (outcome.conflict) {
            send(409, {
              error:
                "A biblioteca mudou antes da aprovação. Confira as alterações recebidas e tente novamente.",
            });
            return;
          }
          send(200, {
            ok: true,
            id: outcome.agent.id,
            revision: outcome.revision,
            review: outcome.review,
          });
        };
        const pending = writes.then(operation);
        writes = pending.catch(() => {});
        await pending;
        return;
      }

      if (url.pathname === "/export") {
        const body = exportRequestSchema.parse(rawJson);
        const operation = async () => {
          const exported = await exportApprovedPack(
            file,
            body.id,
            body.projectPath,
          );
          send(200, { ok: true, ...exported });
        };
        const pending = writes.then(operation);
        writes = pending.catch(() => {});
        await pending;
        return;
      }

      const body = syncRequestSchema.parse(rawJson);
      const operation = async () => {
        await withStoreLock(file, async () => {
          const existing = await readStore(file);
          const merged = planMerge(existing.agents, body.backup.agents);
          if (url.pathname === "/preview") {
            send(200, {
              revision: existing.revision,
              added: merged.added,
              changed: merged.changed,
              unchanged: merged.unchanged,
            });
            return;
          }
          if (body.expectedRevision !== existing.revision) {
            send(409, {
              error: "A biblioteca mudou. Confira as diferenças novamente.",
            });
            return;
          }
          await writeStore(file, merged.agents);
          send(200, {
            ok: true,
            added: merged.added.length,
            changed: merged.changed.length,
          });
        });
      };
      // Serialize comparisons and writes so two clients cannot overwrite a newer revision.
      const pending = writes.then(operation);
      writes = pending.catch(() => {});
      await pending;
    } catch (e) {
      send(400, {
        error:
          e instanceof Error && !(e instanceof z.ZodError)
            ? e.message
            : "Configuração inválida.",
      });
    }
  });
}
