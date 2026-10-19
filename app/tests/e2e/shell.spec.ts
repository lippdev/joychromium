import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Drives the real shell through its command interface and checks what the chrome UI renders.
let data: string;
let app: ElectronApplication;

test.beforeEach(async () => {
  data = mkdtempSync(join(tmpdir(), "joychromium-e2e-"));
  writeFileSync(join(data, "settings.json"), JSON.stringify({ onboardingCompleted: true, startup: "NewTab", windowMode: "window" }));
  app = await electron.launch({ args: ["."], env: { ...process.env, JOYCHROMIUM_DATA: data } });
});

test.afterEach(async () => {
  await app.close().catch(() => undefined);
  rmSync(data, { recursive: true, force: true });
});

const tabs = () => app.evaluate(() => globalThis.joy.tabs());
const command = (c: unknown) => app.evaluate(({}, cmd) => globalThis.joy.command(cmd), c);

test("shell UI, tabs, internal pages and session", async () => {
  const chrome = await app.firstWindow();
  await expect(chrome.locator("#address")).toBeVisible();
  await expect.poll(tabs, { timeout: 30_000 }).toHaveLength(1);
  expect((await tabs())[0]?.url).toBe("joychromium://newtab");
  // Tabs are switched through the grid overlay, which is what a controller uses; its last card opens a new tab.
  await chrome.locator("#tabs-button").click();
  await expect(chrome.locator(".tab-card")).toHaveCount(2);
  await chrome.locator(".tab-card.new").click();
  await expect.poll(tabs).toHaveLength(2);
  await expect(chrome.locator("#tabs-button")).toContainText("2");

  await command({ type: "settings" });
  await expect.poll(async () => (await tabs()).find((t) => t.isActive)?.url).toBe("joychromium://settings");
  await expect.poll(async () => (await tabs()).find((t) => t.isActive)?.title, { timeout: 15_000 }).toMatch(/Settings|Configurações/);
  await expect(chrome.locator("#address")).toHaveValue("joychromium://settings");

  // The settings page asked for its data over the bridge and rendered it.
  await expect.poll(() => app.evaluate(() => globalThis.joy.pageEval("document.getElementById('appVersion').textContent")), { timeout: 15_000 }).toMatch(/^v\d/);
  expect(await app.evaluate(() => globalThis.joy.pageEval("document.querySelectorAll('#presets .preset').length"))).toBeGreaterThan(3);

  await command({ type: "navigate", url: "joychromium://favorites" });
  await expect.poll(async () => (await tabs()).find((t) => t.isActive)?.title, { timeout: 15_000 }).toMatch(/Favorites|Favoritos/);

  // Web pages get the spatial-navigation script and the cursor overlay.
  await command({ type: "navigate", url: "about:blank" });
  await expect.poll(() => app.evaluate(() => globalThis.joy.pageEval("typeof window.__joy + '/' + typeof window.__joyCursor")), { timeout: 15_000 }).toBe("object/object");

  await command({ type: "close-tab" });
  await expect.poll(tabs).toHaveLength(1);

  // Blocked scheme never navigates; a toast says why.
  await command({ type: "navigate", url: "file:///C:/Windows" });
  await expect(chrome.locator(".toasts")).toContainText("BLOCKED");

  await command({ type: "keyboard-open", target: "address" });
  await expect(chrome.locator("#keyboard")).toBeVisible();
  await command({ type: "keyboard-close" });
  await expect(chrome.locator("#keyboard")).toHaveCount(0);

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await expect.poll(() => existsSync(join(data, "session.json")), { timeout: 10_000 }).toBe(true);
});

test("restores the previous tabs after an unexpected close", async () => {
  await app.close();
  const fresh = mkdtempSync(join(tmpdir(), "joychromium-e2e-crash-"));
  writeFileSync(join(fresh, "settings.json"), JSON.stringify({ onboardingCompleted: true, startup: "NewTab", windowMode: "window" }));
  writeFileSync(join(fresh, "session.json"), JSON.stringify(["joychromium://newtab", "https://a.example/"]));
  writeFileSync(join(fresh, "running.json"), "killed");
  const recovered = await electron.launch({ args: ["."], env: { ...process.env, JOYCHROMIUM_DATA: fresh } });
  try {
    await expect.poll(() => recovered.evaluate(() => globalThis.joy.tabs().length), { timeout: 30_000 }).toBe(2);
    expect((await recovered.evaluate(() => globalThis.joy.tabs().map((t) => t.url)))[0]).toBe("joychromium://newtab");
  } finally {
    await recovered.close();
    rmSync(fresh, { recursive: true, force: true });
  }
});

test("first run shows onboarding", async () => {
  // A fresh profile, and only one instance at a time: a second launch of the same profile hands over and exits.
  await app.close();
  const fresh = mkdtempSync(join(tmpdir(), "joychromium-e2e-first-"));
  writeFileSync(join(fresh, "settings.json"), "{}");
  const first = await electron.launch({ args: ["."], env: { ...process.env, JOYCHROMIUM_DATA: fresh } });
  try {
    await expect.poll(() => first.evaluate(() => globalThis.joy.tabs()[0]?.url), { timeout: 30_000 }).toBe("joychromium://welcome");
  } finally {
    await first.close();
    rmSync(fresh, { recursive: true, force: true });
  }
});
