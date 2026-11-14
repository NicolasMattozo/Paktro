import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ensureAgentPackV2 } from "../src/platforms/common/convert";
import { configSchema, draftSchema } from "../src/schemas/config";
import { packDraftSchema, packSchema } from "../src/schemas/pack";
import { MAX_IMPORT_BYTES, parseBackup } from "../src/storage/local";
import {
  approvePackFromUi,
  exportApprovedPack,
  ExportConflictError,
  planMerge,
  readLibraryState,
  syncFromUi,
} from "./store";

function constantEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const syncBodySchema = z
  .object({
    backup: z.unknown(),
    expectedRevision: z.string().max(128).optional(),
  })
  .strict();

const approveBodySchema = z
  .object({
    agent: z.union([packSchema, configSchema]),
    targetProject: z.string().max(4096).optional(),
    expectedRevision: z.string().max(128).optional(),
  })
  .strict();

const exportBodySchema = z
  .object({
    id: z.string().uuid(),
    projectPath: z.string().max(4096).optional(),
    conflictResolution: z
      .enum(["abort", "append-managed", "overwrite"])
      .optional(),
    cleanOrphans: z.boolean().optional(),
    orphanPaths: z.array(z.string().max(512)).max(100).optional(),
  })
  .strict();

const rawBackupSyncSchema = z
  .object({
    format: z.enum(["agex", "agent-studio"]),
    version: z.union([z.literal(1), z.literal(2)]),
    agents: z.array(z.union([packDraftSchema, draftSchema])).max(100),
  })
  .strict();

function json(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  origin: string,
) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_IMPORT_BYTES) {
        reject(new Error("Corpo excede 1 MB."));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function createBridgeHttp(options: {
  file: string;
  token: string;
  origin: string;
}) {
  if (!options.token || options.token.length < 32) {
    throw new Error(
      "Defina um token forte (32+ caracteres) antes de abrir a ponte.",
    );
  }
  if (!options.origin || options.origin === "*") {
    throw new Error("Defina a origem exata permitida para a ponte.");
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.headers.origin !== options.origin) {
      return json(
        res,
        403,
        { error: "Origem não autorizada." },
        options.origin,
      );
    }
    if (req.method === "OPTIONS") {
      return json(res, 200, { ok: true }, options.origin);
    }
    if (
      !constantEqual(
        req.headers.authorization || "",
        `Bearer ${options.token}`,
      )
    ) {
      return json(
        res,
        401,
        { error: "Token da ponte inválido." },
        options.origin,
      );
    }

    try {
      if (req.method === "GET" && url.pathname === "/library") {
        const since = url.searchParams.get("since") ?? "";
        const state = await readLibraryState(options.file);
        if (since && since === state.revision) {
          return json(
            res,
            200,
            { changed: false, revision: state.revision },
            options.origin,
          );
        }
        return json(
          res,
          200,
          {
            changed: true,
            revision: state.revision,
            agents: state.agents,
            reviews: state.reviews,
          },
          options.origin,
        );
      }

      if (req.method !== "POST") {
        return json(
          res,
          404,
          { error: "Rota não encontrada." },
          options.origin,
        );
      }

      const body = JSON.parse(await readBody(req));

      if (url.pathname === "/approve") {
        const parsed = approveBodySchema.parse(body);
        const pack = ensureAgentPackV2(parsed.agent);
        const outcome = await approvePackFromUi(options.file, pack, {
          targetProject: parsed.targetProject,
          expectedRevision: parsed.expectedRevision,
        });
        if (outcome.conflict) {
          return json(
            res,
            409,
            {
              error:
                "A biblioteca mudou na ponte enquanto você revisava. Atualize antes de aprovar.",
              revision: outcome.currentRevision,
            },
            options.origin,
          );
        }
        return json(
          res,
          200,
          {
            ok: true,
            id: pack.common.id,
            revision: outcome.revision,
            review: outcome.review,
          },
          options.origin,
        );
      }

      if (url.pathname === "/export") {
        const parsed = exportBodySchema.parse(body);
        const exported = await exportApprovedPack(options.file, parsed);
        return json(
          res,
          200,
          {
            ok: true,
            ...exported,
          },
          options.origin,
        );
      }

      const parsedSync = syncBodySchema.parse(body);
      const checkedRaw = rawBackupSyncSchema.parse(parsedSync.backup);
      const incoming = parseBackup(JSON.stringify(checkedRaw)).agents;

      if (url.pathname === "/preview") {
        const state = await readLibraryState(options.file);
        const { added, changed, unchanged } = planMerge(state.agents, incoming);
        return json(
          res,
          200,
          { revision: state.revision, added, changed, unchanged },
          options.origin,
        );
      }

      if (url.pathname === "/sync") {
        const outcome = await syncFromUi(
          options.file,
          incoming,
          parsedSync.expectedRevision,
        );
        if (outcome.conflict) {
          return json(
            res,
            409,
            {
              error:
                "A biblioteca local mudou após a prévia. Confira novamente.",
            },
            options.origin,
          );
        }
        return json(
          res,
          200,
          { ok: true, revision: outcome.revision },
          options.origin,
        );
      }

      return json(
        res,
        404,
        { error: "Rota não encontrada." },
        options.origin,
      );
    } catch (e) {
      if (e instanceof ExportConflictError) {
        return json(
          res,
          409,
          {
            error: e.message,
            conflicts: e.conflicts,
            orphans: e.orphans,
          },
          options.origin,
        );
      }
      return json(
        res,
        400,
        { error: e instanceof Error ? e.message : "Dados inválidos." },
        options.origin,
      );
    }
  });
}
