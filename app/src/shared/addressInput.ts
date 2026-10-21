import { isInternal, isWebUrl } from "./pages";

/** What a typed entry means: an address to open, or words to search for. */
export type AddressIntent = { kind: "open"; url: string } | { kind: "search"; text: string };

/** Endings that look like a TLD but are files (`config.json`, `logo.png`): those are searched, not opened. */
const FILE_ENDINGS = new Set([
  "json", "txt", "png", "jpg", "jpeg", "gif", "webp", "svg", "pdf", "exe", "zip", "rar", "html", "htm", "css", "js",
  "ts", "mp3", "mp4", "mkv", "docx", "xlsx", "pptx", "log", "md",
]);

const HOST = String.raw`(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+([a-z]{2,24}|xn--[a-z0-9-]{2,59})`;
const DOMAIN = new RegExp(String.raw`^${HOST}(?::\d{1,5})?(?:[/?#]\S*)?$`, "i");
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?:[/?#]\S*)?$/;
const LOCALHOST = /^localhost(?::\d{1,5})?(?:[/?#]\S*)?$/i;

/**
 * Tells an address from a search, the way a browser's one box does: `youtube.com`, `www.site.com.br/tv`, `localhost:3000`
 * and `192.168.0.10` are addresses; anything with a space, or a single word, is a search.
 *
 * shortcut: no public-suffix list, so any `word.letters` ending that is not a known file type opens as a site; add the
 * list if a real search such as "node.sh" keeps being taken for an address.
 */
export function resolveAddressInput(input: string): AddressIntent | undefined {
  const text = input.trim();
  if (!text) return undefined;
  if (isWebUrl(text) || isInternal(text)) return { kind: "open", url: text };
  if (!/\s/.test(text)) {
    // A site on this machine or network has no certificate to speak of: http, like every browser does for these.
    if (LOCALHOST.test(text) || IPV4.test(text)) return { kind: "open", url: `http://${text}` };
    const match = DOMAIN.exec(text);
    if (match && !FILE_ENDINGS.has((match[1] ?? "").toLowerCase())) return { kind: "open", url: `https://${text}` };
  }
  return { kind: "search", text };
}
