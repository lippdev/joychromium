import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The address bar's suggestions, end to end: what the shell knows of the typed text comes back as a list the user can
// walk with the D-pad or the arrow keys and open with A or Enter (E6-05).
const PAGE = "<!doctype html><meta charset=\"utf-8\"><title>Notas de exemplo</title><p id=\"probe\">Notas</p>";
const VISITED = "https://notas.example/";

let data: string;
let app: ElectronApplication;
let chrome: Page;

test.beforeEach(async () => {
  data = mkdtempSync(join(tmpdir(), "joychromium-suggestions-"));
  writeFileSync(join(data, "settings.json"), JSON.stringify({ onboardingCompleted: true, startup: "NewTab", windowMode: "window" }));
  app = await electron.launch({ args: ["."], env: { ...process.env, JOYCHROMIUM_DATA: data, JOYCHROMIUM_START: "about:blank" } });
  chrome = await app.firstWindow();
  await expect.poll(() => app.evaluate(() => globalThis.joy.tabs().length), { timeout: 30_000 }).toBe(1);
  await app.evaluate(({ protocol }, page) => {
    protocol.handle("https", () => new Response(page, { headers: { "content-type": "text/html" } }));
  }, PAGE);
});

test.afterEach(async () => {
  await app.close().catch(() => undefined);
  rmSync(data, { recursive: true, force: true });
});

const command = (c: unknown) => app.evaluate(({}, cmd) => globalThis.joy.command(cmd), c);
const activeUrl = async () => (await app.evaluate(() => globalThis.joy.tabs())).find((t) => t.isActive)?.url;

/** Visits a page so it lands in the history the suggestions are built from, then returns to a fresh tab. */
async function visit(): Promise<void> {
  await command({ type: "navigate", url: VISITED });
  await expect.poll(activeUrl, { timeout: 30_000 }).toBe(VISITED);
  await command({ type: "new-tab" });
  await expect.poll(activeUrl, { timeout: 30_000 }).toBe("joychromium://newtab");
}

/** Focuses the address field, which is what opens the controller keyboard, and types into it. */
async function type(text: string): Promise<void> {
  await chrome.locator("#address").click();
  await expect.poll(() => chrome.locator("#keyboard").isVisible(), { timeout: 15_000 }).toBe(true);
  await chrome.locator("#address").fill(text);
}

test("typing brings the history back as a list, and the list opens a suggestion", async () => {
  await visit();
  await type("notas");

  const chips = chrome.locator(".suggestions .chip");
  await expect.poll(() => chips.count(), { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(chrome.locator(".suggestions")).toHaveAttribute("role", "listbox");
  await expect(chips.first()).toHaveAttribute("role", "option");
  await expect(chips.first()).toContainText("Notas de exemplo");

  await chrome.locator("#address").press("ArrowDown");
  await expect(chips.first()).toBeFocused();
  await expect(chips.first()).toHaveAttribute("aria-selected", "true");

  await chrome.keyboard.press("Enter");
  await expect.poll(activeUrl, { timeout: 30_000 }).toBe(VISITED);
  await expect.poll(() => chrome.locator("#keyboard").isVisible(), { timeout: 15_000 }).toBe(false);
});

test("the D-pad reaches the suggestions and A opens the selected one", async () => {
  await visit();
  await type("notas");
  await expect.poll(() => chrome.locator(".suggestions .chip").count(), { timeout: 15_000 }).toBeGreaterThan(0);

  // Synthetic pad in the slot the Gamepad API would use, so the real polling loop drives the list.
  await chrome.evaluate(() => {
    const pad = {
      index: 0, id: "Xbox Wireless Controller", mapping: "standard", connected: true, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    };
    (window as unknown as { __pads: unknown[] }).__pads = [pad];
    (navigator as unknown as { getGamepads: () => unknown[] }).getGamepads = () => (window as unknown as { __pads: unknown[] }).__pads;
  });
  const press = async (button: number) => {
    const set = (pressed: boolean) => chrome.evaluate(([b, is]) => {
      (window as unknown as { __pads: { buttons: { pressed: boolean }[] }[] }).__pads[0].buttons[b].pressed = is;
    }, [button, pressed]);
    await set(true);
    await new Promise((r) => setTimeout(r, 150));
    await set(false);
    await new Promise((r) => setTimeout(r, 150));
  };
  // Down from the address field lands on the first suggestion of the list.
  await press(13);
  await expect(chrome.locator(".suggestions .chip").first()).toBeFocused();

  await press(0);
  await expect.poll(activeUrl, { timeout: 30_000 }).toBe(VISITED);
});

test("no typed text means no list", async () => {
  await visit();
  await chrome.locator("#address").click();
  await expect.poll(() => chrome.locator("#keyboard").isVisible(), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => chrome.locator(".suggestions").count(), { timeout: 5_000 }).toBe(0);
});
