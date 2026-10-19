// Build: esbuild bundles the main process, the preload bridges and the shell UI; assets are copied next to them.
// Bundling the preloads is what lets them import the shared IPC contract (a sandboxed preload cannot require files),
// and bundling the renderer is what lets the shell use Preact and the design system.
import { build } from "esbuild";
import { cpSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");

const production = process.env.NODE_ENV === "production";
const shared = {
  bundle: true,
  sourcemap: !production,
  logLevel: "warning",
  define: { "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development") },
};

rmSync(dist, { recursive: true, force: true });

// Main process: Node's module system, with Electron and the runtime dependencies left to node_modules.
await build({
  ...shared,
  entryPoints: [join(root, "src/main/main.ts")],
  outfile: join(dist, "main/main.js"),
  platform: "node",
  format: "cjs",
  target: "node24",
  external: ["electron", "electron-updater", "@ghostery/adblocker", "@ghostery/adblocker-electron"],
});

// Preloads: sandboxed, so they are bundled and may import src/shared.
for (const [entry, outfile] of [["src/preload/chrome.ts", "preload/chrome.js"], ["src/preload/web.ts", "preload/web.js"]]) {
  await build({
    ...shared,
    entryPoints: [join(root, entry)],
    outfile: join(dist, outfile),
    platform: "node",
    format: "cjs",
    target: "chrome152",
    external: ["electron"],
  });
}

// Shell UI: a browser bundle with Preact included.
await build({
  ...shared,
  entryPoints: [join(root, "src/renderer/shell/index.tsx")],
  outfile: join(dist, "renderer/shell.js"),
  platform: "browser",
  format: "esm",
  target: "chrome152",
  jsx: "automatic",
  jsxImportSource: "preact",
});

// Pages of the internal site, plus the scripts injected into web pages.
cpSync(join(root, "src/assets"), join(dist, "assets"), { recursive: true });

console.log("build: main, preloads, shell and assets are in dist/");
