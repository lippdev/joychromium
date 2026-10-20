import type { ShellState } from "../../shared/ipc";
import { t } from "../../shared/i18n";
import { cmd } from "./bridge";
import { FullscreenIcon, KeyboardIcon, SettingsIcon, TvIcon, VolumeIcon } from "./icons";

/** The Start/Guide menu: the things a controller needs that do not deserve a button in the bar. */
export function QuickMenu({ state, onClose, onTabs }: { state: ShellState; onClose: () => void; onTabs: () => void }) {
  const tr = (key: string) => t(state.language, key);
  const run = (command: Parameters<typeof cmd>[0]) => { cmd(command); onClose(); };
  return (
    <div class="overlay center" role="dialog" aria-modal="true" aria-label={tr("menu.title")} onClick={onClose}>
      <div class="menu" onClick={(e) => e.stopPropagation()}>
        <h2>{tr("menu.title")}</h2>
        <button class="menu-item" onClick={() => run({ type: "keyboard-open", target: "address" })}>
          <KeyboardIcon /> {tr("menu.type")}
        </button>
        <button class="menu-item" onClick={() => { onClose(); onTabs(); }}>
          <TvIcon /> {tr("menu.tabs")} ({state.tabs.length})
        </button>
        <button class="menu-item" onClick={() => run({ type: "new-tab" })}>
          <TvIcon /> {tr("menu.newTab")}
        </button>
        <button class="menu-item" onClick={() => run({ type: "window-mode" })}>
          <FullscreenIcon /> {state.windowMode === "tv" ? tr("menu.window") : tr("menu.tv")}
        </button>
        <button class="menu-item" onClick={() => run({ type: "mute-tab" })}>
          <VolumeIcon /> {tr("menu.mute")}
        </button>
        <button class="menu-item" onClick={() => run({ type: "zoom", delta: 0.1 })}>
          <KeyboardIcon /> {tr("menu.zoomIn")}
        </button>
        <button class="menu-item" onClick={() => run({ type: "zoom", delta: -0.1 })}>
          <KeyboardIcon /> {tr("menu.zoomOut")}
        </button>
        <button class="menu-item" onClick={() => run({ type: "settings" })}>
          <SettingsIcon /> {tr("menu.settings")}
        </button>
      </div>
    </div>
  );
}
