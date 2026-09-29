import { isInternal } from "./pages";
import type { Shortcut } from "./settings";

export interface HistoryEntry {
  visitedUtc: string;
  url: string;
  title: string;
}

export interface Suggestion {
  title: string;
  url: string;
  kind: "favorite" | "history";
}

const matches = (q: string, title: string, url: string): boolean =>
  title.toLowerCase().includes(q) || url.toLowerCase().includes(q);

/** Favorites first, then history; one row per URL; empty or internal queries yield nothing. */
export function buildSuggestions(query: string, favorites: readonly Shortcut[], history: readonly HistoryEntry[], limit = 6): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (!q || isInternal(q)) return [];
  const seen = new Set<string>();
  const result: Suggestion[] = [];
  for (const f of favorites) {
    if (matches(q, f.name, f.url) && !seen.has(f.url)) {
      seen.add(f.url);
      result.push({ title: `★ ${f.name}`, url: f.url, kind: "favorite" });
    }
  }
  for (const h of history) {
    if (matches(q, h.title, h.url) && !seen.has(h.url)) {
      seen.add(h.url);
      result.push({ title: h.title, url: h.url, kind: "history" });
    }
  }
  return result.slice(0, limit);
}
