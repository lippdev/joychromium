import { contextBridge, ipcRenderer } from "electron";
import type { ControllerEvent, ShellCommand, ShellState } from "../shared/ipc";

// Sandboxed preloads cannot require other modules, so the channel names are inlined (kept in sync with shared/ipc.ts).
const Channels = {
  pageMessage: "page:message",
  pageReply: "page:reply",
  pageFocusIn: "page:focusin",
  shellCommand: "shell:command",
  shellState: "shell:state",
  shellStatus: "shell:status",
  controller: "shell:controller",
} as const;

// Bridge for the shell UI (tabs, toolbar, keyboard, prompts). Commands go up, state snapshots come down.
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
});

// Layout goes over its own channel so a burst of commands never delays it.
contextBridge.exposeInMainWorld("shellLayout", (top: number, bottom: number): void => {
  ipcRenderer.send("shell:layout", top, bottom);
});
