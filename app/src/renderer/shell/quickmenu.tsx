import { useEffect, useRef } from "preact/hooks";
import type { ShellState } from "../../shared/ipc";
import { t } from "../../shared/i18n";
import { cmd } from "./bridge";
import {
  FullscreenIcon, KeyboardIcon, PictureInPictureIcon, PlayPauseIcon, PlusIcon, SettingsIcon, SkipBackIcon, SkipForwardIcon, TabsIcon,
  VolumeIcon, ZoomInIcon, ZoomOutIcon,
} from "./icons";

/** The Start/Guide menu: the things a controller needs that do not deserve a button in the bar. */
export function QuickMenu({ state, onClose, onTabs }: { state: ShellState; onClose: () => void; onTabs: () => void }) {
  const tr = (key: string) => t(state.language, key);
  const run = (command: Parameters<typeof cmd>[0]) => { cmd(command); onClose(); };
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => { menu.current?.querySelector<HTMLButtonElement>(".menu-item")?.focus(); }, []);
  return (
    <div class={`overlay ${state.windowMode === "tv" ? "center" : "dropdown"}`} role="dialog" aria-modal="true" aria-label={tr("menu.title")} onClick={onClose}>
      <div class="menu" ref={menu} onClick={(e) => e.stopPropagation()}>
        <h2>{tr("menu.title")}</h2>
        <button class="menu-item" onClick={() => run({ type: "keyboard-open", target: "address" })}>
          <KeyboardIcon /> {tr("menu.type")}
        </button>
        <button class="menu-item" onClick={() => { onClose(); onTabs(); }}>
          <TabsIcon /> {tr("menu.tabs")} ({state.tabs.length})
        </button>
        <button class="menu-item" onClick={() => run({ type: "new-tab" })}>
          <PlusIcon /> {tr("menu.newTab")}
        </button>
        <button class="menu-item" onClick={() => run({ type: "window-mode" })}>
          <FullscreenIcon /> {state.windowMode === "tv" ? tr("menu.window") : tr("menu.tv")}
        </button>
        <button class="menu-item" onClick={() => run({ type: "media", action: "toggle" })}>
          <PlayPauseIcon /> {tr("menu.playPause")}
        </button>
        <button class="menu-item" onClick={() => run({ type: "media", action: "pip" })}>
          <PictureInPictureIcon /> {tr("menu.pictureInPicture")}
        </button>
        <button class="menu-item" onClick={() => run({ type: "media", action: "previous" })}>
          <SkipBackIcon /> {tr("menu.previousTrack")}
        </button>
        <button class="menu-item" onClick={() => run({ type: "media", action: "next" })}>
          <SkipForwardIcon /> {tr("menu.nextTrack")}
        </button>
        <button class="menu-item" onClick={() => run({ type: "mute-tab" })}>
          <VolumeIcon /> {tr("menu.mute")}
        </button>
        <button class="menu-item" onClick={() => run({ type: "zoom", delta: 0.1 })}>
          <ZoomInIcon /> {tr("menu.zoomIn")}
        </button>
        <button class="menu-item" onClick={() => run({ type: "zoom", delta: -0.1 })}>
          <ZoomOutIcon /> {tr("menu.zoomOut")}
        </button>
        <button class="menu-item" onClick={() => run({ type: "settings" })}>
          <SettingsIcon /> {tr("menu.settings")}
        </button>
      </div>
    </div>
  );
}
