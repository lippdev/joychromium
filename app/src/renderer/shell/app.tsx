import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ShellState } from "../../shared/ipc";
import { applyShellStatePatch } from "../../shared/statePatch";
import { buttonGlyphs } from "../../shared/controllerGlyphs";
import { t } from "../../shared/i18n";
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
  uiScale: 1, overscan: 0, highContrast: false, language: "pt-BR", controllerFamily: "generic",
};

export function App() {
  const [state, setState] = useState<ShellState>(Empty);
  const [overlay, setOverlay] = useState<"none" | "tabs" | "menu">("none");
  const [addressFocused, setAddressFocused] = useState(false);
  const chromeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // One full snapshot when the UI says it is listening, then only the areas that changed, applied over it.
    bridge().onState(setState);
    bridge().onPatch((patch) => setState((current) => applyShellStatePatch(current, patch)));
    bridge().ready();
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
    document.documentElement.lang = state.language;
    const overscan = `${state.overscan}%`;
    root.setProperty("--safe-x", overscan);
  }, [state.theme, state.uiScale, state.highContrast, state.windowMode, state.overscan, state.language]);

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

  const tr = (key: string) => t(state.language, key);
  const activeTab = state.tabs.find((tab) => tab.isActive);
  const tv = state.windowMode === "tv";
  const overlayOpen = overlay !== "none" || Boolean(state.keyboard) || Boolean(state.permission);

  return (
    <div class={`shell ${tv ? "tv" : "window"} ${state.chromeVisible ? "" : "chrome-hidden"} ${overlayOpen ? "overlay-open" : ""}`}>
      <div id="chrome" ref={chromeRef} class={state.chromeVisible ? "" : "hidden"}>
        <div class="bar" style={{ marginLeft: "var(--safe-x)", marginRight: "var(--safe-x)" }}>
          <button class="icon-btn" aria-label={tr("nav.back")} title={`${tr("nav.back")} · LB`} onClick={() => cmd({ type: "back" })}>
            <BackIcon />
          </button>
          <button class="icon-btn" aria-label={tr("nav.forward")} title={`${tr("nav.forward")} · RB`} onClick={() => cmd({ type: "forward" })}>
            <ForwardIcon />
          </button>
          <button class="icon-btn" aria-label={tr("nav.reload")} title={`${tr("nav.reload")} · X`} onClick={() => cmd({ type: "reload" })}>
            <ReloadIcon />
          </button>

          <AddressBar url={state.activeUrl} focused={addressFocused} setFocused={setAddressFocused} language={state.language} />

          <button
            class={`icon-btn ${state.isFavorite ? "on" : ""}`}
            aria-label={tr("nav.favorite")} aria-pressed={state.isFavorite}
            title={`${tr("nav.favorite")} · ${state.shortcutMod}+D · LB+Y`}
            onClick={() => cmd({ type: "toggle-favorite" })}
          >
            <StarIcon filled={state.isFavorite} />
          </button>
          <button
            id="tabs-button" class="icon-btn with-badge" aria-label={tr("nav.tabs")} title={`${tr("nav.tabs")} · LT/RT`}
            aria-haspopup="dialog" aria-expanded={overlay === "tabs"} onClick={() => setOverlay("tabs")}
          >
            <TabsIcon />
            {state.tabs.length > 1 && <span class="badge">{state.tabs.length}</span>}
          </button>
          <button
            class="icon-btn" aria-label={tr("nav.menu")} title={`${tr("nav.menu")} · Start`}
            aria-haspopup="dialog" aria-expanded={overlay === "menu"} onClick={() => setOverlay("menu")}
          >
            <MenuIcon />
          </button>

          {!state.nativeWindowControls && (
            <div class="window-controls">
              <button class="window-btn" aria-label={tr("nav.minimize")} onClick={() => cmd({ type: "window", action: "minimize" })}>─</button>
              <button class="window-btn" aria-label={tr("nav.maximize")} onClick={() => cmd({ type: "window", action: "maximize" })}>□</button>
              <button class="window-btn close" aria-label={tr("nav.close")} onClick={() => cmd({ type: "window", action: "close" })}>✕</button>
            </div>
          )}
        </div>
        {tv && (
          <div class="tab-hint">
            <span>{activeTab?.title ?? ""}</span>
            <span class="pad-hints">
              {(() => {
                const g = buttonGlyphs(state.controllerFamily);
                return `${g.back} voltar · ${g.select} abrir · ${g.reload} recarregar · ${g.keyboard} teclado`;
              })()}
            </span>
          </div>
        )}
      </div>

      {state.permission && <PermissionDialog prompt={state.permission} language={state.language} />}
      {state.keyboard && <Keyboard state={state} />}
      {overlay === "tabs" && <TabSwitcher tabs={state.tabs} language={state.language} onClose={() => setOverlay("none")} />}
      {overlay === "menu" && <QuickMenu state={state} onClose={() => setOverlay("none")} onTabs={() => setOverlay("tabs")} />}
      <Toasts status={state.status} />
      <div class="status-line">
        <span class={state.adBlock ? "on" : ""}><ShieldIcon /> {state.adBlock ? tr("status.adsOn") : tr("status.adsOff")}</span>
        <span class={state.controllerConnected ? "on" : ""}><GamepadIcon /> {state.controllerConnected ? tr("status.padOn") : tr("status.padOff")}</span>
        <span class="mode">{state.inputMode.toUpperCase()}</span>
      </div>
    </div>
  );
}

function AddressBar({ url, focused, setFocused, language }: { url: string; focused: boolean; setFocused: (v: boolean) => void; language: string }) {
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
        placeholder={t(language, "nav.address")}
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
    </form>
  );
}

function PermissionDialog({ prompt, language }: { prompt: NonNullable<ShellState["permission"]>; language: string }) {
  const tr = (key: string) => t(language, key);
  return (
    <div class="overlay center" role="dialog" aria-modal="true" aria-label={tr("permission.title")}>
      <div class="dialog">
        <h2>{tr("permission.title")}</h2>
        <p><strong>{prompt.host}</strong> {tr("permission.wants")} {prompt.description}.</p>
        <div class="dialog-actions">
          <button class="btn quiet" autofocus onClick={() => cmd({ type: "permission", allow: false, remember: false })}>{tr("permission.deny")}</button>
          <button class="btn quiet" onClick={() => cmd({ type: "permission", allow: false, remember: true })}>{tr("permission.denyAlways")}</button>
          <button class="btn" onClick={() => cmd({ type: "permission", allow: true, remember: false })}>{tr("permission.allow")}</button>
          <button class="btn" onClick={() => cmd({ type: "permission", allow: true, remember: true })}>{tr("permission.allowAlways")}</button>
        </div>
      </div>
    </div>
  );
}

export const icons = {
  BackIcon, ForwardIcon, ReloadIcon, HomeIcon, SearchIcon, StarIcon, SettingsIcon, TabsIcon, MenuIcon, CloseIcon,
  VolumeIcon, PlusIcon, TvIcon, FullscreenIcon, ShieldIcon, GamepadIcon,
};
