// Bundles the server and the restore CLI into ESM files. Only the native addon stays external
// (installed in the image).
import { build } from "esbuild";

await build({
  entryPoints: { main: "src/main.ts", restore: "src/restore-cli.ts" },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node26",
  external: ["better-sqlite3"],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  sourcemap: true,
  logLevel: "info",
});
