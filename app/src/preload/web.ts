import { contextBridge, ipcRenderer, webFrame } from "electron";
import { SPATIAL_WORLD } from "../shared/spatial";

// One preload for every tab, in every frame. Sandboxed preloads cannot require other modules, so the channel names are
// inlined (kept in sync with shared/ipc.ts).
const Channels = {
  pageMessage: "page:message",
  pageReply: "page:reply",
  pageFocusIn: "page:focusin",
  spatialScript: "page:spatial",
} as const;

// Spatial focus navigation and the virtual cursor, in this frame's isolated world: the page cannot read, replace or
// break them. Every frame gets the script, the shell's own pages included: a TV browser whose start screen or
// onboarding needed a mouse would fail its first acceptance scenario. A player inside an iframe is navigable too.
function injectSpatial(): void {
  void ipcRenderer
    .invoke(Channels.spatialScript)
    .then((code) => (typeof code === "string" ? webFrame.executeJavaScriptInIsolatedWorld(SPATIAL_WORLD, [{ code }]) : undefined))
    .catch(() => undefined);
}

injectSpatial();

if (window.location.protocol === "joychromium:") {
  // JoyChromium's own pages (settings, onboarding, new tab, ...): a {type, ...} message bridge and nothing else.
  contextBridge.exposeInMainWorld("joy", {
    post(message: unknown): void {
      ipcRenderer.send(Channels.pageMessage, message);
    },
    onMessage(callback: (message: unknown) => void): void {
      ipcRenderer.on(Channels.pageReply, (_event, message) => callback(message));
    },
  });
} else {
  // Web pages (isolated world): tell the shell when a text field takes focus so the controller keyboard can open.
  // Nothing is exposed to the page.
  document.addEventListener(
    "focusin",
    (event) => {
      const field = event.target as HTMLElement | null;
      if (!field || (field as HTMLInputElement).disabled || (field as HTMLInputElement).readOnly) return;
      const tag = field.tagName;
      const type = ((field as HTMLInputElement).type || "text").toLowerCase();
      const editable =
        field.isContentEditable ||
        tag === "TEXTAREA" ||
        (tag === "INPUT" && ["text", "search", "url", "email", "password", "tel", "number"].includes(type));
      if (editable) ipcRenderer.send(Channels.pageFocusIn);
    },
    true,
  );
}
