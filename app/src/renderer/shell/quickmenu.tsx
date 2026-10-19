import type { ShellState } from "../../shared/ipc";
import { cmd } from "./bridge";
import { FullscreenIcon, KeyboardIcon, SettingsIcon, TvIcon, VolumeIcon } from "./icons";

/** The Start/Guide menu: the things a controller needs that do not deserve a button in the bar. */
export function QuickMenu({ state, onClose, onTabs }: { state: ShellState; onClose: () => void; onTabs: () => void }) {
  const run = (command: Parameters<typeof cmd>[0]) => { cmd(command); onClose(); };
  return (
    <div class="overlay center" role="dialog" aria-modal="true" aria-label="Menu rápido" onClick={onClose}>
      <div class="menu" onClick={(e) => e.stopPropagation()}>
        <h2>Menu rápido</h2>
        <button class="menu-item" onClick={() => run({ type: "keyboard-open", target: "address" })}>
          <KeyboardIcon /> Digitar endereço
        </button>
        <button class="menu-item" onClick={() => { onClose(); onTabs(); }}>
          <TvIcon /> Abas ({state.tabs.length})
        </button>
        <button class="menu-item" onClick={() => run({ type: "new-tab" })}>
          <TvIcon /> Nova aba
        </button>
        <button class="menu-item" onClick={() => run({ type: "window-mode" })}>
          <FullscreenIcon /> {state.windowMode === "tv" ? "Modo janela" : "Modo TV (tela cheia)"}
        </button>
        <button class="menu-item" onClick={() => run({ type: "mute-tab" })}>
          <VolumeIcon /> Silenciar aba
        </button>
        <button class="menu-item" onClick={() => run({ type: "zoom", delta: 0.1 })}>
          <KeyboardIcon /> Aumentar zoom
        </button>
        <button class="menu-item" onClick={() => run({ type: "zoom", delta: -0.1 })}>
          <KeyboardIcon /> Diminuir zoom
        </button>
        <button class="menu-item" onClick={() => run({ type: "settings" })}>
          <SettingsIcon /> Configurações
        </button>
      </div>
    </div>
  );
}
