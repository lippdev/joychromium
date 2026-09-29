import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Drives the real shell through its command interface and checks what the chrome UI renders.
let data: string;
let app: ElectronApplication;

test.beforeEach(async () => {
  data = mkdtempSync(join(tmpdir(), "joychromium-e2e-"));
  writeFileSync(join(data, "settings.json"), JSON.stringify({ onboardingCompleted: true, startup: "NewTab" }));
  app = await electron.launch({ args: ["."], env: { ...process.env, JOYCHROMIUM_DATA: data } });
});

test.afterEach(async () => {
  await app.close();
  rmSync(data, { recursive: true, force: true });
});

const tabs = () => app.evaluate(() => globalThis.joy.tabs());
const command = (c: unknown) => app.evaluate(({}, cmd) => globalThis.joy.command(cmd), c);

test("shell UI, tabs, internal pages and session", async () => {
  const chrome = await app.firstWindow();
  await expect(chrome.locator("#address")).toBeVisible();
  await expect.poll(tabs, { timeout: 30_000 }).toHaveLength(1);
  expect((await tabs())[0]?.url).toBe("joychromium://newtab");
  await expect(chrome.locator("#tabs .tab")).toHaveCount(1);

  await command({ type: "new-tab" });
  await expect.poll(tabs).toHaveLength(2);
  await expect(chrome.locator("#tabs .tab")).toHaveCount(2);

  await command({ type: "settings" });
  await expect.poll(async () => (await tabs()).find((t) => t.isActive)?.url).toBe("joychromium://settings");
  await expect.poll(async () => (await tabs()).find((t) => t.isActive)?.title, { timeout: 15_000 }).toBe("Settings");
  await expect(chrome.locator("#address")).toHaveValue("joychromium://settings");

  // The settings page asked for its data over the bridge and rendered it.
  await expect.poll(() => app.evaluate(() => globalThis.joy.pageEval("document.getElementById('appVersion').textContent")), { timeout: 15_000 }).toMatch(/^v\d/);
  expect(await app.evaluate(() => globalThis.joy.pageEval("document.querySelectorAll('#presets .preset').length"))).toBeGreaterThan(3);

  await command({ type: "navigate", url: "joychromium://favorites" });
  await expect.poll(async () => (await tabs()).find((t) => t.isActive)?.title, { timeout: 15_000 }).toBe("Favorites");

  // Web pages get the spatial-navigation script and the cursor overlay.
  await command({ type: "navigate", url: "about:blank" });
  await expect.poll(() => app.evaluate(() => globalThis.joy.pageEval("typeof window.__joy + '/' + typeof window.__joyCursor")), { timeout: 15_000 }).toBe("object/object");

  await command({ type: "close-tab" });
  await expect.poll(tabs).toHaveLength(1);

  // Blocked scheme never navigates; the status line says why.
  await command({ type: "navigate", url: "file:///C:/Windows" });
  await expect(chrome.locator("#status")).toContainText("BLOCKED");

  await command({ type: "keyboard-open", target: "address" });
  await expect(chrome.locator("#keyboard")).toBeVisible();
  await command({ type: "keyboard-close" });
  await expect(chrome.locator("#keyboard")).toBeHidden();

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await expect.poll(() => existsSync(join(data, "session.json")), { timeout: 10_000 }).toBe(true);
});

test("first run shows onboarding", async () => {
  writeFileSync(join(data, "settings.json"), "{}");
  const fresh = await electron.launch({ args: ["."], env: { ...process.env, JOYCHROMIUM_DATA: data } });
  try {
    await expect.poll(() => fresh.evaluate(() => globalThis.joy.tabs()[0]?.url), { timeout: 30_000 }).toBe("joychromium://welcome");
  } finally {
    await fresh.close();
  }
});
