import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { commandForShortcut, type ShortcutInput } from "../../src/shared/shortcuts";
import { decideDownload, downloadStatus, nextAvailablePath } from "../../src/main/services/downloads";
import { tabViewBounds } from "../../src/main/services/layout";
import { describePermission, PermissionQueue } from "../../src/main/services/permissions";
import { isShellCommand } from "../../src/shared/commands";
import { migrateSettings, parseSettings, SETTINGS_SCHEMA_VERSION } from "../../src/shared/settings";
import { SettingsStore } from "../../src/main/store";
import { versionFromUpdateYml } from "../../src/main/updater";

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
    expect(commandForShortcut(key("t"), "h", "f")).toBeUndefined();
    expect(commandForShortcut({ ...key("t", { control: true }), type: "keyUp" }, "h", "f")).toBeUndefined();
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
