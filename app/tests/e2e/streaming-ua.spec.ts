import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The per-site user agent, end to end and without the network: an https handler answers every probe URL, so the tab
// gets a real origin (and therefore a real navigator.userAgent) for hosts this machine cannot reach.
const PROBE_PAGE = "<!doctype html><meta charset=\"utf-8\"><title>UA probe</title><p id=\"probe\">UA probe</p>";
const TV_MARKER = "JoyChromiumTV/1.0 (TV; SmartTV)";

let data: string;
let app: ElectronApplication;

async function launch(settings: Record<string, unknown>): Promise<void> {
  data = mkdtempSync(join(tmpdir(), "joychromium-ua-"));
  writeFileSync(join(data, "settings.json"), JSON.stringify({ onboardingCompleted: true, startup: "NewTab", windowMode: "window", ...settings }));
  app = await electron.launch({ args: ["."], env: { ...process.env, JOYCHROMIUM_DATA: data, JOYCHROMIUM_START: "about:blank" } });
  await app.firstWindow();
  await expect.poll(() => app.evaluate(() => globalThis.joy.tabs().length), { timeout: 30_000 }).toBe(1);
  // Installed after startup finishes, so the app's own first https requests never race the registration.
  // The page travels as an argument: Playwright serializes the function, so a closure over PROBE_PAGE would be lost.
  await app.evaluate(({ protocol }, page) => {
    protocol.handle("https", () => new Response(page, { headers: { "content-type": "text/html" } }));
  }, PROBE_PAGE);
}

test.afterEach(async () => {
  await app.close().catch(() => undefined);
  rmSync(data, { recursive: true, force: true });
});

const navigate = (url: string) => app.evaluate(({}, target) => globalThis.joy.command({ type: "navigate", url: target }), url);
const userAgent = () => app.evaluate(({}, script) => globalThis.joy.pageEval(script), "navigator.userAgent") as Promise<string>;

/** Waits for the intercepted page itself, so a failed probe can never be read as the app's own error page. */
async function waitForProbe(url: string): Promise<string> {
  await expect.poll(async () => (await app.evaluate(() => globalThis.joy.tabs())).find((t) => t.isActive)?.url, { timeout: 30_000 }).toBe(url);
  await expect.poll(() => app.evaluate(({}, code) => globalThis.joy.pageEval(code), "document.title"), { timeout: 30_000 }).toBe("UA probe");
  await expect.poll(() => app.evaluate(({}, code) => globalThis.joy.pageEval(code), "!!document.getElementById('probe')"), { timeout: 30_000 }).toBe(true);
  return userAgent();
}

async function openAndRead(url: string): Promise<string> {
  await navigate(url);
  return waitForProbe(url);
}

/** Follows a link click inside the page, a navigation the shell never starts itself. */
async function followFromPage(url: string): Promise<string> {
  await app.evaluate(({}, code) => globalThis.joy.pageEval(code),
    `(() => { const a = document.createElement('a'); a.href = ${JSON.stringify(url)}; document.body.appendChild(a); a.click(); })()`);
  return waitForProbe(url);
}

test("a listed streaming host gets the desktop agent and every other host keeps the TV one", async () => {
  await launch({ streamingDesktopUa: true });
  const desktop = (await app.evaluate(() => globalThis.joy.userAgent)).replace(` ${TV_MARKER}`, "");
  expect(desktop).not.toContain(TV_MARKER);

  expect(await openAndRead("https://www.netflix.com/browse")).toBe(desktop);
  const outside = await openAndRead("https://probe.example/");
  expect(outside).toContain(TV_MARKER);
  // A host that only looks like a listed one keeps the TV identity.
  expect(await openAndRead("https://netflix.com.probe.example/")).toContain(TV_MARKER);
  // A link inside the page switches the agent for the destination, and back.
  expect(await followFromPage("https://www.primevideo.com/")).toBe(desktop);
  expect(await followFromPage("https://probe.example/link")).toContain(TV_MARKER);
});

test("with the rule off, the TV identity reaches the streaming hosts too", async () => {
  await launch({});
  expect(await openAndRead("https://www.netflix.com/")).toContain(TV_MARKER);
});
