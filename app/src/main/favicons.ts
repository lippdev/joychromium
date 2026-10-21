import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Site icons kept inside the app: the tab strip and the new tab read them from here, never from the site. */
export const FAVICON_MAX_BYTES = 128 * 1024;
const FAVICON_TIMEOUT_MS = 8000;

const EXTENSIONS: Record<string, string> = {
  "image/png": "png", "image/x-icon": "ico", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg",
};
const MIME_OF = Object.fromEntries(Object.entries(EXTENSIONS).map(([mime, ext]) => [ext, mime]));

export interface Favicon {
  mime: string;
  bytes: Buffer;
}

/** The host a favicon belongs to, lowercased, or undefined for anything that is not a plain web host. */
export function faviconHost(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
    // The host becomes a file name: letters, digits, dots and dashes only (this also leaves out IPv6 literals).
    return /^[a-z0-9.-]{1,253}$/.test(parsed.hostname) ? parsed.hostname : undefined;
  } catch {
    return undefined;
  }
}

/** What the bytes really are, whatever the server said: only image types a tab can show are accepted. */
export function sniffImage(bytes: Uint8Array): string | undefined {
  const at = (i: number) => bytes[i] ?? -1;
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
  if (at(0) === 0 && at(1) === 0 && at(2) === 1 && at(3) === 0) return "image/x-icon";
  if (at(0) === 0xff && at(1) === 0xd8) return "image/jpeg";
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46) return "image/gif";
  if (at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) return "image/webp";
  if (/<svg[\s>]/i.test(Buffer.from(bytes.subarray(0, 512)).toString("utf8"))) return "image/svg+xml";
  return undefined;
}

/** Which of the icons a page announced to take: a web icon over a data one, the first of each kind. */
export function pickFavicon(candidates: readonly string[]): string | undefined {
  return candidates.find((c) => c.startsWith("https://")) ?? candidates.find((c) => c.startsWith("http://")) ?? candidates.find((c) => c.startsWith("data:image/"));
}

async function readBody(response: Response): Promise<Buffer | undefined> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > FAVICON_MAX_BYTES) return undefined;
  if (!response.body) return undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > FAVICON_MAX_BYTES) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Downloads (or decodes) one favicon through `fetchFn`, the session of the tab that asked. Returns undefined on any doubt. */
export async function readFavicon(url: string, fetchFn: (input: string, init?: { signal?: AbortSignal }) => Promise<Response>): Promise<Favicon | undefined> {
  try {
    let bytes: Buffer | undefined;
    if (url.startsWith("data:image/")) {
      const comma = url.indexOf(",");
      if (comma < 0 || url.length > FAVICON_MAX_BYTES * 2) return undefined;
      const head = url.slice(0, comma);
      const payload = url.slice(comma + 1);
      bytes = head.includes(";base64") ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
    } else {
      // A plain http icon is asked for over https: the page itself is upgraded the same way.
      const target = url.replace(/^http:\/\//i, "https://");
      if (!target.startsWith("https://")) return undefined;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FAVICON_TIMEOUT_MS);
      try {
        const response = await fetchFn(target, { signal: controller.signal });
        if (!response.ok) return undefined;
        bytes = await readBody(response);
      } finally {
        clearTimeout(timer);
      }
    }
    if (!bytes || bytes.length === 0 || bytes.length > FAVICON_MAX_BYTES) return undefined;
    const mime = sniffImage(bytes);
    return mime ? { mime, bytes } : undefined;
  } catch {
    return undefined;
  }
}

interface Entry {
  mime: string;
  bytes?: Buffer;
  file?: string;
  version: number;
}

/**
 * One icon per host. Normal tabs write theirs to the profile (so the new tab can draw them on the next launch);
 * private tabs keep theirs in memory only, gone when the app closes. At most `maxFiles` icons stay on disk, the
 * oldest going first.
 */
export class FaviconStore {
  private readonly disk = new Map<string, Entry>();
  private readonly memory = new Map<string, Entry>();
  private counter = 1;
  /**
   * A random value made at start-up and put in every address handed to our own documents. A web page asking for
   * joychromium://favicon looks exactly like the shell asking (no referrer, no origin), so without it any page could
   * probe which sites were visited by checking which icons exist.
   */
  readonly key = randomBytes(16).toString("hex");

  constructor(private readonly dir: string, private readonly log: (message: string) => void = () => {}, private readonly maxFiles = 500) {
    try {
      const files = existsSync(dir) ? readdirSync(dir) : [];
      const known = files
        .map((file) => ({ file, host: file.slice(0, file.lastIndexOf(".")), ext: file.slice(file.lastIndexOf(".") + 1) }))
        .filter((f) => MIME_OF[f.ext] && /^[a-z0-9.-]{1,253}$/.test(f.host))
        .map((f) => ({ ...f, time: statSync(join(dir, f.file)).mtimeMs }))
        .sort((a, b) => a.time - b.time);
      for (const f of known) this.disk.set(f.host, { mime: MIME_OF[f.ext]!, file: f.file, version: this.counter++ });
    } catch (error) {
      this.log(`Favicons: could not read ${dir}: ${String(error)}`);
    }
  }

  has(host: string): boolean {
    return this.memory.has(host) || this.disk.has(host);
  }

  /** The address the shell and the internal pages use for a host's icon, or undefined when none is kept. */
  urlFor(host: string | undefined): string | undefined {
    const entry = host ? this.memory.get(host) ?? this.disk.get(host) : undefined;
    return entry && host ? `joychromium://favicon/?host=${encodeURIComponent(host)}&v=${entry.version}&k=${this.key}` : undefined;
  }

  get(host: string): Favicon | undefined {
    const entry = this.memory.get(host) ?? this.disk.get(host);
    if (!entry) return undefined;
    if (!entry.bytes && entry.file) {
      try {
        entry.bytes = readFileSync(join(this.dir, entry.file));
      } catch (error) {
        this.log(`Favicons: could not read ${entry.file}: ${String(error)}`);
        this.disk.delete(host);
        return undefined;
      }
    }
    return entry.bytes ? { mime: entry.mime, bytes: entry.bytes } : undefined;
  }

  put(host: string, icon: Favicon, persist: boolean): void {
    const version = this.counter++;
    if (!persist) {
      this.memory.set(host, { mime: icon.mime, bytes: icon.bytes, version });
      return;
    }
    const ext = EXTENSIONS[icon.mime];
    if (!ext) return;
    try {
      mkdirSync(this.dir, { recursive: true });
      const file = `${host}.${ext}`;
      const old = this.disk.get(host);
      writeFileSync(join(this.dir, file), icon.bytes);
      // The same host may come back in another format: the old file must not outlive it.
      if (old?.file && old.file !== file) rmSync(join(this.dir, old.file), { force: true });
      this.disk.delete(host);
      this.disk.set(host, { mime: icon.mime, bytes: icon.bytes, file, version });
      while (this.disk.size > this.maxFiles) {
        const [oldest, entry] = this.disk.entries().next().value as [string, Entry];
        this.disk.delete(oldest);
        if (entry.file) rmSync(join(this.dir, entry.file), { force: true });
      }
    } catch (error) {
      this.log(`Favicons: could not save ${host}: ${String(error)}`);
    }
  }

  /** Forgets every icon, on disk and in memory: part of clearing the browsing data. */
  clear(): void {
    this.memory.clear();
    this.disk.clear();
    try {
      rmSync(this.dir, { recursive: true, force: true });
    } catch (error) {
      this.log(`Favicons: could not clear ${this.dir}: ${String(error)}`);
    }
  }
}
