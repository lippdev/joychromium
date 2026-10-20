import type { ControllerEvent, ShellCommand, ShellPreferences, ShellState, ShellStatePatch } from "../../shared/ipc";

/** The bridge installed by preload/chrome.ts. */
export interface ShellBridge {
  command(command: ShellCommand): void;
  controller(event: ControllerEvent): void;
  /** Tells the main process the UI is listening, which makes it send the first full snapshot. */
  ready(): void;
  onState(callback: (state: ShellState) => void): void;
  onPatch(callback: (patch: ShellStatePatch) => void): void;
  thumbnails(): Promise<{ id: number; dataUrl: string }[]>;
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
