import { build } from "esbuild";
await build({
  entryPoints: ["bridge/cli.ts"],
  outfile: "bridge/dist/cli.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  packages: "external",
  banner: { js: "#!/usr/bin/env node" },
});
