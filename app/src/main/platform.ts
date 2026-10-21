import { app, Menu, type BrowserWindowConstructorOptions } from "electron";
import { join } from "node:path";
import {
  extraDangerousExtensions, shortcutModifier, updateInstaller, usesNativeWindowControls, type ShortcutMod, type UpdateInstaller,
} from "../shared/platform";

/** The only module that reads `process.platform`. */
export function platformId(): string {
  return process.platform;
}

export function currentShortcutMod(): ShortcutMod {
  return shortcutModifier(platformId());
}

export function nativeWindowControls(): boolean {
  return usesNativeWindowControls(platformId());
}

export function platformDangerousExtensions(): readonly string[] {
  return extraDangerousExtensions(platformId());
}

/** deb and rpm are installed by the system package manager; the AppImage replaces itself. */
export function installsUpdatesWithPackageManager(): boolean {
  return platformId() === "linux" && !process.env.APPIMAGE;
}

/** Who installs updates here: the Flatpak sandbox is updated by the host, the other installs by electron-updater. */
export function currentUpdateInstaller(): UpdateInstaller {
  return updateInstaller(platformId(), process.env.FLATPAK_ID);
}

export function downloadsFolder(): string {
  return join(app.getPath("downloads"), "JoyChromium");
}

/**
 * Right-click on the taskbar icon or the Start menu entry on Windows: one click to a new tab or to the mode a launcher
 * would ask for, through the same command-line flags (see shared/launchArgs.ts).
 */
export function installJumpList(labels: { newTab: string; tv: string; window: string }): void {
  if (platformId() !== "win32") return;
  const task = (title: string, args: string) => ({
    program: process.execPath, arguments: args, title, description: title, iconPath: process.execPath, iconIndex: 0,
  });
  app.setUserTasks([task(labels.newTab, "--new-tab"), task(labels.tv, "--tv"), task(labels.window, "--window")]);
}

/** Edit roles are what make Cmd+C/V/X/A and Cmd+Q work on macOS. Other platforms have no app menu. */
export function installApplicationMenu(): void {
  if (platformId() !== "darwin") {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: "appMenu" },
      { role: "editMenu" },
      { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }] },
    ]),
  );
}

export function browserWindowOptions(background: string, preload: string): BrowserWindowConstructorOptions {
  const native = nativeWindowControls();
  return {
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    ...(native ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 14, y: 14 } } : {}),
    backgroundColor: background,
    title: "JoyChromium",
    show: false,
    webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false },
  };
}
