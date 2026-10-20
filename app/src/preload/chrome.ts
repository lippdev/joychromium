import { contextBridge, ipcRenderer } from "electron";
import { Channels } from "../shared/ipc";
import type { ControllerEvent, ShellCommand, ShellState, ShellStatePatch } from "../shared/ipc";

// Bundled by esbuild, so this sandboxed preload can import the shared contract instead of repeating channel names.
contextBridge.exposeInMainWorld("shell", {
  command(command: ShellCommand): void {
    ipcRenderer.send(Channels.shellCommand, command);
  },
  controller(event: ControllerEvent): void {
    ipcRenderer.send(Channels.controller, event);
  },
  ready(): void {
    ipcRenderer.send(Channels.shellReady);
  },
  onState(callback: (state: ShellState) => void): void {
    ipcRenderer.on(Channels.shellState, (_event, state: ShellState) => callback(state));
  },
  onPatch(callback: (patch: ShellStatePatch) => void): void {
    ipcRenderer.on(Channels.shellPatch, (_event, patch: ShellStatePatch) => callback(patch));
  },
  thumbnails(): Promise<{ id: number; dataUrl: string }[]> {
    return ipcRenderer.invoke(Channels.shellThumbnails);
  },
});
