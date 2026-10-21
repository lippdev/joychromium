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
  writeFileSync(join(data, "settings.json"), JSON.stringify({ onboardingCompleted: true, startup: "NewTab", language: "pt-BR" }));
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

/**
 * Synthetic pads in the slots the Gamepad API would use, so the real polling loop runs without hardware. The counter is
 * what makes a press reliable: the shell reads the pad on animation frames, and a press held for a fixed number of
 * milliseconds can begin and end between two of them — it is then lost without a trace, and the test fails later at
 * whatever the press was supposed to do. `press` below waits for the read instead of hoping for it.
 */
async function installPads(ids: readonly string[]): Promise<void> {
  await chrome.evaluate((names) => {
    const make = (index: number, id: string) => ({
      index, id, mapping: "standard", connected: true, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    });
    const list = names.map((id, index) => make(index, id));
    const host = window as unknown as { __pads: typeof list; __polls: number };
    host.__pads = list;
    host.__polls = 0;
    (navigator as unknown as { getGamepads: () => unknown[] }).getGamepads = () => {
      host.__polls += 1;
      return list;
    };
  }, [...ids]);
}

const polls = () => chrome.evaluate(() => (window as unknown as { __polls: number }).__polls);

/**
 * Holds the button until the loop has read the pad, then releases it and waits for the release to be read as well: only
 * then has the press reached the shell, whatever the frame rate was. A loop that never reads the pad fails here, with
 * the reason, instead of leaving the next assertion to report the wrong thing.
 */
async function press(pad: number, button: number): Promise<void> {
  const set = (pressed: boolean) => chrome.evaluate(([p, b, is]) => {
    (window as unknown as { __pads: { buttons: { pressed: boolean }[] }[] }).__pads[p]!.buttons[b]!.pressed = is;
  }, [pad, button, pressed] as const);
  // The counter is read after the button moves, never before: a poll that happened while the pad was still up must not
  // count as the loop having seen the press.
  await set(true);
  const down = await polls();
  await expect.poll(polls, { timeout: 10_000, message: "the shell's controller loop never read the pressed pad (hidden or occluded window?)" }).toBeGreaterThan(down);
  await set(false);
  // `justPressed` fires again only after the loop has seen the button up, so the release has to land in a frame too.
  const up = await polls();
  await expect.poll(polls, { timeout: 10_000, message: "the shell's controller loop never read the release, so the next press would count as a hold" }).toBeGreaterThan(up);
}

/** How far the page's own cursor overlay has moved horizontally, and whether it is drawn at all. */
const cursor = () => app.evaluate(() => globalThis.joy.pageEval(
  "(() => { const c = document.getElementById('__joy-cursor'); return c ? { shown: c.style.display === 'block', x: parseFloat((c.style.transform.match(/translate\\(([-\\d.]+)px/) || [0, '0'])[1]) } : null; })()",
)) as Promise<{ shown: boolean; x: number } | null>;

test("the right stick turns the pointer on and the left stick moves it", async () => {
  await installPads([XBOX]);
  await expect.poll(hints, { timeout: 15_000 }).toContain("R3 cursor");
  const mode = () => chrome.locator(".status-line .mode").textContent();
  expect(await mode()).toBe("SPATIAL");

  // The right stick is buttons[11]: pressing buttons[10] is the left stick and must not change the mode.
  await press(0, 10);
  expect(await mode()).toBe("SPATIAL");
  await press(0, 11);
  await expect.poll(mode, { timeout: 10_000 }).toBe("CURSOR");
  await expect.poll(cursor, { timeout: 10_000 }).toMatchObject({ shown: true });

  // In Cursor mode the stick drives the page's pointer instead of walking the focus.
  const before = (await cursor())!.x;
  await chrome.evaluate(() => { (window as unknown as { __pads: { axes: number[] }[] }).__pads[0]!.axes[0] = 1; });
  await expect.poll(async () => (await cursor())!.x, { timeout: 10_000 }).toBeGreaterThan(before + 20);
  await chrome.evaluate(() => { (window as unknown as { __pads: { axes: number[] }[] }).__pads[0]!.axes[0] = 0; });
});

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
