import type { BrowserWindow, WebContents } from "electron";
import type { ControllerEvent, ShellCommand, ShellState } from "../../shared/ipc";
import type { InputMode } from "../../shared/settings";
import type { WindowMode } from "../../shared/platform";
import type { History } from "../history";
import type { SettingsStore } from "../store";
import type { Tab, TabManager } from "../tabs";
import type { PermissionQueue } from "./permissions";

/**
 * Everything the command and input routers need from the shell. The shell owns windows, tabs and state; the routers
 * own the translation from a command or a controller event to those operations, so that logic stays out of the
 * window lifecycle code.
 */
export interface ShellHost {
  readonly window: BrowserWindow;
  readonly tabs: TabManager;
  readonly activeWebContents: WebContents | undefined;
  readonly activeTab: Tab | undefined;
  readonly store: SettingsStore;
  readonly history: History;
  readonly permissions: PermissionQueue;

  find: ShellState["find"];
  keyboard: ShellState["keyboard"];
  suggestions: ShellState["suggestions"];
  readonly chromeVisible: boolean;
  readonly inputMode: InputMode;

  status(text: string): void;
  broadcast(): void;
  syncViews(): void;
  setLayout(top: number, bottom: number): void;
  setChromeVisible(visible: boolean): void;
  /** Minimize even from TV mode, where a fullscreen window cannot be minimized as it is (E4-03). */
  minimizeWindow(): void;
  applyWindowMode(mode: WindowMode, persist: boolean): void;
  resolvePermission(allow: boolean, remember: boolean): void;
  toggleFavorite(): void;
  navigate(url: string, allowHttp?: boolean): void;
  searchOrNavigate(text: string): void;
  newTab(isPrivate?: boolean): void;
  openKeyboard(target: "address" | "page"): void;
  closeKeyboard(): void;
  cycleInputMode(): void;
  applyInputMode(mode: InputMode, announce: boolean): void;
  refreshInputMode(): void;
  pageSize(): { width: number; height: number };
  handleController(input: ControllerEvent): Promise<void>;
}

export type Command = ShellCommand;
