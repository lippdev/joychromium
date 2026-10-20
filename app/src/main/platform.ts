import { app, Menu, type BrowserWindowConstructorOptions } from "electron";
import { join } from "node:path";
import { extraDangerousExtensions, shortcutModifier, usesNativeWindowControls, type ShortcutMod } from "../shared/platform";

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

export function downloadsFolder(): string {
  return join(app.getPath("downloads"), "JoyChromium");
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
