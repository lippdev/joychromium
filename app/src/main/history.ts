import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isInternal, isWebUrl } from "../shared/pages";
import type { HistoryEntry } from "../shared/suggestion";

/**
 * Append-only visit log (history.jsonl) with an in-memory index for suggestions.
 * Private tabs and internal pages are never recorded. The file is compacted past MAX_ENTRIES.
 */
export class History {
  static readonly MAX_ENTRIES = 5000;
  private entries: HistoryEntry[] = [];

  constructor(private readonly path: string, private readonly log: (message: string) => void = () => {}) {
    this.load();
  }

  get count(): number {
    return this.entries.length;
  }

  static isRecordable(url: string | undefined | null): boolean {
    return isWebUrl(url) && !isInternal(url);
  }

  record(url: string, title: string, nowUtc: Date = new Date()): void {
    if (!History.isRecordable(url)) return;
    const entry: HistoryEntry = { visitedUtc: nowUtc.toISOString(), url, title: title.trim() || url };
    const last = this.entries[this.entries.length - 1];
    // Collapse reloads and title updates of the page just visited into one row.
    if (last && last.url === url) this.entries[this.entries.length - 1] = entry;
    else this.entries.push(entry);
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      if (this.entries.length > History.MAX_ENTRIES) {
        this.entries.splice(0, this.entries.length - History.MAX_ENTRIES);
        this.rewrite();
      } else {
        appendFileSync(this.path, `${JSON.stringify(entry)}\n`);
      }
    } catch (error) {
      this.log(`History write failed: ${String(error)}`);
    }
  }

  /** Most recent first, one row per URL. */
  recent(limit = 200): HistoryEntry[] {
    return this.distinct([...this.entries].reverse()).slice(0, limit);
  }

  /** Case-insensitive match on URL or title, most recent first, one row per URL. */
  search(query: string, limit = 50): HistoryEntry[] {
    const q = query.trim().toLowerCase();
    let source = [...this.entries].reverse();
    if (q) source = source.filter((e) => e.url.toLowerCase().includes(q) || e.title.toLowerCase().includes(q));
    return this.distinct(source).slice(0, limit);
  }

  remove(url: string): void {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.url !== url);
    if (this.entries.length !== before) this.rewrite();
  }

  clear(): void {
    this.entries = [];
    this.rewrite();
  }

  private distinct(source: HistoryEntry[]): HistoryEntry[] {
    const seen = new Set<string>();
    return source.filter((e) => (seen.has(e.url) ? false : (seen.add(e.url), true)));
  }

  private load(): void {
    if (!existsSync(this.path)) return;
    try {
      for (const line of readFileSync(this.path, "utf8").split("\n")) {
        if (!line) continue;
        try {
          const entry = JSON.parse(line) as Partial<HistoryEntry>;
          if (typeof entry.url !== "string" || typeof entry.title !== "string" || typeof entry.visitedUtc !== "string" || !History.isRecordable(entry.url)) continue;
          const last = this.entries[this.entries.length - 1];
          // record() appends title updates of the same page as new lines; collapse them like it does in memory.
          if (last && last.url === entry.url) this.entries[this.entries.length - 1] = entry as HistoryEntry;
          else this.entries.push(entry as HistoryEntry);
        } catch {
          // A torn last line after a crash is dropped.
        }
      }
    } catch (error) {
      this.log(`History load failed: ${String(error)}`);
    }
  }

  private rewrite(): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, this.entries.map((e) => JSON.stringify(e)).join("\n") + (this.entries.length ? "\n" : ""));
    } catch (error) {
      this.log(`History rewrite failed: ${String(error)}`);
    }
  }
}
