import { Pages } from "../../shared/pages";
import { newTabTarget } from "../../shared/settings";
import { buildSuggestions } from "../../shared/suggestion";
import { insertIntoPage, submitPage } from "./keyboard";
import type { ShellHost } from "./shellHost";
import type { ShellCommand } from "../../shared/ipc";
import type { AppSettings } from "../../shared/settings";

/** Runs every command that arrives from the chrome UI, the keyboard or the gamepad. */
export class CommandRouter {
  constructor(private readonly host: ShellHost) {}

  async run(command: ShellCommand): Promise<void> {
    const h = this.host;
    const wc = h.activeWebContents;
    switch (command.type) {
      case "navigate": h.navigate(command.url, command.allowHttp); break;
      case "search-or-navigate": h.searchOrNavigate(command.text); break;
      case "back": if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); break;
      case "forward": if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); break;
      case "reload": wc?.reload(); break;
      case "home": h.navigate(h.store.current.homeUrl); break;
      case "settings": h.navigate(Pages.settings); break;
      case "new-tab": h.newTab(command.isPrivate); break;
      case "close-tab": {
        const tab = command.id === undefined ? h.tabs.active : h.tabs.byId(command.id);
        if (tab) h.tabs.close(tab);
        if (h.tabs.tabs.length === 0) h.tabs.open(newTabTarget(h.store.current));
        break;
      }
      case "activate-tab": { const tab = h.tabs.byId(command.id); if (tab) h.tabs.activate(tab); break; }
      case "switch-tab": h.tabs.switch(command.offset); break;
      case "reopen-tab": h.tabs.reopenClosed(); break;
      case "duplicate-tab": { const tab = h.tabs.byId(command.id); if (tab) h.tabs.open(tab.url, { isPrivate: tab.isPrivate }); break; }
      case "close-other-tabs": for (const t of [...h.tabs.tabs]) if (t.id !== command.id) h.tabs.close(t); break;
      case "mute-tab": {
        const tab = command.id === undefined ? h.tabs.active : h.tabs.byId(command.id);
        if (tab) {
          const muted = !tab.isMuted;
          tab.webContents.setAudioMuted(muted);
          h.status(muted ? "TAB MUTED" : "TAB UNMUTED");
          h.syncViews();
        }
        break;
      }
      case "toggle-favorite": h.toggleFavorite(); break;
      case "permission": h.resolvePermission(command.allow, command.remember); break;
      case "window":
        if (command.action === "minimize") h.window.minimize();
        else if (command.action === "maximize") h.window.isMaximized() ? h.window.unmaximize() : h.window.maximize();
        else h.window.close();
        break;
      case "zoom":
        if (wc) {
          const z = command.delta === 0 ? 1 : Math.min(3, Math.max(0.5, wc.getZoomFactor() + command.delta));
          wc.setZoomFactor(z);
          h.status(`ZOOM ${Math.round(z * 100)}%`);
        }
        break;
      case "fullscreen-toggle": h.setChromeVisible(!h.chromeVisible); break;
      case "window-mode": h.applyWindowMode(h.store.current.windowMode === "tv" ? "window" : "tv", true); break;
      case "find":
        h.find = { text: command.text };
        if (wc && command.text) wc.findInPage(command.text, { forward: !command.backwards, findNext: true });
        h.broadcast();
        break;
      case "find-close": h.find = undefined; wc?.stopFindInPage("clearSelection"); h.broadcast(); break;
      case "keyboard-open": h.openKeyboard(command.target); break;
      case "keyboard-close": h.closeKeyboard(); wc?.focus(); break;
      case "keyboard-insert": if (h.keyboard?.target === "page") await insertIntoPage(wc, command.text); break;
      case "keyboard-backspace": if (h.keyboard?.target === "page") await insertIntoPage(wc, ""); break;
      case "keyboard-submit":
        if (h.keyboard?.target === "page") { await submitPage(wc); h.closeKeyboard(); }
        break;
      case "address-input":
        h.suggestions = buildSuggestions(command.text, h.store.current.favorites, h.history.recent(500)).map((s) => ({ title: s.title, url: s.url }));
        h.broadcast();
        break;
      case "cycle-input-mode": h.cycleInputMode(); break;
      case "chrome-height": h.setLayout(command.height, 0); break;
      case "ui-settings": {
        const patch: Partial<AppSettings> = {};
        if (command.uiScale !== undefined) patch.uiScale = command.uiScale;
        if (command.overscan !== undefined) patch.overscan = Math.max(0, Math.min(8, command.overscan));
        if (command.highContrast !== undefined) patch.highContrast = command.highContrast;
        if (command.language !== undefined) patch.language = command.language;
        if (command.crashReports !== undefined) patch.crashReports = command.crashReports;
        h.store.update((s) => ({ ...s, ...patch }));
        h.broadcast();
        break;
      }
      case "escape":
        if (h.permissions.prompt) h.resolvePermission(false, false);
        else if (h.keyboard) h.closeKeyboard();
        else if (h.find) { h.find = undefined; wc?.stopFindInPage("clearSelection"); h.broadcast(); }
        else if (wc && !h.chromeVisible) await wc.executeJavaScript("document.exitFullscreen && document.exitFullscreen()", true).catch(() => undefined);
        else if (h.store.current.windowMode === "tv") h.applyWindowMode("window", true);
        break;
    }
  }
}
