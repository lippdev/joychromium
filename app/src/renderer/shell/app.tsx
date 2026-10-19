import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ShellState } from "../../shared/ipc";
import { bridge, cmd } from "./bridge";
import {
  BackIcon, CloseIcon, ForwardIcon, FullscreenIcon, GamepadIcon, HomeIcon, MenuIcon, PlusIcon, ReloadIcon,
  SearchIcon, SettingsIcon, ShieldIcon, StarIcon, TabsIcon, TvIcon, VolumeIcon,
} from "./icons";
import { Keyboard } from "./keyboard";
import { QuickMenu } from "./quickmenu";
import { TabSwitcher } from "./tabswitcher";
import { Toasts } from "./toasts";
import { useGamepad } from "./gamepad";

const Empty: ShellState = {
  tabs: [], activeUrl: "", isFavorite: false, inputMode: "Spatial", adBlock: false, controllerConnected: false,
  chromeVisible: true, theme: { accent: "#64DDB5", background: "#0C0E13", surface: "#14171E", text: "#F3F5F9" },
  status: "", suggestions: [], shortcutMod: "Ctrl", nativeWindowControls: false, windowMode: "tv",
  uiScale: 1, overscan: 0, highContrast: false, language: "pt-BR",
};

export function App() {
  const [state, setState] = useState<ShellState>(Empty);
  const [overlay, setOverlay] = useState<"none" | "tabs" | "menu">("none");
  const [addressFocused, setAddressFocused] = useState(false);
  const chromeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bridge().onState(setState);
    // Transient statuses (blocked navigation, download progress) arrive on their own channel.
    bridge().onStatus((status) => setState((current) => ({ ...current, status })));
  }, []);

  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--accent", state.theme.accent);
    root.setProperty("--bg", state.theme.background);
    root.setProperty("--surface", state.theme.surface);
    root.setProperty("--text", state.theme.text);
    root.setProperty("--ui-scale", String(state.uiScale));
    const v = parseInt(state.theme.accent.slice(1), 16);
    const lum = (0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255;
    root.setProperty("--accent-text", lum > 0.45 ? "#07120F" : "#FFFFFF");
    document.body.dataset.contrast = state.highContrast ? "high" : "normal";
    document.body.dataset.mode = state.windowMode;
    const overscan = `${state.overscan}%`;
    root.setProperty("--safe-x", overscan);
  }, [state.theme, state.uiScale, state.highContrast, state.windowMode, state.overscan]);

  // The tab views sit below the chrome: report the chrome's real height whenever it changes.
  useEffect(() => {
    const report = () => {
      const top = document.getElementById("chrome")?.getBoundingClientRect().height ?? 0;
      bridge().command({ type: "chrome-height", height: Math.round(top) } as never);
    };
    const observer = new ResizeObserver(report);
    if (chromeRef.current) observer.observe(chromeRef.current);
    report();
    return () => observer.disconnect();
  }, []);

  useGamepad(state, overlay, setOverlay);

  const activeTab = state.tabs.find((t) => t.isActive);
  const tv = state.windowMode === "tv";
  const overlayOpen = overlay !== "none" || Boolean(state.keyboard) || Boolean(state.permission);

  return (
    <div class={`shell ${tv ? "tv" : "window"} ${state.chromeVisible ? "" : "chrome-hidden"} ${overlayOpen ? "overlay-open" : ""}`}>
      <div id="chrome" ref={chromeRef} class={state.chromeVisible ? "" : "hidden"}>
        <div class="bar" style={{ marginLeft: "var(--safe-x)", marginRight: "var(--safe-x)" }}>
          <button class="icon-btn" aria-label="Voltar" title="Voltar · LB" onClick={() => cmd({ type: "back" })}>
            <BackIcon />
          </button>
          <button class="icon-btn" aria-label="Avançar" title="Avançar · RB" onClick={() => cmd({ type: "forward" })}>
            <ForwardIcon />
          </button>
          <button class="icon-btn" aria-label="Recarregar" title="Recarregar · X" onClick={() => cmd({ type: "reload" })}>
            <ReloadIcon />
          </button>

          <AddressBar url={state.activeUrl} focused={addressFocused} setFocused={setAddressFocused} />

          <button
            class={`icon-btn ${state.isFavorite ? "on" : ""}`}
            aria-label="Favorito" title={`Favorito · ${state.shortcutMod}+D · LB+Y`}
            onClick={() => cmd({ type: "toggle-favorite" })}
          >
            <StarIcon filled={state.isFavorite} />
          </button>
          <button id="tabs-button" class="icon-btn with-badge" aria-label="Abas" title="Abas · LT/RT" onClick={() => setOverlay("tabs")}>
            <TabsIcon />
            {state.tabs.length > 1 && <span class="badge">{state.tabs.length}</span>}
          </button>
          <button class="icon-btn" aria-label="Menu" title="Menu rápido · Start" onClick={() => setOverlay("menu")}>
            <MenuIcon />
          </button>

          {!state.nativeWindowControls && (
            <div class="window-controls">
              <button class="window-btn" aria-label="Minimizar" onClick={() => cmd({ type: "window", action: "minimize" })}>─</button>
              <button class="window-btn" aria-label="Maximizar" onClick={() => cmd({ type: "window", action: "maximize" })}>□</button>
              <button class="window-btn close" aria-label="Fechar" onClick={() => cmd({ type: "window", action: "close" })}>✕</button>
            </div>
          )}
        </div>
        {tv && <div class="tab-hint">{activeTab?.title ?? ""}</div>}
      </div>

      {state.permission && <PermissionDialog prompt={state.permission} />}
      {state.keyboard && <Keyboard state={state} />}
      {overlay === "tabs" && <TabSwitcher tabs={state.tabs} onClose={() => setOverlay("none")} />}
      {overlay === "menu" && <QuickMenu state={state} onClose={() => setOverlay("none")} onTabs={() => setOverlay("tabs")} />}
      <Toasts status={state.status} />
      <div class="status-line">
        <span class={state.adBlock ? "on" : ""}><ShieldIcon /> {state.adBlock ? "ADS BLOCKED" : "ADBLOCK OFF"}</span>
        <span class={state.controllerConnected ? "on" : ""}><GamepadIcon /> {state.controllerConnected ? "CONTROLLER" : "NO CONTROLLER"}</span>
        <span class="mode">{state.inputMode.toUpperCase()}</span>
      </div>
    </div>
  );
}

function AddressBar({ url, focused, setFocused }: { url: string; focused: boolean; setFocused: (v: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(url);
  useEffect(() => { if (!focused) setValue(url); }, [url, focused]);

  const submit = () => cmd({ type: "search-or-navigate", text: value });
  return (
    <form
      class="address"
      onSubmit={(e) => { e.preventDefault(); submit(); setFocused(false); (input.current as HTMLInputElement | null)?.blur(); }}
    >
      <SearchIcon />
      <input
        ref={input}
        id="address"
        aria-label="Endereço"
        placeholder="Pesquisar ou digitar um endereço"
        autocomplete="off"
        spellcheck={false}
        value={value}
        onFocus={() => { setFocused(true); cmd({ type: "keyboard-open", target: "address" }); (input.current as HTMLInputElement).select(); }}
        onBlur={() => setFocused(false)}
        onInput={(e) => {
          const text = (e.target as HTMLInputElement).value;
          setValue(text);
          cmd({ type: "address-input", text });
        }}
      />
      <button id="go" type="submit" class="visually-hidden" aria-hidden="true" tabIndex={-1}>OK</button>
    </form>
  );
}

function PermissionDialog({ prompt }: { prompt: NonNullable<ShellState["permission"]> }) {
  return (
    <div class="overlay center" role="dialog" aria-modal="true" aria-label="Pedido de permissão">
      <div class="dialog">
        <h2>Permissão</h2>
        <p><strong>{prompt.host}</strong> quer usar {prompt.description}.</p>
        <div class="dialog-actions">
          <button class="btn quiet" autofocus onClick={() => cmd({ type: "permission", allow: false, remember: false })}>Negar</button>
          <button class="btn quiet" onClick={() => cmd({ type: "permission", allow: false, remember: true })}>Negar sempre</button>
          <button class="btn" onClick={() => cmd({ type: "permission", allow: true, remember: false })}>Permitir</button>
          <button class="btn" onClick={() => cmd({ type: "permission", allow: true, remember: true })}>Permitir sempre</button>
        </div>
      </div>
    </div>
  );
}

export const icons = {
  BackIcon, ForwardIcon, ReloadIcon, HomeIcon, SearchIcon, StarIcon, SettingsIcon, TabsIcon, MenuIcon, CloseIcon,
  VolumeIcon, PlusIcon, TvIcon, FullscreenIcon, ShieldIcon, GamepadIcon,
};
