import { contextBridge, ipcRenderer } from "electron";
import { Channels } from "../shared/ipc";
import type { ControllerEvent, ShellCommand, ShellState } from "../shared/ipc";

// Bundled by esbuild, so this sandboxed preload can import the shared contract instead of repeating channel names.
contextBridge.exposeInMainWorld("shell", {
  command(command: ShellCommand): void {
    ipcRenderer.send(Channels.shellCommand, command);
  },
  controller(event: ControllerEvent): void {
    ipcRenderer.send(Channels.controller, event);
  },
  onState(callback: (state: ShellState) => void): void {
    ipcRenderer.on(Channels.shellState, (_event, state: ShellState) => callback(state));
  },
  onStatus(callback: (status: string) => void): void {
    ipcRenderer.on(Channels.shellStatus, (_event, status: string) => callback(status));
  },
  thumbnails(): Promise<{ id: number; dataUrl: string }[]> {
    return ipcRenderer.invoke(Channels.shellThumbnails);
  },
});
