import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { displayUrl, errorPageFor, internalPageFile, isInternal, isWebUrl, Pages } from "../../src/shared/pages";
import {
  buildSearchUrl, defaultSettings, GOOGLE, isHexColor, isValidSearchTemplate, newTabTarget, parseSettings, parseShortcut,
  parseTheme, startupTargets, THEME_PRESETS, toggleFavorite, withInputMode, withoutInputMode, withoutPermissions, withPermission,
} from "../../src/shared/settings";
import {
  allowPopup, dohTemplate, hostOf, isDangerousDownload, isNavigationAllowed, safeFileName, upgradeToHttps, versionAtLeast,
} from "../../src/shared/security";
import { effectiveMinimumChromium, parsePolicy, policyBlocksHost, verifyPolicy } from "../../src/shared/policy";
import { buildSuggestions } from "../../src/shared/suggestion";
import { defaultModeFor, directionOf, nextMode, stickToScroll, stickToVelocity } from "../../src/shared/controllerInput";
import { History } from "../../src/main/history";
import { SettingsStore } from "../../src/main/store";
import { readFileSync } from "node:fs";

describe("pages", () => {
  it("maps internal urls to asset files", () => {
    expect(internalPageFile("joychromium://settings")).toBe("settings.html");
    expect(internalPageFile("joychromium://welcome")).toBe("onboarding.html");
    expect(internalPageFile("joychromium://error/?url=x")).toBe("error.html");
    expect(internalPageFile("https://x.example")).toBeUndefined();
    expect(internalPageFile("joychromium://nope")).toBeUndefined();
  });
  it("classifies urls", () => {
    expect(isInternal(Pages.newtab)).toBe(true);
    expect(isWebUrl("https://x.example")).toBe(true);
    expect(isWebUrl("ftp://x")).toBe(false);
    expect(isWebUrl(undefined)).toBe(false);
    expect(displayUrl("joychromium://settings")).toBe("joychromium://settings");
    expect(errorPageFor("http://a.example", "ERR", true)).toContain("upgraded=1");
  });
});

describe("settings", () => {
  it("validates colors and themes", () => {
    expect(isHexColor("#64DDB5")).toBe(true);
    expect(isHexColor("#12345")).toBe(false);
    expect(parseTheme({ accent: "#123456", background: "nope", surface: "#000000", text: "#FFFFFF" })).toBeUndefined();
    expect(parseTheme(THEME_PRESETS.Light)).toEqual(THEME_PRESETS.Light);
  });
  it("validates search engines", () => {
    expect(buildSearchUrl(GOOGLE, "joy chromium")).toBe("https://www.google.com/search?q=joy%20chromium");
    expect(isValidSearchTemplate("https://x.example/?q=")).toBe(false);
    expect(isValidSearchTemplate("ftp://x/%s")).toBe(false);
    expect(isValidSearchTemplate("https://x.example/s?q=%s")).toBe(true);
  });
  it("has safe defaults and lenient parsing", () => {
    const d = defaultSettings();
    expect(d.searchEngine.name).toBe("Google");
    expect(d.httpsOnly).toBe(true);
    expect(d.passwordAutosave).toBe(false);
    expect(newTabTarget(d)).toBe(Pages.newtab);
    expect(startupTargets(d, [])).toEqual([Pages.newtab]);
    const parsed = parseSettings({ startup: "Restore", homeUrl: "javascript:1", theme: 5, siteInputModes: { "A.example": "Cursor", b: "bad" } });
    expect(parsed.startup).toBe("Restore");
    expect(parsed.homeUrl).toBe(d.homeUrl);
    expect(parsed.theme).toEqual(d.theme);
    expect(parsed.siteInputModes).toEqual({ "a.example": "Cursor" });
    expect(startupTargets(parsed, ["https://a.example", "https://b.example"])).toHaveLength(2);
    expect(startupTargets(parsed, [])).toEqual([Pages.newtab]);
    expect(parseSettings("garbage")).toEqual(d);
  });
  it("tracks favorites, permissions and input modes", () => {
    const fav = toggleFavorite(defaultSettings(), "https://b.example/two", "Two");
    expect(fav.isFavorite).toBe(true);
    expect(fav.settings.favorites).toHaveLength(1);
    expect(toggleFavorite(fav.settings, "https://b.example/two", "Two").settings.favorites).toHaveLength(0);
    const perms = withPermission(withPermission(defaultSettings(), "a.example", "camera", false), "a.example", "microphone", true);
    expect(perms.sitePermissions["a.example"]).toEqual({ camera: false, microphone: true });
    expect(withoutPermissions(perms, "a.example").sitePermissions).toEqual({});
    const modes = withInputMode(defaultSettings(), "a.example", "Cursor");
    expect(modes.siteInputModes["a.example"]).toBe("Cursor");
    expect(withoutInputMode(modes, "a.example").siteInputModes).toEqual({});
    expect(parseShortcut({ name: "Bad", url: "ftp://x" })).toBeUndefined();
    expect(parseShortcut({ name: " ", url: "https://x.example" })).toBeUndefined();
  });
});

describe("security", () => {
  it("allow-lists navigation", () => {
    expect(isNavigationAllowed("https://x.example")).toBe(true);
    expect(isNavigationAllowed("joychromium://settings")).toBe(true);
    expect(isNavigationAllowed("file:///C:/x")).toBe(false);
    expect(isNavigationAllowed("javascript:alert(1)")).toBe(false);
    expect(isNavigationAllowed("chrome://settings")).toBe(false);
  });
  it("upgrades http", () => {
    expect(upgradeToHttps("http://x.example:80/a?b=1")).toBe("https://x.example/a?b=1");
    expect(upgradeToHttps("https://x.example")).toBeUndefined();
    expect(hostOf("https://A.Example/x")).toBe("a.example");
  });
  it("classifies downloads", () => {
    expect(isDangerousDownload("setup.EXE")).toBe(true);
    expect(isDangerousDownload("photo.jpg")).toBe(false);
    expect(isDangerousDownload("x.custom", [".custom"])).toBe(true);
    expect(safeFileName("../../evil.txt")).toBe("evil.txt");
    expect(safeFileName("a<b>.txt")).toBe("a_b_.txt");
    expect(safeFileName("")).toBe("download");
  });
  it("compares versions and limits popups", () => {
    expect(versionAtLeast("152.0.7977.130", "120.0.0.0")).toBe(true);
    expect(versionAtLeast("99.0.1.1", "120")).toBe(false);
    expect(versionAtLeast(undefined, "1")).toBe(false);
    expect(dohTemplate("Off")).toBeUndefined();
    expect(dohTemplate("Quad9")).toContain("quad9");
    const recent: number[] = [];
    expect(allowPopup(recent, 0)).toBe(true);
    expect(allowPopup(recent, 0)).toBe(true);
    expect(allowPopup(recent, 0)).toBe(true);
    expect(allowPopup(recent, 0)).toBe(false);
    expect(allowPopup(recent, 2000)).toBe(true);
  });
});

describe("remote policy", () => {
  const bytes = readFileSync(join(__dirname, "..", "..", "..", "policy", "policy.json"));
  const signature = readFileSync(join(__dirname, "..", "..", "..", "policy", "policy.json.sig"), "utf8");
  it("verifies the shipped policy with the embedded key", () => {
    expect(verifyPolicy(bytes, signature)).toBe(true);
    expect(verifyPolicy(bytes, signature.slice(0, -4) + "AAAA")).toBe(false);
    expect(verifyPolicy(Buffer.concat([bytes, Buffer.from(" ")]), signature)).toBe(false);
  });
  it("parses and merges tighten-only", () => {
    const shipped = parsePolicy(bytes);
    expect(shipped?.version).toBeGreaterThanOrEqual(1);
    const strict = { ...parsePolicy(Buffer.from("{}"))!, minimumChromiumVersion: "999", blockedHosts: ["evil.example"] };
    expect(effectiveMinimumChromium(strict, "120")).toBe("999");
    expect(effectiveMinimumChromium({ ...strict, minimumChromiumVersion: "1" }, "120")).toBe("120");
    expect(policyBlocksHost(strict, "cdn.evil.example")).toBe(true);
    expect(policyBlocksHost(strict, "notevil.example")).toBe(false);
    expect(parsePolicy(Buffer.from("not json"))).toBeUndefined();
  });
});

describe("history and suggestions", () => {
  it("records, dedupes, searches and round-trips", () => {
    const folder = mkdtempSync(join(tmpdir(), "joychromium-test-"));
    try {
      const path = join(folder, "history.jsonl");
      const t0 = new Date("2026-01-01T00:00:00Z");
      const history = new History(path);
      history.record("https://a.example/one", "One", t0);
      history.record("https://a.example/one", "One (updated)", new Date(t0.getTime() + 1000));
      history.record("https://b.example/two", "Two", new Date(t0.getTime() + 2000));
      history.record("joychromium://settings", "Settings", t0);
      expect(history.count).toBe(2);
      expect(history.recent()[0]?.url).toBe("https://b.example/two");
      expect(history.recent()[1]?.title).toBe("One (updated)");
      expect(history.search("ONE")).toHaveLength(1);
      expect(new History(path).count).toBe(2);
      history.remove("https://a.example/one");
      expect(new History(path).count).toBe(1);
      const s = buildSuggestions("two", [{ name: "Two", url: "https://b.example/two" }], history.recent());
      expect(s).toHaveLength(1);
      expect(s[0]?.kind).toBe("favorite");
      expect(buildSuggestions("", [], history.recent())).toHaveLength(0);
      expect(buildSuggestions("joychromium://settings", [], history.recent())).toHaveLength(0);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
  it("settings store round-trips and survives garbage", () => {
    const folder = mkdtempSync(join(tmpdir(), "joychromium-test-"));
    try {
      const store = new SettingsStore(folder);
      expect(store.load().onboardingCompleted).toBe(false);
      store.update((s) => ({ ...s, onboardingCompleted: true }));
      expect(new SettingsStore(folder).load().onboardingCompleted).toBe(true);
      store.saveSession(["https://a.example", "javascript:1", Pages.newtab]);
      expect(store.loadSession()).toEqual(["https://a.example", Pages.newtab]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe("controller input", () => {
  it("knows tv sites and cycles modes", () => {
    expect(defaultModeFor("www.youtube.com")).toBe("Arrows");
    expect(defaultModeFor("notyoutube.com")).toBe("Spatial");
    expect(defaultModeFor(undefined, "Cursor")).toBe("Cursor");
    expect(nextMode("Arrows")).toBe("Spatial");
  });
  it("maps sticks", () => {
    expect(stickToVelocity(0.1, -0.1)).toEqual({ dx: 0, dy: 0 });
    expect(stickToVelocity(1, 0).dx).toBeCloseTo(22, 1);
    expect(stickToVelocity(0.5, 0).dx).toBeLessThan(stickToVelocity(1, 0).dx);
    expect(stickToScroll(0.1)).toBe(0);
    expect(stickToScroll(-0.9)).toBe(-1);
    expect(directionOf({ up: false, down: false, left: false, right: false }, 0, 0.9)).toBe("down");
    expect(directionOf({ up: true, down: false, left: false, right: false }, 0, 0)).toBe("up");
    expect(directionOf({ up: false, down: false, left: false, right: false }, 0, 0)).toBeUndefined();
  });
});
