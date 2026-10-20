/** Platform decisions that do not need Electron. `platform` is a `process.platform` value. */

export type ShortcutMod = "Ctrl" | "Cmd";
export type WindowMode = "tv" | "window";

export function shortcutModifier(platform: string): ShortcutMod {
  return platform === "darwin" ? "Cmd" : "Ctrl";
}

export function shortcutLabel(platform: string, key: string): string {
  return `${shortcutModifier(platform)}+${key}`;
}

/** macOS keeps the native traffic lights; other platforms draw their own. */
export function usesNativeWindowControls(platform: string): boolean {
  return platform === "darwin";
}

const MAC_DANGEROUS = [".dmg", ".pkg", ".mpkg", ".app", ".command", ".scpt", ".workflow", ".terminal"];
const LINUX_DANGEROUS = [".desktop", ".flatpakref", ".snap"];

/** Installers and launchers the shared list does not already cover. */
export function extraDangerousExtensions(platform: string): readonly string[] {
  if (platform === "darwin") return MAC_DANGEROUS;
  if (platform === "linux") return LINUX_DANGEROUS;
  return [];
}

export type UpdateInstaller = "app" | "flathub";

/**
 * Who installs a newer build. A Flatpak bundle is one unit the host updates along with its sandbox, so the bundled
 * updater must stay out of it; everywhere else electron-updater replaces the app from the GitHub release.
 * `flatpakId` is the `FLATPAK_ID` variable the Flatpak sandbox exports.
 */
export function updateInstaller(platform: string, flatpakId: string | undefined): UpdateInstaller {
  return platform === "linux" && flatpakId ? "flathub" : "app";
}

/** A URL handed to a second instance, if the argv contains one. */
export function urlFromArgv(argv: readonly string[]): string | undefined {
  return argv.find((arg) => /^https?:\/\//i.test(arg) || arg.startsWith("joychromium://"));
}
