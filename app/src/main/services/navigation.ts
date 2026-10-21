import { resolveAddressInput } from "../../shared/addressInput";
import { Pages } from "../../shared/pages";
import { hostOf } from "../../shared/security";
import { buildSearchUrl, newTabTarget, type AppSettings } from "../../shared/settings";
import type { TabManager } from "../tabs";

export interface NavigationHost {
  readonly tabs: TabManager;
  readonly settings: () => AppSettings;
  readonly httpAllowedHosts: Set<string>;
  openKeyboard(target: "address" | "page"): void;
  closeKeyboard(): void;
}

/**
 * Where a typed address, a link click or a new tab goes. Kept out of the shell so the rules — allow the host the user
 * chose to open over http, fall back to the search engine, keep private tabs on the internal page — live in one place.
 */
export class Navigation {
  constructor(private readonly host: NavigationHost) {}

  go(url: string, allowHttp = false): void {
    const tab = this.host.tabs.active ?? this.host.tabs.open(Pages.newtab);
    if (allowHttp) {
      const host = hostOf(url);
      if (host) this.host.httpAllowedHosts.add(host);
    }
    this.host.closeKeyboard();
    void this.host.tabs.load(tab, url);
  }

  /** A bar entry: an address or an internal page opens, anything else becomes a search (see resolveAddressInput). */
  searchOrGo(text: string): void {
    const intent = resolveAddressInput(text);
    if (!intent) return;
    this.go(intent.kind === "open" ? intent.url : buildSearchUrl(this.host.settings().searchEngine, intent.text));
  }

  newTab(isPrivate = false): void {
    const target = isPrivate ? Pages.newtab : newTabTarget(this.host.settings());
    this.host.tabs.open(target, { isPrivate });
    if (target !== Pages.newtab) this.host.openKeyboard("address");
  }
}
