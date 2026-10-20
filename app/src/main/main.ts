import { app, session } from "electron";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AdBlock } from "./adblock";
import { exportDiagnostics } from "./diagnostics";
import { History } from "./history";
import { Log } from "./log";
import { PolicyService } from "./policyService";
import { installProtocolHandler, registerScheme } from "./protocol";
import { Shell } from "./shell";
import { SettingsStore } from "./store";
import { ensureTvIdentity } from "./tvIdentity";
import { Updater } from "./updater";
import { diagnosticsLines } from "../shared/diagnostics";
import { Pages } from "../shared/pages";
import { effectiveMinimumChromium } from "../shared/policy";
import { dohTemplate, versionAtLeast } from "../shared/security";
import { urlFromArgv } from "../shared/platform";
import { startupTargets } from "../shared/settings";
import { installApplicationMenu } from "./platform";
import { CrashReporting } from "./services/crashReporting";
import { watchWidevine } from "./services/widevine";
import { runInPageWorld } from "./controllerActions";
import type { ControllerEvent } from "../shared/ipc";

/** Oldest Chromium the shell should run on; the remote policy can raise it. */
export const MINIMUM_CHROMIUM = "150.0.0.0";

/** State the end-to-end tests read through `electronApp.evaluate`. */
export interface JoyState {
  adblockReady: boolean;
  userAgent: string;
  wouldBlock: (url: string) => boolean;
  tabs: () => { url: string; title: string; isActive: boolean; isLoading: boolean; isPlayingAudio: boolean }[];
  command: (command: unknown) => Promise<void>;
  /** Sends a controller event through the same router a gamepad uses (tests only). */
  controller: (input: ControllerEvent) => Promise<void>;
  /** Evaluates JavaScript in the active tab (tests only; tab views are not reachable through Playwright). */
  pageEval: (script: string) => Promise<unknown>;
  /** Evaluates JavaScript in the injected script's world, where `window.__joy` lives (tests only). */
  spatialEval: (script: string) => Promise<unknown>;
  dataDir: string;
  /** Widevine status from the content-security build, for the diagnostics and the tests. */
  widevine: string;
  /** Where the injected navigation script lives: "object" in its own world, "undefined" in the page's. */
  spatialWorld: () => Promise<{ isolated: string; page: string }>;
  /** Writes the diagnostics zip and returns its path (tests only; the settings page reaches the same function). */
  exportDiagnostics: () => Promise<string>;
}

declare global {
  // eslint-disable-next-line no-var
  var joy: JoyState;
}

registerScheme();
installApplicationMenu();

const dataDir = process.env.JOYCHROMIUM_DATA ?? app.getPath("userData");
app.setPath("userData", dataDir);
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
const distDir = join(__dirname, "..");
const log = new Log(join(dataDir, "logs"));
const store = new SettingsStore(dataDir, (m) => log.warn(m));
const history = new History(join(dataDir, "history.jsonl"), (m) => log.warn(m));
const policy = new PolicyService(dataDir, (m) => log.warn(m));
const adblock = new AdBlock(dataDir, (m) => log.info(m));
const updater = new Updater(log, () => policy.current.blockedAppVersions);
const crashes = new CrashReporting(dataDir, log);

globalThis.joy = {
  adblockReady: false,
  userAgent: "",
  wouldBlock: (url) => adblock.wouldBlock(url),
  tabs: () => [],
  command: async () => undefined,
  controller: async () => undefined,
  pageEval: async () => undefined,
  spatialEval: async () => undefined,
  dataDir,
  widevine: "starting",
  spatialWorld: async () => ({ isolated: "unavailable", page: "unavailable" }),
  exportDiagnostics: async () => "",
};

/** Process start, so the boot time in the diagnostics covers Electron's own start and not just this file. */
const startedAt = Date.now() - process.uptime() * 1000;

process.on("uncaughtException", (error) => log.error("Uncaught exception", error));
process.on("unhandledRejection", (reason) => log.error("Unhandled rejection", reason));

async function start(): Promise<void> {
  log.rotate();
  log.info(`JoyChromium ${app.getVersion()} starting · Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`);
  const settings = store.load();
  policy.loadCached();
  crashes.sync(settings.crashReports);
  installProtocolHandler(distDir);

  const minimum = effectiveMinimumChromium(policy.current, MINIMUM_CHROMIUM);
  if (!versionAtLeast(process.versions.chrome, minimum)) log.warn(`Chromium ${process.versions.chrome} is below the minimum ${minimum}`);

  // The CDM download runs in the background, so this never delays the first window; the value is updated when it lands.
  void watchWidevine(log, (status) => {
    globalThis.joy.widevine = status;
  });

  const doh = dohTemplate(settings.dnsOverHttps);
  if (doh) app.configureHostResolver({ secureDnsMode: "secure", secureDnsServers: [doh] });

  // The Chrome agent without the marker is what a streaming host gets in place of the TV one (shared/streamingUa.ts).
  const desktopUserAgent = session.defaultSession.getUserAgent();
  session.defaultSession.setUserAgent(ensureTvIdentity(desktopUserAgent));
  globalThis.joy.userAgent = session.defaultSession.getUserAgent();

  try {
    await adblock.load();
  } catch (error) {
    log.error("Ad blocking unavailable", error);
  }
  globalThis.joy.adblockReady = adblock.isReady;

  const spatialScript = readFileSync(join(distDir, "assets", "spatial.js"), "utf8");
  /** The bug-report zip: environment, settings, logs, and what the app knows about its own boot, memory and tabs. */
  const exportDiagnosticsReport = (): Promise<string> =>
    exportDiagnostics(join(app.getPath("downloads"), "JoyChromium"), log, store, [
      `JoyChromium ${app.getVersion()} · Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
      `Ad blocking ${adblock.status}`,
      `Policy ${policy.status}`,
      `App update ${updater.status}`,
    ], crashes.files(), diagnosticsLines({
      bootMs,
      processes: app.getAppMetrics().map((process) => ({ type: process.type, memoryKb: process.memory.workingSetSize })),
      tabCount: shellRef?.tabs.tabs.length ?? 0,
    }));

  const shell = new Shell({
    store,
    history,
    policy,
    adblock,
    log,
    distDir,
    spatialScript,
    appVersion: app.getVersion(),
    desktopUserAgent,
    tvUserAgent: globalThis.joy.userAgent,
    updateStatus: () => updater.status,
    checkUpdates: async () => {
      await policy.refresh();
      await adblock.refreshLists();
      await updater.check();
    },
    updateUrl: () => updater.manualUpdate?.url,
    canInstallUpdate: () => updater.canInstallNow,
    installUpdate: () => updater.installPending(),
    openUpdatePage: () => updater.openDownloadPage(),
    exportDiagnostics: exportDiagnosticsReport,
  });
  shellRef = shell;
  globalThis.joy.exportDiagnostics = exportDiagnosticsReport;
  globalThis.joy.tabs = () =>
    shell.tabs.tabs.map((t) => ({ url: t.url, title: t.title, isActive: t === shell.tabs.active, isLoading: t.isLoading, isPlayingAudio: t.isPlayingAudio }));
  globalThis.joy.command = (command) => shell.handle(command as never);
  globalThis.joy.controller = (input) => shell.handleController(input);
  globalThis.joy.pageEval = (script) => shell.activeWebContents?.executeJavaScript(script, true) ?? Promise.resolve(undefined);
  globalThis.joy.spatialEval = (script) => {
    const wc = shell.activeWebContents;
    return wc ? runInPageWorld<unknown>(wc, script) : Promise.resolve(undefined);
  };
  globalThis.joy.spatialWorld = async () => {
    const wc = shell.activeWebContents;
    if (!wc) return { isolated: "no-tab", page: "no-tab" };
    const isolated = await runInPageWorld<string>(wc, "typeof window.__joy");
    const page = await wc.executeJavaScript("typeof window.__joy", true).catch(() => "error");
    return { isolated: isolated ?? "error", page: String(page) };
  };

  // A marker left behind at start means the last run was killed or crashed; its tabs are worth restoring.
  const crashed = store.previousRunCrashed();
  store.markRunning();
  const lastSession = store.loadSession();
  const startUrl = process.env.JOYCHROMIUM_START;
  const targets = startUrl
    ? [startUrl]
    : !settings.onboardingCompleted
      ? [Pages.welcome]
      : crashed && settings.startup !== "Restore" && lastSession.length > 0
        ? lastSession
        : startupTargets(settings, lastSession);
  await shell.start(targets);
  // The first window is shown: the boot time the diagnostics report stops here.
  bootMs = Date.now() - startedAt;
  if (crashed && !startUrl) shell.setStatus("RESTORED AFTER AN UNEXPECTED CLOSE");

  // Background maintenance: remote policy, block lists, app update. Never blocks the UI.
  void (async () => {
    await policy.refresh();
    await updater.check();
    log.info(`Maintenance: policy='${policy.status}' adblock='${adblock.status}' app='${updater.status}'`);
    if (policy.current.message) shell.setStatus(policy.current.message.toUpperCase());
    setInterval(() => void policy.refresh(), 6 * 3_600_000).unref();
    setInterval(() => void updater.check(), 6 * 3_600_000).unref();
    setInterval(() => void adblock.refreshLists(), 24 * 3_600_000).unref();
  })();
}

let shellRef: Shell | undefined;
let bootMs = 0;

app.on("second-instance", (_event, argv) => {
  shellRef?.focusFromSecondInstance(urlFromArgv(argv));
});

if (hasInstanceLock) {
  app.whenReady().then(start).catch((error) => {
    log.error("Start failed", error);
    console.error(error);
    app.exit(1);
  });
}

app.on("certificate-error", (event, _wc, url, error, _cert, callback) => {
  // Never offer a bypass: a TV-room browser should not teach anyone to click through certificate warnings.
  event.preventDefault();
  log.warn(`Certificate error for ${url}: ${error}`);
  callback(false);
});

app.on("child-process-gone", (_event, details) => log.warn(`Child process gone: ${details.type} ${details.reason}`));
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => store.markCleanExit());
