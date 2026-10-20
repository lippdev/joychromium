import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { commandForShortcut, type ShortcutInput } from "../../src/shared/shortcuts";
import { activateIntent, mediaActionForKey, mediaCommandForKey } from "../../src/shared/media";
import { decideDownload, downloadStatus, nextAvailablePath } from "../../src/main/services/downloads";
import { tabViewBounds } from "../../src/main/services/layout";
import { describePermission, PermissionQueue } from "../../src/main/services/permissions";
import { isShellCommand } from "../../src/shared/commands";
import { migrateSettings, parseSettings, SETTINGS_SCHEMA_VERSION } from "../../src/shared/settings";
import { SettingsStore } from "../../src/main/store";
import { updateDownloadedNotice, updateInstallRoute, versionFromUpdateYml } from "../../src/main/updater";

const key = (k: string, extra: Partial<ShortcutInput> = {}): ShortcutInput => ({
  type: "keyDown", key: k, control: false, meta: false, shift: false, ...extra,
});

describe("keyboard shortcuts", () => {
  it("maps the browser keys with the platform modifier", () => {
    expect(commandForShortcut(key("t", { control: true }), "h", "f")).toEqual({ type: "new-tab" });
    expect(commandForShortcut(key("T", { meta: true }), "h", "f")).toEqual({ type: "new-tab" });
    expect(commandForShortcut(key("t", { control: true, shift: true }), "h", "f")).toEqual({ type: "reopen-tab" });
    expect(commandForShortcut(key("n", { control: true, shift: true }), "h", "f")).toEqual({ type: "new-tab", isPrivate: true });
    expect(commandForShortcut(key("w", { control: true }), "h", "f")).toEqual({ type: "close-tab" });
    expect(commandForShortcut(key("Tab", { control: true, shift: true }), "h", "f")).toEqual({ type: "switch-tab", offset: -1 });
    expect(commandForShortcut(key(",", { control: true }), "h", "f")).toEqual({ type: "settings" });
    expect(commandForShortcut(key("=", { control: true }), "h", "f")).toEqual({ type: "zoom", delta: 0.1 });
    expect(commandForShortcut(key("0", { control: true }), "h", "f")).toEqual({ type: "zoom", delta: 0 });
    expect(commandForShortcut(key("h", { control: true }), "joychromium://history", "f")).toEqual({ type: "navigate", url: "joychromium://history" });
  });
  it("keeps the plain keys and refuses unmodified letters", () => {
    expect(commandForShortcut(key("Escape"), "h", "f")).toEqual({ type: "escape" });
    expect(commandForShortcut(key("F11"), "h", "f")).toEqual({ type: "window-mode" });
    expect(commandForShortcut(key("MediaPlayPause"), "h", "f")).toEqual({ type: "media", action: "toggle" });
    expect(commandForShortcut(key("MediaTrackNext"), "h", "f")).toEqual({ type: "media", action: "next" });
    expect(commandForShortcut(key("MediaTrackPrevious"), "h", "f")).toEqual({ type: "media", action: "previous" });
    expect(commandForShortcut(key("t"), "h", "f")).toBeUndefined();
    expect(commandForShortcut({ ...key("t", { control: true }), type: "keyUp" }, "h", "f")).toBeUndefined();
  });
});

describe("media", () => {
  it("maps the keys Chromium reports for the media keys", () => {
    expect(mediaActionForKey("MediaPlayPause")).toBe("toggle");
    expect(mediaActionForKey("Play")).toBe("toggle");
    expect(mediaActionForKey("pause")).toBe("toggle");
    // Chromium reports the UI Events names; the VK-style ones stay accepted.
    expect(mediaActionForKey("MediaTrackNext")).toBe("next");
    expect(mediaActionForKey("MediaNextTrack")).toBe("next");
    expect(mediaActionForKey("MediaTrackPrevious")).toBe("previous");
    expect(mediaActionForKey("MediaPreviousTrack")).toBe("previous");
    expect(mediaActionForKey("Enter")).toBeUndefined();
    expect(mediaCommandForKey("MediaTrackNext")).toEqual({ type: "media", action: "next" });
    expect(mediaCommandForKey("Enter")).toBeUndefined();
    expect(isShellCommand({ type: "media", action: "next" })).toBe(true);
    expect(isShellCommand({ type: "media", action: "stop" })).toBe(false);
  });
  it("only turns the A button into play/pause on an explicit media decision", () => {
    expect(activateIntent("media")).toBe("media");
    expect(activateIntent("focus")).toBe("focus");
    expect(activateIntent(undefined)).toBe("focus");
    expect(activateIntent(true)).toBe("focus");
  });
});

describe("downloads", () => {
  const folder = join(sep, "downloads");
  const policy = { folder, blockDangerous: true, extraDangerous: [".dmg"] };
  it("never overwrites an existing file", () => {
    const taken = new Set([join(folder, "a.zip"), join(folder, "a (1).zip")]);
    expect(nextAvailablePath(folder, "a.zip", (p) => taken.has(p))).toBe(join(folder, "a (2).zip"));
    expect(nextAvailablePath(folder, "../../etc/passwd", () => false)).toBe(join(folder, "passwd"));
  });
  it("refuses installers, including the platform-specific ones", () => {
    expect(decideDownload("setup.exe", policy, () => false).action).toBe("block");
    expect(decideDownload("App.dmg", policy, () => false).action).toBe("block");
    expect(decideDownload("photo.jpg", policy, () => false)).toEqual({ action: "allow", path: join(folder, "photo.jpg") });
    expect(decideDownload("setup.exe", { ...policy, blockDangerous: false }, () => false).action).toBe("allow");
  });
  it("describes progress", () => {
    expect(downloadStatus("a.zip", 50, 200)).toBe("DOWNLOADING · a.zip · 25%");
    expect(downloadStatus("a.zip", 1, 0)).toBe("DOWNLOADING · a.zip");
  });
});

describe("window layout", () => {
  it("puts the tab views under the chrome", () => {
    expect(tabViewBounds({ width: 1920, height: 1080 }, { top: 90, bottom: 26 }, true)).toEqual({ x: 0, y: 90, width: 1920, height: 964 });
    expect(tabViewBounds({ width: 1920, height: 1080 }, { top: 90, bottom: 26 }, false)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(tabViewBounds({ width: 0, height: 0 }, { top: 90, bottom: 26 }, true).height).toBe(0);
  });
});

describe("permission prompts", () => {
  it("shows one prompt at a time", async () => {
    const queue = new PermissionQueue();
    const first = queue.ask({ host: "a.example", kind: "media", description: describePermission("media") });
    expect(first).toBeDefined();
    expect(queue.ask({ host: "b.example", kind: "geolocation", description: "x" })).toBeUndefined();
    expect(queue.prompt?.host).toBe("a.example");
    expect(queue.settle(false)?.host).toBe("a.example");
    expect(await first).toBe(false);
    expect(queue.settle(true)).toBeUndefined();
    expect(describePermission("media")).toBe("your camera or microphone");
    expect(describePermission("something-new")).toBe("something-new");
  });
});

describe("command validation", () => {
  it("accepts the commands the renderer sends", () => {
    expect(isShellCommand({ type: "new-tab" })).toBe(true);
    expect(isShellCommand({ type: "close-tab" })).toBe(true);
    expect(isShellCommand({ type: "close-tab", id: 3 })).toBe(true);
    expect(isShellCommand({ type: "navigate", url: "https://a.example" })).toBe(true);
    expect(isShellCommand({ type: "permission", allow: true, remember: false })).toBe(true);
    expect(isShellCommand({ type: "window", action: "close" })).toBe(true);
    expect(isShellCommand({ type: "keyboard-open", target: "page" })).toBe(true);
  });
  it("refuses anything malformed", () => {
    expect(isShellCommand(undefined)).toBe(false);
    expect(isShellCommand("navigate")).toBe(false);
    expect(isShellCommand({ type: "nope" })).toBe(false);
    expect(isShellCommand({ type: "navigate" })).toBe(false);
    expect(isShellCommand({ type: "navigate", url: "https://a.example", allowHttp: "yes" })).toBe(false);
    expect(isShellCommand({ type: "close-tab", id: "3" })).toBe(false);
    expect(isShellCommand({ type: "window", action: "explode" })).toBe(false);
    expect(isShellCommand({ type: "permission", allow: true })).toBe(false);
  });
});

describe("settings store", () => {
  const temp = () => mkdtempSync(join(tmpdir(), "joy-store-"));

  it("migrates an old file and drops the settings that no longer exist", () => {
    const migrated = migrateSettings({ passwordAutosave: true, autofill: true, httpsOnly: false }) as Record<string, unknown>;
    expect(migrated.passwordAutosave).toBeUndefined();
    expect(migrated.autofill).toBeUndefined();
    expect(migrated.httpsOnly).toBe(false);
    expect(migrated.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    const parsed = parseSettings({ passwordAutosave: true, windowMode: "nope" });
    expect(parsed).not.toHaveProperty("passwordAutosave");
    expect(parsed.windowMode).toBe("tv");
  });

  it("writes atomically and keeps the previous file as a backup", () => {
    const dir = temp();
    try {
      const log: string[] = [];
      const store = new SettingsStore(dir, (m) => log.push(m));
      store.load();
      store.update((s) => ({ ...s, homeUrl: "https://one.example" }));
      store.update((s) => ({ ...s, homeUrl: "https://two.example" }));
      expect(JSON.parse(readFileSync(store.settingsPath, "utf8")).homeUrl).toBe("https://two.example");
      expect(JSON.parse(readFileSync(store.backupPath, "utf8")).homeUrl).toBe("https://one.example");
      expect(JSON.parse(readFileSync(store.settingsPath, "utf8")).schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to the defaults when the file is corrupt", () => {
    const dir = temp();
    try {
      const log: string[] = [];
      writeFileSync(join(dir, "settings.json"), "{ this is not json");
      const store = new SettingsStore(dir, (m) => log.push(m));
      const settings = store.load();
      expect(settings.homeUrl).toBeTruthy();
      expect(log.join()).toContain("Could not read");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("tracks an unclean shutdown", () => {
    const dir = temp();
    try {
      const store = new SettingsStore(dir, () => {});
      expect(store.previousRunCrashed()).toBe(false);
      store.markRunning();
      expect(new SettingsStore(dir, () => {}).previousRunCrashed()).toBe(true);
      store.markCleanExit();
      expect(store.previousRunCrashed()).toBe(false);
      store.saveSession(["https://a.example", "joychromium://newtab", "file:///nope"]);
      expect(store.loadSession()).toEqual(["https://a.example", "joychromium://newtab"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("update metadata", () => {
  it("reads the version electron-builder publishes", () => {
    expect(versionFromUpdateYml("version: 1.2.3\nfiles:\n  - url: x")).toBe("1.2.3");
    expect(versionFromUpdateYml("no version here")).toBeUndefined();
  });
});

describe("controller glyphs", () => {
  it("recognises the common controllers", async () => {
    const { controllerFamily, buttonGlyphs } = await import("../../src/shared/controllerGlyphs");
    expect(controllerFamily("Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)")).toBe("xbox");
    expect(controllerFamily("DualSense Wireless Controller")).toBe("playstation");
    expect(controllerFamily("Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)")).toBe("switch");
    expect(controllerFamily("8BitDo Pro 2")).toBe("generic");
    expect(controllerFamily(undefined)).toBe("generic");
    expect(buttonGlyphs("playstation")).toEqual({ select: "✕", back: "○", reload: "□", keyboard: "△" });
    expect(buttonGlyphs("xbox").select).toBe("A");
  });
});

describe("translations", () => {
  it("falls back to English and covers both languages", async () => {
    const { t, dictionary } = await import("../../src/shared/i18n");
    expect(t("pt-BR", "nav.back")).toBe("Voltar");
    expect(t("en", "nav.back")).toBe("Back");
    expect(t("pt-BR", "menu.title")).toBe("Menu rápido");
    expect(dictionary("en")["settings.title"]).toBe("Settings");
    expect(dictionary("pt-BR")["settings.title"]).toBe("Configurações");
    expect(dictionary("en")["design.title"]).toBe("Design system");
    expect(dictionary("pt-BR")["design.name.button"]).toBe("Botão");
    expect(t("en", "no.such.key")).toBe("no.such.key");
  });
});

describe("widevine component status", () => {
  it("reads the version out of the component registry", async () => {
    const { widevineVersion } = await import("../../src/main/services/widevine");
    expect(widevineVersion({ oimompecagnajdejgnnjijobebaeigek: { status: "updated", title: "Widevine Content Decryption Module", version: "4.10.3112.0" } })).toBe("4.10.3112.0");
    expect(widevineVersion({})).toBeUndefined();
    expect(widevineVersion({ other: { status: "updated", version: "1.0" } })).toBeUndefined();
  });
});

describe("update notice", () => {
  it("asks for a restart where the package manager installs, and promises an install on quit elsewhere", () => {
    expect(updateDownloadedNotice("1.4.0", true)).toBe("v1.4.0 downloaded; restart to install (asks for your password)");
    expect(updateDownloadedNotice("1.4.0", false)).toBe("v1.4.0 downloaded; installs when you close JoyChromium");
  });

  it("only hands a downloaded package to the package manager", () => {
    expect(updateInstallRoute(true, true)).toBe("package-manager");
    expect(updateInstallRoute(true, false)).toBe("release-page");
    expect(updateInstallRoute(false, true)).toBe("release-page");
    expect(updateInstallRoute(false, false)).toBe("release-page");
  });
});

describe("release notes", () => {
  it("groups the commits by type, breaking changes first, and hides dependency bumps", async () => {
    const { groupCommits } = await import("../../scripts/release-notes.mjs");
    const notes = groupCommits(
      [
        "feat(build): arm64 installers for Windows and Linux",
        "fix(tabs): queue navigations so the newest one wins",
        "feat(api)!: drop the old IPC channel",
        "chore(deps): bump electron from 44.5.1 to 44.8.0",
        "Merge pull request #46 from docs",
        "a commit without the convention",
        "docs: the release, the signing key and the TV checklist",
      ],
      { previousTag: "v1.2.0", version: "1.3.0" },
    );
    expect(notes).toContain("## JoyChromium 1.3.0");
    expect(notes).toContain("Mudanças desde `v1.2.0`");
    expect(notes.indexOf("### Mudanças que quebram")).toBeLessThan(notes.indexOf("### Novidades"));
    expect(notes).toContain("- **build**: arm64 installers for Windows and Linux");
    expect(notes).toContain("### Correções\n\n- **tabs**: queue navigations so the newest one wins");
    expect(notes).toContain("### Outros\n\n- a commit without the convention");
    expect(notes).not.toContain("bump electron");
    expect(notes).not.toContain("Merge pull request");
    expect(notes).toContain("docs/INSTALL.md");
  });
});
