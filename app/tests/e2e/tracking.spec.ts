import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Each tracking level feeds a different list set to the Ghostery engine (E8-03). The hosts below are from the
// lists themselves: the Facebook pixel is in EasyPrivacy, so it passes at Basic and is blocked at Balanced;
// Pinterest's widget script is in Fanboy's Annoyance list, so it only falls at Strict. Network access is
// required once for the lists.
const TRACKER = "https://connect.facebook.net/en_US/fbevents.js";
const SOCIAL = "https://assets.pinterest.com/js/pinit.js";
const AD = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";

let data: string;
let app: ElectronApplication;

test.beforeEach(async () => {
  data = mkdtempSync(join(tmpdir(), "joychromium-e2e-tracking-"));
  writeFileSync(join(data, "settings.json"), JSON.stringify({
    onboardingCompleted: true, startup: "NewTab", windowMode: "window", trackingPrevention: "Balanced",
  }));
  app = await electron.launch({ args: ["."], env: { ...process.env, JOYCHROMIUM_DATA: data } });
});

test.afterEach(async () => {
  await app.close().catch(() => undefined);
  rmSync(data, { recursive: true, force: true });
});

const tabs = () => app.evaluate(() => globalThis.joy.tabs());
const activeTab = async () => (await tabs()).find((tab) => tab.isActive);
const command = (c: unknown) => app.evaluate(({}, cmd) => globalThis.joy.command(cmd), c);
const pageEval = <T>(script: string) => app.evaluate(({}, code) => globalThis.joy.pageEval(code), script) as Promise<T>;
const level = () => app.evaluate(() => globalThis.joy.adblockLevel());
const blocked = (url: string) => app.evaluate(({}, target) => globalThis.joy.wouldBlock(target), url);
const statusText = () => pageEval<string>("document.getElementById('adBlockUpdate').textContent");
const pickLevel = (value: string) =>
  pageEval(`(() => { const select = document.getElementById('trackingPrevention'); select.value = '${value}'; select.dispatchEvent(new Event('change')); return select.value; })()`);

test("each level blocks a different set of hosts without a restart", async () => {
  await app.firstWindow();
  await expect.poll(tabs, { timeout: 30_000 }).toHaveLength(1);
  await expect.poll(() => app.evaluate(() => globalThis.joy.adblockReady), { timeout: 60_000 }).toBe(true);
  expect(await level()).toBe("Balanced");

  await command({ type: "navigate", url: "joychromium://settings" });
  // Wait for the page before evaluating in it: an evaluate that lands mid-navigation never resolves.
  await expect.poll(async () => (await activeTab())?.url, { timeout: 30_000 }).toBe("joychromium://settings");
  await expect.poll(async () => (await activeTab())?.isLoading, { timeout: 30_000 }).toBe(false);
  await expect.poll(() => pageEval<string>("document.getElementById('trackingPrevention')?.value"), { timeout: 30_000 }).toBe("Balanced");
  await expect.poll(statusText, { timeout: 15_000 }).toMatch(/^Balanced: 14 lists loaded/);

  // Balanced already blocks the tracker and the ad, and leaves the social widget alone.
  expect(await blocked(TRACKER)).toBe(true);
  expect(await blocked(AD)).toBe(true);
  expect(await blocked(SOCIAL)).toBe(false);

  // Basic drops the tracking lists on the live session: the pixel gets through, ads stay blocked.
  expect(await pickLevel("Basic")).toBe("Basic");
  await expect.poll(level, { timeout: 60_000 }).toBe("Basic");
  expect(await blocked(TRACKER)).toBe(false);
  expect(await blocked(AD)).toBe(true);
  expect(await blocked(SOCIAL)).toBe(false);
  await expect.poll(statusText, { timeout: 15_000 }).toMatch(/^Basic: 12 lists loaded/);

  // Strict adds the social list on top: the widget falls, the tracker keeps falling.
  expect(await pickLevel("Strict")).toBe("Strict");
  await expect.poll(level, { timeout: 60_000 }).toBe("Strict");
  expect(await blocked(TRACKER)).toBe(true);
  expect(await blocked(SOCIAL)).toBe(true);
  expect(await blocked(AD)).toBe(true);
  await expect.poll(statusText, { timeout: 15_000 }).toMatch(/^Strict: 15 lists loaded/);
  expect(JSON.parse(readFileSync(join(data, "settings.json"), "utf8")).trackingPrevention).toBe("Strict");

  // Nothing was restarted: it is the same app, and the tab that changed the setting is still on screen.
  expect((await tabs()).some((tab) => tab.url === "joychromium://settings")).toBe(true);
});
