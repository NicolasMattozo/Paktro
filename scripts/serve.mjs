import { createServer } from "node:http";
import { lstat, readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
const root = resolve("out");
const portFlag = process.argv.indexOf("--port");
const port = Number(
  portFlag >= 0 ? process.argv[portFlag + 1] : (process.env.PORT ?? 3000),
);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let file = resolve(root, "." + decodeURIComponent(url.pathname));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    let st = await lstat(file);
    if (st.isSymbolicLink()) {
      res.writeHead(403).end();
      return;
    }
    if (st.isDirectory()) {
      file = resolve(file, "index.html");
      st = await lstat(file);
      if (st.isSymbolicLink()) {
        res.writeHead(403).end();
        return;
      }
    }
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
    res.end(data);
  } catch {
    res
      .writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
      .end("Não encontrado");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Paktro: http://localhost:${port}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close());
