import { contextBridge, ipcRenderer } from "electron";
import { Channels } from "../shared/ipc";
import type { ControllerEvent, ShellActivity, ShellCommand, ShellPreferences, ShellState, ShellStatePatch } from "../shared/ipc";

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
  focus(): void {
    ipcRenderer.send(Channels.shellFocus);
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
  onActivity(callback: (activity: ShellActivity) => void): () => void {
    const listener = (_event: unknown, activity: ShellActivity): void => callback(activity);
    ipcRenderer.on(Channels.shellActivity, listener);
    return () => ipcRenderer.removeListener(Channels.shellActivity, listener);
  },
  preferences(): Promise<ShellPreferences> {
    return ipcRenderer.invoke(Channels.shellPreferences);
  },
});
