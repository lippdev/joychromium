import { app, net, protocol } from "electron";
import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { pathToFileURL } from "node:url";
import { internalPageFile, isDevOnlyFile, SCHEME } from "../shared/pages";
import type { FaviconStore } from "./favicons";

/** Must run before app.whenReady(): makes joychromium:// behave like https for the pages we serve. */
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false, stream: true } },
  ]);
}

const notFound = () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });

/**
 * joychromium://favicon/?host=…&k=<key>: the icon kept for a host. A site's icon in the store says the user visited that
 * site, so only whoever holds the start-up key (the shell and the internal pages, which are handed it) may ask; a web page
 * cannot tell our documents from itself by the request alone. The reply is also locked down (sandbox, no sniffing) so a
 * kept SVG can never run anything, even if someone navigated to it.
 */
function serveFavicon(request: Request, url: URL, favicons: FaviconStore): Response {
  if (url.searchParams.get("k") !== favicons.key) return new Response("Forbidden", { status: 403, headers: { "content-type": "text/plain" } });
  const icon = favicons.get(url.searchParams.get("host") ?? "");
  if (!icon) return notFound();
  return new Response(new Uint8Array(icon.bytes), {
    headers: {
      "content-type": icon.mime,
      "content-security-policy": "sandbox; default-src 'none'",
      "x-content-type-options": "nosniff",
      // Read from local disk on every request: an icon that changed must show, and the tab strip's v= address is unique anyway.
      "cache-control": "no-cache",
    },
  });
}

/**
 * Serves the shell UI and internal pages from the compiled output directory.
 *   joychromium://chrome/...      -> dist/<path> (the shell UI and its ES modules)
 *   joychromium://settings/       -> dist/assets/settings.html (and sibling files by path)
 */
export function installProtocolHandler(distDir: string, favicons: FaviconStore): void {
  const root = normalize(distDir);
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    let file: string | undefined;
    if (url.hostname === "favicon") return serveFavicon(request, url, favicons);
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
