// The JoyChromium site: serves dist/ (the React build) and keeps the beta sign-ups in one JSON-lines file on a volume.
//   PORT         port to listen on (default 3000)
//   DATA_DIR     where subscribers.jsonl lives (default ./data; mount a volume here in Dokploy)
//   ADMIN_TOKEN  required to download the list: GET /api/subscribers.csv with "Authorization: Bearer <token>" or ?token=
import { createServer } from "node:http";
import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";

// web/ builds into dist/ (npm run build in site/web).
const root = fileURLToPath(new URL("./dist/", import.meta.url));
const dataDir = process.env.DATA_DIR ?? fileURLToPath(new URL("./data/", import.meta.url));
const listFile = join(dataDir, "subscribers.jsonl");
const adminToken = process.env.ADMIN_TOKEN ?? "";
const port = Number(process.env.PORT ?? 3000);

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".woff2": "font/woff2",
  ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8",
};
const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

export const isEmail = (value) => typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

// shortcut: in-memory rate limit, resets on restart and is per instance; fine for one Dokploy container.
const hits = new Map();
const limited = (ip) => {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
};

async function subscribers() {
  try {
    return (await readFile(listFile, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

// Appends are serialized so two sign-ups at once cannot both pass the duplicate check.
let queue = Promise.resolve();
const subscribe = (email) => (queue = queue.then(async () => {
  const known = await subscribers();
  const at = known.findIndex((s) => s.email === email);
  if (at >= 0) return { added: false, position: at + 1 };
  await mkdir(dataDir, { recursive: true });
  await appendFile(listFile, JSON.stringify({ email, at: new Date().toISOString() }) + "\n");
  return { added: true, position: known.length + 1 };
}));

function readBody(req, limit = 2048) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) { reject(new Error("too large")); req.destroy(); }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const send = (res, status, body, type = "application/json; charset=utf-8") => {
  res.writeHead(status, { ...SECURITY, "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};

function authorized(req, url) {
  if (!adminToken) return false;
  const given = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || url.searchParams.get("token") || "";
  const a = Buffer.from(given), b = Buffer.from(adminToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (url.pathname === "/api/subscribe" && req.method === "POST") {
      const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? req.socket.remoteAddress ?? "").trim();
      if (limited(ip)) return send(res, 429, { error: "Muitas tentativas. Tente de novo em um minuto." });
      let data;
      try { data = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: "Pedido inválido." }); }
      if (data.website) return send(res, 200, { ok: true, already: false, position: 0 }); // honeypot: bots fill the hidden field
      const email = String(data.email ?? "").trim().toLowerCase();
      if (!isEmail(email)) return send(res, 422, { error: "Esse e-mail não parece válido." });
      const { added, position } = await subscribe(email);
      return send(res, 200, { ok: true, already: !added, position });
    }
    if (url.pathname === "/api/subscribers.csv" && req.method === "GET") {
      if (!authorized(req, url)) return send(res, 401, { error: "unauthorized" });
      const csv = "email,inscrito_em\n" + (await subscribers()).map((s) => `${s.email},${s.at}`).join("\n") + "\n";
      return send(res, 200, csv, "text/csv; charset=utf-8");
    }
    if (url.pathname === "/healthz") return send(res, 200, "ok", "text/plain");
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "method not allowed" });

    const path = normalize(join(root, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)));
    if (!path.startsWith(root)) return send(res, 403, "forbidden", "text/plain");
    const info = await stat(path).catch(() => undefined);
    if (!info?.isFile()) return send(res, 404, "Página não encontrada", "text/plain; charset=utf-8");
    const type = TYPES[extname(path)] ?? "application/octet-stream";
    // Vite fingerprints everything under /assets: those never change; the rest is revalidated daily.
    const cache = extname(path) === ".html" ? "no-cache" : url.pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=86400";
    // Safari only plays a video served in byte ranges.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
      if (start > end || start >= info.size) return send(res, 416, "", "text/plain");
      res.writeHead(206, { ...SECURITY, "Content-Type": type, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${info.size}`, "Accept-Ranges": "bytes", "Cache-Control": cache });
      if (req.method === "HEAD") return res.end();
      return createReadStream(path, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...SECURITY, "Content-Type": type, "Content-Length": info.size, "Cache-Control": cache, "Accept-Ranges": "bytes" });
    if (req.method === "HEAD") return res.end();
    createReadStream(path).pipe(res);
  } catch (error) {
    console.error(error);
    send(res, 500, { error: "Erro no servidor. Tente de novo." });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(port, () => console.log(`JoyChromium site on :${port}`));
}
export { server };
