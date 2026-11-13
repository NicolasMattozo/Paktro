export type SetupPlatform = "posix" | "windows";
export function absolutePath(value: string, platform: SetupPlatform): boolean {
  if (!value.trim() || value.length > 4096 || /[\x00-\x1f]/.test(value))
    return false;
  return platform === "windows"
    ? /^(?:[a-zA-Z]:[\\/]|\\\\[^\\]+\\[^\\]+)/.test(value)
    : value.startsWith("/");
}
export function shellQuote(value: string, platform: SetupPlatform): string {
  return platform === "windows"
    ? `'${value.replace(/'/g, "''")}'`
    : `'${value.replace(/'/g, "'\"'\"'")}'`;
}
export function bridgeSetup({
  directory,
  library,
  platform,
  origin,
  port,
}: {
  directory: string;
  library: string;
  platform: SetupPlatform;
  origin: string;
  port: string;
}) {
  if (!absolutePath(directory, platform) || !absolutePath(library, platform))
    throw Error(
      "Informe caminhos absolutos para a pasta do Agex e o arquivo da biblioteca.",
    );
  if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535)
    throw Error("A porta deve estar entre 1024 e 65535.");
  const url = new URL(origin);
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin)
    throw Error("A origem do site deve ser HTTP(S), sem caminho.");
  const sep = platform === "windows" ? "\\" : "/";
  const entry =
    directory.replace(/[\\/]+$/, "") +
    sep +
    ["bridge", "dist", "cli.mjs"].join(sep);
  const config = {
    mcpServers: {
      agex: { command: "node", args: [entry, "--file", library] },
    },
  };
  const quote = (s: string) => shellQuote(s, platform);
  const cd = platform === "windows" ? "Set-Location -LiteralPath" : "cd --";
  const install = `${cd} ${quote(directory)}\nnode --version\nnpm ci\nnpm run bridge:build`;
  const generator = `node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))'`;
  const auth =
    platform === "windows"
      ? `$env:AGEX_BRIDGE_TOKEN = ${generator}\n$env:AGEX_BRIDGE_TOKEN`
      : `export AGEX_BRIDGE_TOKEN="$(${generator})"\nprintf '%s\\n' "$AGEX_BRIDGE_TOKEN"`;
  const start = `node ${quote(entry)} --http --origin ${quote(origin)} --port ${port} --file ${quote(library)}`;
  const cliCommand = `agy mcp add agex -- node ${quote(entry)} --file ${quote(library)}`;
  return {
    config: JSON.stringify(config, null, 2),
    cliCommand,
    entry,
    install,
    http: `${auth}\n${start}`,
  };
}
