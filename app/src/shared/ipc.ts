/** IPC channel names and payload shapes shared by main, preloads and the chrome renderer. */

export const Channels = {
  /** internal page -> main: { type, ...payload } */
  pageMessage: "page:message",
  /** main -> internal page: { type, ...payload } */
  pageReply: "page:reply",
  /** web page preload -> main: a text field received focus */
  pageFocusIn: "page:focusin",
  /** chrome renderer -> main: a shell command */
  shellCommand: "shell:command",
  /** main -> chrome renderer: full state snapshot */
  shellState: "shell:state",
  /** main -> chrome renderer: transient status line */
  shellStatus: "shell:status",
  /** chrome renderer -> main: controller input event */
  controller: "shell:controller",
} as const;

export interface TabState {
  id: number;
  title: string;
  url: string;
  isActive: boolean;
  isPrivate: boolean;
  isPlayingAudio: boolean;
  isMuted: boolean;
  favicon?: string;
  isLoading: boolean;
}

export interface PermissionPrompt {
  host: string;
  kind: string;
  description: string;
}

export interface ShellState {
  tabs: TabState[];
  activeUrl: string;
  isFavorite: boolean;
  inputMode: "Spatial" | "Cursor" | "Arrows";
  adBlock: boolean;
  controllerConnected: boolean;
  chromeVisible: boolean;
  permission?: PermissionPrompt;
  theme: { accent: string; background: string; surface: string; text: string };
  status: string;
  keyboard?: { target: "address" | "page"; title: string };
  find?: { text: string };
  suggestions: { title: string; url: string }[];
}

export type ShellCommand =
  | { type: "navigate"; url: string; allowHttp?: boolean }
  | { type: "search-or-navigate"; text: string }
  | { type: "back" }
  | { type: "forward" }
  | { type: "reload" }
  | { type: "home" }
  | { type: "settings" }
  | { type: "new-tab"; isPrivate?: boolean }
  | { type: "close-tab"; id?: number }
  | { type: "activate-tab"; id: number }
  | { type: "switch-tab"; offset: number }
  | { type: "reopen-tab" }
  | { type: "duplicate-tab"; id: number }
  | { type: "close-other-tabs"; id: number }
  | { type: "mute-tab"; id?: number }
  | { type: "toggle-favorite" }
  | { type: "permission"; allow: boolean; remember: boolean }
  | { type: "window"; action: "minimize" | "maximize" | "close" }
  | { type: "zoom"; delta: number }
  | { type: "fullscreen-toggle" }
  | { type: "find"; text: string; backwards?: boolean }
  | { type: "find-close" }
  | { type: "keyboard-open"; target: "address" | "page" }
  | { type: "keyboard-close" }
  | { type: "keyboard-insert"; text: string }
  | { type: "keyboard-backspace" }
  | { type: "keyboard-submit" }
  | { type: "address-input"; text: string }
  | { type: "cycle-input-mode" }
  | { type: "escape" };

export type ControllerEvent =
  | { type: "direction"; direction: "up" | "down" | "left" | "right" }
  | { type: "activate" }
  | { type: "cursor-move"; dx: number; dy: number }
  | { type: "cursor-click" }
  | { type: "scroll"; notches: number }
  | { type: "connected"; connected: boolean };
