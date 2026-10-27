import type { ControllerEvent, ShellActivity, ShellCommand, ShellPreferences, ShellState, ShellStatePatch } from "../../shared/ipc";

/** The bridge installed by preload/chrome.ts. */
export interface ShellBridge {
  command(command: ShellCommand): void;
  controller(event: ControllerEvent): void;
  /** Tells the main process the UI is listening, which makes it send the first full snapshot. */
  ready(): void;
  /** Tells the main process the shell has keyboard focus, so a tab view does not keep it. */
  focus(): void;
  onState(callback: (state: ShellState) => void): void;
  onPatch(callback: (patch: ShellStatePatch) => void): void;
  /** Whether the window is on screen, so idle loops park while it is minimized. Returns its own unsubscribe. */
  onActivity(callback: (activity: ShellActivity) => void): () => void;
  thumbnails(): Promise<{ id: number; dataUrl: string }[]>;
  /** The D-pad went up out of the page: focus the toolbar. */
  onFocusChrome(callback: () => void): void;
  /** The active page as an image, painted under a modal overlay while the live view is hidden. */
  snapshot(): Promise<string>;
  preferences(): Promise<ShellPreferences>;
  setUi(patch: { uiScale?: number; overscan?: number; highContrast?: boolean; language?: string }): void;
}

declare global {
  interface Window {
    shell: ShellBridge;
  }
}

export const bridge = (): ShellBridge => window.shell;
export const cmd = (command: ShellCommand): void => window.shell.command(command);
