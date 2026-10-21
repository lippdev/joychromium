import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ShellState, TabState } from "../../shared/ipc";
import { applyShellStatePatch } from "../../shared/statePatch";
import { buttonGlyphs } from "../../shared/controllerGlyphs";
import { isBlockedStatus } from "../../shared/haptics";
import { t } from "../../shared/i18n";
import { isInternal } from "../../shared/pages";
import { bridge, cmd } from "./bridge";
import {
  BackIcon, CaptionCloseIcon, CaptionMaximizeIcon, CaptionMinimizeIcon, CaptionRestoreIcon, CloseIcon, ForwardIcon, GlobeIcon, FullscreenIcon, GamepadIcon, HomeIcon, MenuIcon, PlusIcon, ReloadIcon,
  SearchIcon, SettingsIcon, ShieldIcon, StarIcon, TabsIcon, TvIcon, VolumeIcon,
} from "./icons";
import { Keyboard } from "./keyboard";
import { QuickMenu } from "./quickmenu";
import { TabSwitcher } from "./tabswitcher";
import { Toasts } from "./toasts";
import { useGamepad } from "./gamepad";
import { vibrate } from "./haptics";

const Empty: ShellState = {
  tabs: [], activeUrl: "", isFavorite: false, inputMode: "Spatial", adBlock: false, controllerConnected: false,
  chromeVisible: true, theme: { accent: "#2B95FF", background: "#1C1C1C", surface: "#2B2B2B", text: "#F3F3F3" },
  status: "", suggestions: [], shortcutMod: "Ctrl", nativeWindowControls: false, maximized: false, windowMode: "tv",
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
    bridge().onPatch((patch) => {
      setState((current) => applyShellStatePatch(current, patch));
      // The status line is where a refusal shows up: the pad answers it with the error cue.
      if (patch.status !== undefined && isBlockedStatus(patch.status)) vibrate("error");
    });
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
    root.setProperty("--accent-text", lum > 0.45 ? "#0A0F1A" : "#FFFFFF");
    document.body.dataset.contrast = state.highContrast ? "high" : "normal";
    document.body.dataset.mode = state.windowMode;
    document.documentElement.lang = state.language;
    const overscan = `${state.overscan}%`;
    root.setProperty("--safe-x", overscan);
  }, [state.theme, state.uiScale, state.highContrast, state.windowMode, state.overscan, state.language]);

  // The tab views sit below the chrome and above the controller keyboard: report both whenever either changes.
  const insets = useRef({ top: 0, bottom: 0 });
  const [chromeTop, setChromeTop] = useState(0);
  const sendInsets = () => cmd({ type: "chrome-height", height: insets.current.top, bottom: insets.current.bottom });
  useEffect(() => {
    const report = () => {
      insets.current.top = Math.round(document.getElementById("chrome")?.getBoundingClientRect().height ?? 0);
      setChromeTop(insets.current.top);
      sendInsets();
    };
    const observer = new ResizeObserver(report);
    if (chromeRef.current) observer.observe(chromeRef.current);
    report();
    return () => observer.disconnect();
  }, []);
  const keyboardInset = (bottom: number) => {
    if (insets.current.bottom === bottom) return;
    insets.current.bottom = bottom;
    sendInsets();
  };

  // The page is a native view above this document, so a modal overlay would open behind it. The overlay paints a
  // snapshot of the page instead, and only then asks the live view to step aside, so nothing flickers.
  const modal = overlay !== "none" || Boolean(state.permission);
  const [cover, setCover] = useState("");
  const covered = useRef(false);
  useEffect(() => {
    if (!modal) {
      setCover("");
      if (covered.current) cmd({ type: "page-cover", covered: false });
      covered.current = false;
      return;
    }
    let live = true;
    void bridge().snapshot().then((image) => {
      if (!live) return;
      setCover(image);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!live) return;
        covered.current = true;
        cmd({ type: "page-cover", covered: true });
      }));
    });
    return () => { live = false; };
  }, [modal]);

  useGamepad(state, overlay, setOverlay);

  const tr = (key: string) => t(state.language, key);
  const tv = state.windowMode === "tv";
  const overlayOpen = overlay !== "none" || Boolean(state.keyboard) || Boolean(state.permission);

  return (
    <div
      class={`shell ${tv ? "tv" : "window"} ${state.chromeVisible ? "" : "chrome-hidden"} ${overlayOpen ? "overlay-open" : ""}`}
      // A screen reader learns which control has focus from the focused document: while a tab view keeps the
      // window's focus, the reader hears the address bar's value but not its name.
      onFocusIn={() => bridge().focus()}
    >
      <div id="chrome" ref={chromeRef} class={state.chromeVisible ? "" : "hidden"}>
        <div class={`tabstrip ${state.nativeWindowControls ? "traffic-lights" : ""}`} style={{ paddingLeft: "var(--safe-x)", paddingRight: state.nativeWindowControls ? "var(--safe-x)" : undefined }}>
          <button
            id="tabs-button" class="strip-btn" aria-label={tr("nav.tabs")} title={`${tr("nav.tabs")} · LT/RT`}
            aria-haspopup="dialog" aria-expanded={overlay === "tabs"} onClick={() => setOverlay("tabs")}
          >
            <TabsIcon size={18} />
            {state.tabs.length > 1 && <span class="badge">{state.tabs.length}</span>}
          </button>
          <TabStrip tabs={state.tabs} language={state.language} />
          {!state.nativeWindowControls && (
            <div class="window-controls">
              <button class="window-btn" aria-label={tr("nav.minimize")} title={tr("nav.minimize")} onClick={() => cmd({ type: "window", action: "minimize" })}><CaptionMinimizeIcon /></button>
              <button class="window-btn" aria-label={tr(state.maximized ? "nav.restore" : "nav.maximize")} title={tr(state.maximized ? "nav.restore" : "nav.maximize")} onClick={() => cmd({ type: "window", action: "maximize" })}>
                {state.maximized ? <CaptionRestoreIcon /> : <CaptionMaximizeIcon />}
              </button>
              <button class="window-btn close" aria-label={tr("nav.close")} title={tr("nav.close")} onClick={() => cmd({ type: "window", action: "close" })}><CaptionCloseIcon /></button>
            </div>
          )}
        </div>
        <div class="bar" style={{ paddingLeft: "calc(var(--safe-x) + var(--space-2))", paddingRight: "calc(var(--safe-x) + var(--space-2))" }}>
          <button class="icon-btn" aria-label={tr("nav.back")} title={`${tr("nav.back")} · LB`} onClick={() => cmd({ type: "back" })}>
            <BackIcon />
          </button>
          <button class="icon-btn" aria-label={tr("nav.forward")} title={`${tr("nav.forward")} · RB`} onClick={() => cmd({ type: "forward" })}>
            <ForwardIcon />
          </button>
          <button class="icon-btn" aria-label={tr("nav.reload")} title={`${tr("nav.reload")} · X`} onClick={() => cmd({ type: "reload" })}>
            <ReloadIcon />
          </button>

          <AddressBar url={state.activeUrl} focused={addressFocused} setFocused={setAddressFocused} language={state.language} keyboard={Boolean(state.keyboard?.target === "address")}>
            <Toasts status={state.status} />
            <button
              class={`address-btn ${state.isFavorite ? "on" : ""}`}
              aria-label={tr("nav.favorite")} aria-pressed={state.isFavorite}
              title={`${tr("nav.favorite")} · ${state.shortcutMod}+D · LB+Y`}
              onClick={() => cmd({ type: "toggle-favorite" })}
            >
              <StarIcon size={18} filled={state.isFavorite} />
            </button>
          </AddressBar>
          {/* What used to be the status line, as toolbar indicators: Edge shows its tracking shield the same way. */}
          <div class="status-line">
            <span class={`indicator ${state.adBlock ? "on" : ""}`} role="img" aria-label={state.adBlock ? tr("status.adsOn") : tr("status.adsOff")} title={state.adBlock ? tr("status.adsOn") : tr("status.adsOff")}>
              <ShieldIcon />
            </span>
            <span class={`indicator pad ${state.controllerConnected ? "on" : "off"}`} title={state.controllerConnected ? tr("status.padOn") : tr("status.padOff")}>
              <GamepadIcon /> <span class="mode">{state.inputMode.toUpperCase()}</span>
            </span>
          </div>
          <button
            class="icon-btn" aria-label={tr("nav.menu")} title={`${tr("nav.menu")} · Start`}
            aria-haspopup="dialog" aria-expanded={overlay === "menu"} onClick={() => setOverlay("menu")}
          >
            <MenuIcon />
          </button>
        </div>
        {tv && (
          <div class="tab-hint">
            <span class="pad-hints">
              {(() => {
                const g = buttonGlyphs(state.controllerFamily);
                return `${g.back} voltar · ${g.select} abrir · ${g.reload} recarregar · ${g.keyboard} teclado · ${g.stick} cursor`;
              })()}
            </span>
          </div>
        )}
      </div>

      {state.permission && <PermissionDialog prompt={state.permission} language={state.language} />}
      {cover && <img class="page-cover" src={cover} alt="" style={{ top: `${state.chromeVisible ? chromeTop : 0}px` }} />}
      {state.keyboard && <Keyboard state={state} onInset={keyboardInset} />}
      {overlay === "tabs" && <TabSwitcher tabs={state.tabs} language={state.language} onClose={() => setOverlay("none")} />}
      {overlay === "menu" && <QuickMenu state={state} onClose={() => setOverlay("none")} onTabs={() => setOverlay("tabs")} />}
    </div>
  );
}

/** Edge's tab strip: every tab with its icon, title and close button, the active one joined to the toolbar below. */
function TabStrip({ tabs, language }: { tabs: TabState[]; language: string }) {
  return (
    <nav class="tabs" aria-label={t(language, "nav.tabs")}>
      {tabs.map((tab) => (
        <div key={tab.id} class={`tab ${tab.isActive ? "active" : ""} ${tab.sleeping ? "sleeping" : ""}`}>
          <button
            class="tab-main"
            title={tab.title || tab.url}
            aria-current={tab.isActive ? "page" : undefined}
            onClick={() => cmd({ type: "activate-tab", id: tab.id })}
            onAuxClick={(e) => { if (e.button === 1) cmd({ type: "close-tab", id: tab.id }); }}
          >
            {tab.isLoading
              ? <span class="tab-spinner" aria-hidden="true" />
              : tab.favicon ? <img class="tab-icon" src={tab.favicon} alt="" /> : <GlobeIcon class="tab-icon" />}
            <span class="tab-title">{tab.title || tab.url}</span>
            {tab.isPlayingAudio && <VolumeIcon size={14} muted={tab.isMuted} class="tab-audio" />}
          </button>
          <button class="tab-x" aria-label={`${t(language, "tabs.close")}: ${tab.title || tab.url}`} title={t(language, "tabs.close")} onClick={() => cmd({ type: "close-tab", id: tab.id })}>
            <CloseIcon size={14} />
          </button>
        </div>
      ))}
      <button class="new-tab" aria-label={t(language, "tabs.new")} title={`${t(language, "tabs.new")}`} onClick={() => cmd({ type: "new-tab" })}>
        <PlusIcon size={18} />
      </button>
    </nav>
  );
}

function AddressBar({ url, focused, setFocused, language, keyboard, children }: { url: string; focused: boolean; setFocused: (v: boolean) => void; language: string; keyboard: boolean; children?: ComponentChildren }) {
  const input = useRef<HTMLInputElement>(null);
  // The controller keyboard starts a search, not an edit: an internal URL is not something a viewer types, and
  // appending the query to "joychromium://newtab" would search for a string nobody asked for. On a web page the current
  // address stays, so Y still edits it; a field focused with the mouse keeps showing the URL too.
  const fresh = keyboard && isInternal(url);
  const shown = fresh ? "" : url;
  const [value, setValue] = useState(shown);
  useEffect(() => { if (!focused) setValue(shown); }, [shown, focused]);

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
        aria-label={t(language, "a11y.address")}
        placeholder={t(language, "nav.address")}
        autocomplete="off"
        spellcheck={false}
        value={value}
        onFocus={() => { setFocused(true); cmd({ type: "keyboard-open", target: "address" }); (input.current as HTMLInputElement).select(); }}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          // Down leaves the field for the suggestions the controller keyboard shows, so both inputs reach them.
          if (e.key !== "ArrowDown") return;
          const first = document.querySelector<HTMLElement>(".suggestions .chip");
          if (!first) return;
          e.preventDefault();
          first.focus();
        }}
        onInput={(e) => {
          const text = (e.target as HTMLInputElement).value;
          setValue(text);
          cmd({ type: "address-input", text });
        }}
      />
      {children}
    </form>
  );
}

function PermissionDialog({ prompt, language }: { prompt: NonNullable<ShellState["permission"]>; language: string }) {
  const tr = (key: string) => t(language, key);
  const deny = useRef<HTMLButtonElement>(null);
  // The page asked for the permission, so its view is the one with focus: the prompt takes the focus itself, or a
  // reader user is never told it is there.
  useEffect(() => { deny.current?.focus(); }, []);
  return (
    <div class="overlay center" role="dialog" aria-modal="true" aria-label={tr("permission.title")}>
      <div class="dialog">
        <h2>{tr("permission.title")}</h2>
        <p><strong>{prompt.host}</strong> {tr("permission.wants")} {prompt.description}.</p>
        <div class="dialog-actions">
          <button ref={deny} class="btn quiet" onClick={() => cmd({ type: "permission", allow: false, remember: false })}>{tr("permission.deny")}</button>
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
