import type { ControllerEvent, ShellCommand, ShellState } from "../../shared/ipc";

/** The bridge installed by preload/chrome.ts. */
export interface ShellBridge {
  command(command: ShellCommand): void;
  controller(event: ControllerEvent): void;
  onState(callback: (state: ShellState) => void): void;
  onStatus(callback: (status: string) => void): void;
  thumbnails(): Promise<{ id: number; dataUrl: string }[]>;
  setUi(patch: { uiScale?: number; overscan?: number; highContrast?: boolean; language?: string }): void;
}

declare global {
  interface Window {
    shell: ShellBridge;
  }
}

export const bridge = (): ShellBridge => window.shell;
export const cmd = (command: ShellCommand): void => window.shell.command(command);
