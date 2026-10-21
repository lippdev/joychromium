/** IPC channel names and payload shapes shared by main, preloads and the chrome renderer. */

import type { MediaAction } from "./media";

export const Channels = {
  /** internal page -> main: { type, ...payload } */
  pageMessage: "page:message",
  /** main -> internal page: { type, ...payload } */
  pageReply: "page:reply",
  /** web page preload -> main: a text field received focus */
  pageFocusIn: "page:focusin",
  /** web page preload -> main (invoke): the spatial navigation and cursor script, for the frame's isolated world */
  spatialScript: "page:spatial",
  /** chrome renderer -> main: a shell command */
  shellCommand: "shell:command",
  /** main -> chrome renderer: full state snapshot, sent once when the UI says it is ready */
  shellState: "shell:state",
  /** main -> chrome renderer: only the state areas that changed since the last message */
  shellPatch: "shell:patch",
  /** chrome renderer -> main: the UI is listening and wants the first full snapshot */
  shellReady: "shell:ready",
  /** chrome renderer -> main: controller input event */
  controller: "shell:controller",
  /** chrome renderer -> main (invoke): one small screenshot per tab, for the tab switcher */
  shellThumbnails: "shell:thumbnails",
  shellSnapshot: "shell:snapshot",
  /** chrome renderer -> main: the chrome's height, so the tab views sit below it */
  shellLayout: "shell:layout",
  /** chrome renderer -> main (invoke): the preferences the shell itself acts on, such as haptics */
  shellPreferences: "shell:preferences",
  /** main -> chrome renderer: whether the window is on screen, so idle loops can park while it is minimized */
  shellActivity: "shell:activity",
  /** chrome renderer -> main: focus landed on a control of the shell, so the window's focus belongs to it and not to a tab */
  shellFocus: "shell:focus",
  /** main -> chrome renderer: the D-pad went up out of the page, so the toolbar takes the focus */
  shellFocusChrome: "shell:focus-chrome",
} as const;

/** Whether the window is on screen: sent when it is minimized, hidden, restored or shown. */
export interface ShellActivity {
  active: boolean;
}

/** Read right before an action, so a switch flipped in Settings applies on the next press. */
export interface ShellPreferences {
  vibration: boolean;
}

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
  sleeping: boolean;
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
  controllerFamily: "xbox" | "playstation" | "switch" | "generic";
  chromeVisible: boolean;
  permission?: PermissionPrompt;
  theme: { accent: string; background: string; surface: string; text: string };
  status: string;
  keyboard?: { target: "address" | "page"; title: string };
  find?: { text: string };
  suggestions: { title: string; url: string }[];
  shortcutMod: "Ctrl" | "Cmd";
  nativeWindowControls: boolean;
  /** The window fills the screen through the maximize button: the caption shows Restore instead of Maximize. */
  maximized: boolean;
  windowMode: "tv" | "window";
  uiScale: number;
  overscan: number;
  highContrast: boolean;
  language: "pt-BR" | "en";
  crashReports: boolean;
}

/** A state update that carries only the areas that changed, applied over the snapshot the renderer already has. */
export type ShellStatePatch = Partial<ShellState>;

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
  | { type: "window-mode" }
  | { type: "find"; text: string; backwards?: boolean }
  | { type: "find-close" }
  | { type: "keyboard-open"; target: "address" | "page" }
  | { type: "keyboard-close" }
  /** The D-pad left the tabs and the toolbar: the page takes the focus back. */
  | { type: "focus-page" }
  | { type: "keyboard-insert"; text: string }
  | { type: "keyboard-backspace" }
  | { type: "keyboard-submit" }
  | { type: "address-input"; text: string }
  | { type: "cycle-input-mode" }
  | { type: "media"; action: MediaAction }
  /** The chrome's height on top and, while the controller keyboard is open, the room it takes at the bottom. */
  | { type: "chrome-height"; height: number; bottom?: number }
  /** A modal overlay is open: the shell paints a snapshot of the page and the live view steps aside under it. */
  | { type: "page-cover"; covered: boolean }
  | { type: "ui-settings"; uiScale?: number; overscan?: number; highContrast?: boolean; language?: "pt-BR" | "en"; crashReports?: boolean }
  | { type: "escape" };

export type ControllerEvent =
  | { type: "direction"; direction: "up" | "down" | "left" | "right" }
  | { type: "activate" }
  | { type: "cursor-move"; dx: number; dy: number }
  /** A at the pointer: a left click, or a right click when A was pressed twice in a row. */
  | { type: "cursor-click"; button?: "left" | "right" }
  /** The D-pad took over: the pointer goes away until the stick moves it again. */
  | { type: "cursor-hide" }
  /** The right stick: wheel notches down (positive) and to the right (`sideways`, positive). */
  | { type: "scroll"; notches: number; sideways?: number }
  | { type: "connected"; connected: boolean; family?: "xbox" | "playstation" | "switch" | "generic" };
