import { app, Menu, session } from "electron";
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
import { Pages } from "../shared/pages";
import { effectiveMinimumChromium } from "../shared/policy";
import { dohTemplate, versionAtLeast } from "../shared/security";
import { startupTargets } from "../shared/settings";

/** Oldest Chromium the shell should run on; the remote policy can raise it. */
export const MINIMUM_CHROMIUM = "150.0.0.0";

/** State the end-to-end tests read through `electronApp.evaluate`. */
export interface JoyState {
  adblockReady: boolean;
  userAgent: string;
  wouldBlock: (url: string) => boolean;
  tabs: () => { url: string; title: string; isActive: boolean }[];
  command: (command: unknown) => Promise<void>;
  /** Evaluates JavaScript in the active tab (tests only; tab views are not reachable through Playwright). */
  pageEval: (script: string) => Promise<unknown>;
  dataDir: string;
}

declare global {
  // eslint-disable-next-line no-var
  var joy: JoyState;
}

registerScheme();
Menu.setApplicationMenu(null);

const dataDir = process.env.JOYCHROMIUM_DATA ?? app.getPath("userData");
const distDir = join(__dirname, "..");
const log = new Log(join(dataDir, "logs"));
const store = new SettingsStore(dataDir, (m) => log.warn(m));
const history = new History(join(dataDir, "history.jsonl"), (m) => log.warn(m));
const policy = new PolicyService(dataDir, (m) => log.warn(m));
const adblock = new AdBlock(dataDir, (m) => log.info(m));
const updater = new Updater(log, () => policy.current.blockedAppVersions);

globalThis.joy = {
  adblockReady: false,
  userAgent: "",
  wouldBlock: (url) => adblock.wouldBlock(url),
  tabs: () => [],
  command: async () => undefined,
  pageEval: async () => undefined,
  dataDir,
};

process.on("uncaughtException", (error) => log.error("Uncaught exception", error));
process.on("unhandledRejection", (reason) => log.error("Unhandled rejection", reason));

async function start(): Promise<void> {
  log.rotate();
  log.info(`JoyChromium ${app.getVersion()} starting · Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`);
  const settings = store.load();
  policy.loadCached();
  installProtocolHandler(distDir);

  const minimum = effectiveMinimumChromium(policy.current, MINIMUM_CHROMIUM);
  if (!versionAtLeast(process.versions.chrome, minimum)) log.warn(`Chromium ${process.versions.chrome} is below the minimum ${minimum}`);

  const doh = dohTemplate(settings.dnsOverHttps);
  if (doh) app.configureHostResolver({ secureDnsMode: "secure", secureDnsServers: [doh] });

  session.defaultSession.setUserAgent(ensureTvIdentity(session.defaultSession.getUserAgent()));
  globalThis.joy.userAgent = session.defaultSession.getUserAgent();

  try {
    await adblock.load();
  } catch (error) {
    log.error("Ad blocking unavailable", error);
  }
  globalThis.joy.adblockReady = adblock.isReady;

  const spatialScript = readFileSync(join(distDir, "assets", "spatial.js"), "utf8");
  const shell = new Shell({
    store,
    history,
    policy,
    adblock,
    log,
    distDir,
    spatialScript,
    appVersion: app.getVersion(),
    updateStatus: () => updater.status,
    checkUpdates: async () => {
      await policy.refresh();
      await adblock.refreshLists();
      await updater.check();
    },
    exportDiagnostics: () =>
      exportDiagnostics(join(app.getPath("downloads"), "JoyChromium"), log, store, [
        `JoyChromium ${app.getVersion()} · Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
        `Ad blocking ${adblock.status}`,
        `Policy ${policy.status}`,
        `App update ${updater.status}`,
      ]),
  });
  globalThis.joy.tabs = () => shell.tabs.tabs.map((t) => ({ url: t.url, title: t.title, isActive: t === shell.tabs.active }));
  globalThis.joy.command = (command) => shell.handle(command as never);
  globalThis.joy.pageEval = (script) => shell.activeWebContents?.executeJavaScript(script, true) ?? Promise.resolve(undefined);

  const startUrl = process.env.JOYCHROMIUM_START;
  const targets = startUrl ? [startUrl] : settings.onboardingCompleted ? startupTargets(settings, store.loadSession()) : [Pages.welcome];
  await shell.start(targets);

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

app.whenReady().then(start).catch((error) => {
  log.error("Start failed", error);
  console.error(error);
  app.exit(1);
});

app.on("certificate-error", (event, _wc, url, error, _cert, callback) => {
  // Never offer a bypass: a TV-room browser should not teach anyone to click through certificate warnings.
  event.preventDefault();
  log.warn(`Certificate error for ${url}: ${error}`);
  callback(false);
});

app.on("child-process-gone", (_event, details) => log.warn(`Child process gone: ${details.type} ${details.reason}`));
app.on("window-all-closed", () => app.quit());
