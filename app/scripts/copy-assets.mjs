// Copies non-TypeScript files (HTML, CSS, JS injected into pages, icons) next to the compiled output.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const from = join(root, "src", "assets");
const to = join(root, "dist", "assets");
if (existsSync(from)) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}
