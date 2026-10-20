import { app, net, protocol } from "electron";
import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { pathToFileURL } from "node:url";
import { internalPageFile, isDevOnlyFile, SCHEME } from "../shared/pages";

/** Must run before app.whenReady(): makes joychromium:// behave like https for the pages we serve. */
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false, stream: true } },
  ]);
}

/**
 * Serves the shell UI and internal pages from the compiled output directory.
 *   joychromium://chrome/...      -> dist/<path> (the shell UI and its ES modules)
 *   joychromium://settings/       -> dist/assets/settings.html (and sibling files by path)
 */
export function installProtocolHandler(distDir: string): void {
  const root = normalize(distDir);
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    let file: string | undefined;
    if (url.hostname === "chrome") {
      const rel = url.pathname === "/" ? "/assets/chrome/index.html" : url.pathname;
      file = join(root, normalize(rel));
    } else if (url.pathname === "/" || url.pathname === "") {
      // The design catalog is a development tool: a packaged build has no such page.
      const page = internalPageFile(request.url, !app.isPackaged);
      if (page) file = join(root, "assets", page);
    } else {
      // Internal pages live in dist/assets; a path that starts with /assets already points inside it.
      const path = normalize(url.pathname);
      // A packaged build never serves a development page, not even through its explicit file path.
      if (app.isPackaged && isDevOnlyFile(path)) {
        return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      }
      const candidate = path.startsWith("/assets/") ? join(root, path) : join(root, "assets", path);
      file = existsSync(candidate) ? candidate : join(root, "assets", path);
    }
    // Never serve outside dist/, whatever the path says.
    if (!file || !normalize(file).startsWith(root) || !existsSync(file)) {
      return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}
