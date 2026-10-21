import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { displayUrl, errorPageFor, internalPageFile, isDevOnlyFile, isInternal, isWebUrl, Pages } from "../../src/shared/pages";
import {
  buildSearchUrl, defaultSettings, GOOGLE, isHexColor, isValidSearchTemplate, migrateSettings, newTabTarget, parseSettings,
  parseShortcut, parseTheme, SETTINGS_SCHEMA_VERSION, startupTargets, THEME_PRESETS, toggleFavorite, withInputMode,
  withoutInputMode, withoutPermissions, withPermission,
} from "../../src/shared/settings";
import { hapticTimeline, isBlockedStatus } from "../../src/shared/haptics";
import {
  allowPopup, dohTemplate, hostOf, isDangerousDownload, isNavigationAllowed, isThirdPartyRequest, safeFileName,
  trackingPolicy, upgradeToHttps, versionAtLeast,
} from "../../src/shared/security";
import { effectiveMinimumChromium, parsePolicy, policyBlocksHost, verifyPolicy } from "../../src/shared/policy";
import { TRACKER_LISTS, trackerGroupsFor, trackerListsFor } from "../../src/shared/trackerLists";
import { buildSuggestions } from "../../src/shared/suggestion";
import { defaultModeFor, directionOf, nextMode, stickToScroll, stickToVelocity } from "../../src/shared/controllerInput";
import { activePad, padInUse, padsInUse, startedUsing, type PadSample } from "../../src/shared/controllerSelection";
import {
  extraDangerousExtensions, shortcutLabel, shortcutModifier, updateInstaller, urlFromArgv, usesNativeWindowControls,
} from "../../src/shared/platform";
import { diagnosticsLines, formatBootLine, formatMemoryLines, formatTabsLine } from "../../src/shared/diagnostics";
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
  it("keeps the design catalog out of packaged builds", () => {
    expect(internalPageFile("joychromium://design")).toBe("design.html");
    expect(internalPageFile("joychromium://design", true)).toBe("design.html");
    expect(internalPageFile("joychromium://design", false)).toBeUndefined();
    expect(internalPageFile("joychromium://settings", false)).toBe("settings.html");
    expect(isDevOnlyFile("/design.html")).toBe(true);
    expect(isDevOnlyFile("C:\\dist\\assets\\design.html")).toBe(true);
    expect(isDevOnlyFile("/settings.html")).toBe(false);
    expect(isDevOnlyFile("/design/tokens.css")).toBe(false);
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
  it("moves saved green themes to the blue brand and keeps the rest", () => {
    const mint = { accent: "#64ddb5", background: "#0C0E13", surface: "#14171E", text: "#F3F5F9" };
    expect(parseSettings({ theme: mint }).theme).toEqual(THEME_PRESETS.Joy);
    expect(parseSettings({ theme: { accent: "#0F7B6C", background: "#F4F6FA", surface: "#FFFFFF", text: "#111418" } }).theme).toEqual(THEME_PRESETS.Light);
    expect(parseSettings({ theme: THEME_PRESETS.Ember }).theme).toEqual(THEME_PRESETS.Ember);
    expect(defaultSettings().theme.accent).toBe("#2B95FF");
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
    expect(d.windowMode).toBe("tv");
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
  it("parses the per-site streaming agent and migrates an older file", () => {
    expect(defaultSettings().streamingDesktopUa).toBe(false);
    expect(parseSettings({ schemaVersion: 2, httpsOnly: false }).streamingDesktopUa).toBe(false);
    expect(parseSettings({ streamingDesktopUa: true }).streamingDesktopUa).toBe(true);
    expect(parseSettings({ streamingDesktopUa: "yes" }).streamingDesktopUa).toBe(false);
    expect(migrateSettings({ schemaVersion: 2, httpsOnly: false })).toMatchObject({ schemaVersion: SETTINGS_SCHEMA_VERSION, httpsOnly: false });
  });
  it("keeps vibration off unless the user asks for it", () => {
    expect(defaultSettings().vibration).toBe(false);
    expect(parseSettings({ vibration: true }).vibration).toBe(true);
    expect(parseSettings({ vibration: "yes" }).vibration).toBe(false);
    // A file written before the preference existed gets the switch written as off.
    expect((migrateSettings({ schemaVersion: 3 }) as Record<string, unknown>).vibration).toBe(false);
    expect((migrateSettings({ schemaVersion: 3, vibration: true }) as Record<string, unknown>).vibration).toBe(true);
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

describe("haptics", () => {
  it("taps once to confirm and twice, harder, to report a block", () => {
    const [confirm] = hapticTimeline("confirm");
    const error = hapticTimeline("error");
    expect(hapticTimeline("confirm")).toHaveLength(1);
    expect(error).toHaveLength(2);
    expect(confirm.at).toBe(0);
    for (const pulse of [confirm, ...error]) {
      expect(pulse.strongMagnitude).toBeGreaterThan(0);
      expect(pulse.weakMagnitude).toBeGreaterThan(0);
      expect(pulse.strongMagnitude).toBeLessThanOrEqual(1);
      expect(pulse.weakMagnitude).toBeLessThanOrEqual(1);
      expect(pulse.duration).toBeGreaterThanOrEqual(20);
    }
    expect(confirm.duration).toBeLessThan(error[0].duration);
    expect(error[0].strongMagnitude).toBeGreaterThan(confirm.strongMagnitude);
    // The second tap starts only after the first ends, and the whole error cue stays short.
    expect(error[1].at).toBeGreaterThanOrEqual(error[0].at + error[0].duration);
    expect(error[1].at + error[1].duration).toBeLessThan(400);
  });
  it("recognises the statuses that mean something was refused", () => {
    for (const status of ["BLOCKED · UNSUPPORTED ADDRESS", "BLOCKED BY POLICY · a.example", "DOWNLOAD BLOCKED · a.exe", "POPUP BLOCKED"]) {
      expect(isBlockedStatus(status)).toBe(true);
    }
    for (const status of ["DOWNLOADED · a.mp4", "ADDED TO FAVORITES", "INPUT · CURSOR", ""]) expect(isBlockedStatus(status)).toBe(false);
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
      // The star is decoration, drawn by the chip; a reader that read it would say "star Two".
      expect(s[0]?.title).toBe("Two");
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

describe("controller selection", () => {
  const pad = (index: number, standard = true, pressed = false, axis = 0): PadSample => ({
    index, standard,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed && i === 0 })),
    axes: [axis, 0, 0, 0],
  });

  it("counts a held button or a pushed stick as use", () => {
    expect(padInUse(pad(0))).toBe(false);
    expect(padInUse(pad(0, true, true))).toBe(true);
    expect(padInUse(pad(0, true, false, 0.2))).toBe(false);
    expect(padInUse(pad(0, true, false, -0.9))).toBe(true);
    expect(padsInUse([pad(0), pad(1, true, true), pad(2, true, false, 0.8)])).toEqual([1, 2]);
  });

  it("only counts a pad that starts being used", () => {
    expect(startedUsing([], [0])).toEqual([0]);
    expect(startedUsing([0], [0, 1])).toEqual([1]);
    expect(startedUsing([0, 1], [1])).toEqual([]);
  });

  it("keeps the pad in hand and hands over to the next one used", () => {
    const pads = [pad(0), pad(1)];
    expect(activePad(null, [], [])).toBeNull();
    expect(activePad(null, pads, [])).toBe(0);
    expect(activePad(1, pads, [])).toBe(1);
    expect(activePad(0, pads, [1])).toBe(1);
    expect(activePad(1, pads, [1])).toBe(1);
    // A finger resting on a button of the other pad keeps it there: only a new press moves the input.
    expect(activePad(1, pads, [])).toBe(1);
    expect(activePad(1, pads, [0, 1])).toBe(1);
  });

  it("falls back to a standard mapping and survives a disconnect", () => {
    const odd = [pad(3, false), pad(4, true)];
    expect(activePad(null, odd, [])).toBe(4);
    expect(activePad(null, [pad(3, false), pad(5, false)], [])).toBe(3);
    expect(activePad(9, odd, [])).toBe(4);
  });
});

describe("platform", () => {
  it("uses Cmd on macOS and Ctrl elsewhere", () => {
    expect(shortcutModifier("darwin")).toBe("Cmd");
    expect(shortcutModifier("win32")).toBe("Ctrl");
    expect(shortcutModifier("linux")).toBe("Ctrl");
    expect(shortcutLabel("darwin", "D")).toBe("Cmd+D");
    expect(shortcutLabel("linux", "D")).toBe("Ctrl+D");
  });
  it("keeps native window controls only on macOS", () => {
    expect(usesNativeWindowControls("darwin")).toBe(true);
    expect(usesNativeWindowControls("win32")).toBe(false);
    expect(usesNativeWindowControls("linux")).toBe(false);
  });
  it("adds the installers each system actually uses", () => {
    expect(extraDangerousExtensions("darwin")).toContain(".dmg");
    expect(extraDangerousExtensions("darwin")).toContain(".app");
    expect(extraDangerousExtensions("linux")).toContain(".desktop");
    expect(extraDangerousExtensions("win32")).toEqual([]);
  });
  it("finds a URL handed to a second instance", () => {
    expect(urlFromArgv(["/app/joychromium", "https://a.example/x"])).toBe("https://a.example/x");
    expect(urlFromArgv(["--flag"])).toBeUndefined();
  });
  it("leaves updates to the host inside the Flatpak sandbox", () => {
    expect(updateInstaller("linux", "dev.lipp.joychromium")).toBe("flathub");
    expect(updateInstaller("linux", undefined)).toBe("app");
    expect(updateInstaller("darwin", "dev.lipp.joychromium")).toBe("app");
    expect(updateInstaller("win32", undefined)).toBe("app");
  });
});

describe("tracking prevention", () => {
  it("maps levels to a policy", () => {
    expect(trackingPolicy("Basic")).toEqual({ sendGpc: false, blockThirdPartyCookies: false });
    expect(trackingPolicy("Balanced")).toEqual({ sendGpc: true, blockThirdPartyCookies: false });
    expect(trackingPolicy("Strict")).toEqual({ sendGpc: true, blockThirdPartyCookies: true });
  });
  it("recognises third-party requests", () => {
    expect(isThirdPartyRequest("https://ads.example/x", "https://news.example/")).toBe(true);
    expect(isThirdPartyRequest("https://news.example/x", "https://news.example/")).toBe(false);
    expect(isThirdPartyRequest("https://cdn.news.example/x", "https://news.example/")).toBe(false);
    expect(isThirdPartyRequest("https://ads.example/x", undefined)).toBe(false);
  });
  it("feeds a different list set to each level", () => {
    // Every level is a strict superset of the one below it: Basic blocks ads, Balanced adds the tracking
    // lists and Strict adds the social-widget list on top.
    expect(trackerGroupsFor("Basic")).toEqual(["ads"]);
    expect(trackerGroupsFor("Balanced")).toEqual(["ads", "tracking"]);
    expect(trackerGroupsFor("Strict")).toEqual(["ads", "tracking", "social"]);
    const basic = new Set(trackerListsFor("Basic"));
    const balanced = new Set(trackerListsFor("Balanced"));
    const strict = new Set(trackerListsFor("Strict"));
    expect(basic.size).toBe(TRACKER_LISTS.ads.length);
    expect([...basic].every((url) => balanced.has(url))).toBe(true);
    expect([...balanced].every((url) => strict.has(url))).toBe(true);
    expect(balanced.size).toBeGreaterThan(basic.size);
    expect(strict.size).toBeGreaterThan(balanced.size);
    expect(new Set(trackerListsFor("Strict")).size).toBe(trackerListsFor("Strict").length);
  });
  it("keeps each level on Ghostery's own list assets", () => {
    const assets = "https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets";
    for (const level of ["Basic", "Balanced", "Strict"] as const) {
      for (const url of trackerListsFor(level)) expect(url.startsWith(`${assets}/`)).toBe(true);
    }
    expect(trackerListsFor("Basic")).toContain(`${assets}/easylist/easylist.txt`);
    expect(trackerListsFor("Basic")).not.toContain(`${assets}/easylist/easyprivacy.txt`);
    expect(trackerListsFor("Balanced")).toContain(`${assets}/easylist/easyprivacy.txt`);
    expect(trackerListsFor("Strict")).toContain(`${assets}/easylist/easyprivacy.txt`);
    expect(trackerListsFor("Strict")).toContain(`${assets}/fanboy/annoyance.txt`);
  });
});

describe("diagnostics", () => {
  it("formats the boot time in whole milliseconds and never below zero", () => {
    expect(formatBootLine(1234)).toBe("Boot to first window: 1234 ms");
    expect(formatBootLine(1234.6)).toBe("Boot to first window: 1235 ms");
    expect(formatBootLine(-5)).toBe("Boot to first window: 0 ms");
  });
  it("sums the working set and lists every process", () => {
    expect(formatMemoryLines([
      { type: "Browser", memoryKb: 1024 * 100 },
      { type: "Tab", memoryKb: 1024 * 50 },
      { type: "Tab", memoryKb: 512 },
    ])).toEqual([
      "Memory working set: 150.5 MiB in 3 processes",
      "  Browser: 100.0 MiB",
      "  Tab: 50.0 MiB",
      "  Tab: 0.5 MiB",
    ]);
  });
  it("says process in the singular and counts no fractional tabs", () => {
    expect(formatMemoryLines([{ type: "Browser", memoryKb: 1024 }])[0]).toBe("Memory working set: 1.0 MiB in 1 process");
    expect(formatTabsLine(3)).toBe("Tabs: 3");
    expect(formatTabsLine(-1)).toBe("Tabs: 0");
    expect(formatTabsLine(2.7)).toBe("Tabs: 2");
  });
  it("writes one diagnostics.txt line per fact", () => {
    expect(diagnosticsLines({ bootMs: 800, processes: [{ type: "Browser", memoryKb: 1024 }], tabCount: 2 })).toEqual([
      "Boot to first window: 800 ms",
      "Memory working set: 1.0 MiB in 1 process",
      "  Browser: 1.0 MiB",
      "Tabs: 2",
    ]);
  });
});
