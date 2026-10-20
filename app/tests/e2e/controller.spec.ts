import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Two pads on at once: the shell follows the one the user picked up, and the button hints turn into that pad's letters
// in the same window — no restart, no menu.
let data: string;
let app: ElectronApplication;
let chrome: Page;

const Button = { X: 2 } as const;
const XBOX = "Xbox Wireless Controller";
const DUALSENSE = "DualSense Wireless Controller";

test.beforeEach(async () => {
  data = mkdtempSync(join(tmpdir(), "joychromium-controller-"));
  // TV mode keeps the controller hints in the bar, which is where the glyphs show up.
  writeFileSync(join(data, "settings.json"), JSON.stringify({ onboardingCompleted: true, startup: "NewTab" }));
  app = await electron.launch({ args: ["."], env: { ...process.env, JOYCHROMIUM_DATA: data } });
  chrome = await app.firstWindow();
  await expect.poll(tabs, { timeout: 30_000 }).toHaveLength(1);
});

test.afterEach(async () => {
  await app.close().catch(() => undefined);
  rmSync(data, { recursive: true, force: true });
});

const tabs = () => app.evaluate(() => globalThis.joy.tabs());
const hints = () => chrome.locator(".pad-hints").textContent();

/** Synthetic pads in the slots the Gamepad API would use, so the real polling loop runs without hardware. */
async function installPads(ids: readonly string[]): Promise<void> {
  await chrome.evaluate((names) => {
    const make = (index: number, id: string) => ({
      index, id, mapping: "standard", connected: true, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    });
    const list = names.map((id, index) => make(index, id));
    (window as unknown as { __pads: typeof list }).__pads = list;
    (navigator as unknown as { getGamepads: () => unknown[] }).getGamepads = () => list;
  }, [...ids]);
}

async function press(pad: number, button: number): Promise<void> {
  const set = (pressed: boolean) => chrome.evaluate(([p, b, is]) => {
    (window as unknown as { __pads: { buttons: { pressed: boolean }[] }[] }).__pads[p].buttons[b].pressed = is;
  }, [pad, button, pressed]);
  await set(true);
  await new Promise((resolve) => setTimeout(resolve, 150));
  await set(false);
  await new Promise((resolve) => setTimeout(resolve, 150));
}

test("the pad last used owns the input and the hints follow it", async () => {
  await installPads([XBOX, DUALSENSE]);
  await expect.poll(hints, { timeout: 15_000 }).toContain("B voltar");
  expect(await hints()).toContain("A abrir");

  // The Xbox pad is already the one in the bar; using it changes nothing.
  await press(0, Button.X);
  expect(await hints()).toContain("B voltar");

  // The DualSense, in the same window, brings its own letters.
  await press(1, Button.X);
  await expect.poll(hints).toContain("○ voltar");
  expect(await hints()).toContain("✕ abrir");

  // And back to the Xbox pad, still without restarting anything.
  await press(0, Button.X);
  await expect.poll(hints).toContain("B voltar");
  expect(await hints()).toContain("A abrir");

  // Same window, same page: the injected pads are still there, so nothing restarted.
  expect(await chrome.evaluate(() => Boolean((window as unknown as { __pads?: unknown[] }).__pads))).toBe(true);
  await expect.poll(tabs).toHaveLength(1);
});

test("a pad that connects but is not used does not take the input", async () => {
  await installPads([XBOX]);
  await expect.poll(hints, { timeout: 15_000 }).toContain("B voltar");

  // The DualSense appears mid-session: the Xbox pad keeps the input until the new one is actually used.
  await installPads([XBOX, DUALSENSE]);
  await expect.poll(hints).toContain("B voltar");

  await press(1, Button.X);
  await expect.poll(hints).toContain("○ voltar");
});
