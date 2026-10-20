import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BOOT_GOAL_MS, bootMsFromLog, DPAD_GOAL_MS, formatReading, percentile, reading, type MetricReading,
} from "../../src/shared/metrics";

/**
 * The two time budgets of the PRD, section 11, measured on every run instead of checked by hand.
 *
 * - Boot: the app's own log carries both ends, the `starting` line and the `boot: first screen ready` marker `main.ts`
 *   writes when the first tab has its document. The test reads the two stamps and subtracts them, so it needs no
 *   clock shared with the app and invents no number.
 * - D-pad: a synthetic pad in the slot the Gamepad API would use, the same replacement the controller specs install.
 *   The press and the clock are in the shell renderer: it records `performance.now()` at the moment the direction goes
 *   down and stops when `document.activeElement` is a different element. The first movement is thrown away — it pays
 *   for the first frame of the menu — and the rest is reported as a p95.
 *
 * The assertions are on twice the goal (see `shared/metrics.ts`): the goal itself is printed for the PR and for the
 * PRD, and a runner slower than a TV must not turn the suite red for being slow. What the test refuses is a
 * regression: a boot that falls off a cliff, or a D-pad that stopped moving the focus at all.
 */

const Button = { Start: 9, DpadUp: 12, DpadDown: 13 } as const;

/** Movements per direction, plus the warm-up one the summary ignores. */
const STEPS = 21;

/** One step per D-pad repeat: the shell ignores a direction less than 180 ms after the last one. */
const STEP_MS = 220;

let data: string;
let app: ElectronApplication;
let chrome: Page;
const measured: MetricReading[] = [];

test.beforeEach(async () => {
  data = mkdtempSync(join(tmpdir(), `joychromium-metrics-${test.info().title.startsWith("boot") ? "boot" : "dpad"}-`));
  writeFileSync(join(data, "settings.json"), JSON.stringify({ onboardingCompleted: true, startup: "NewTab", windowMode: "window" }));
  app = await electron.launch({ args: ["."], env: { ...process.env, JOYCHROMIUM_DATA: data } });
  chrome = await app.firstWindow();
  await expect.poll(() => app.evaluate(() => globalThis.joy.tabs().length), { timeout: 30_000 }).toBe(1);
});

test.afterEach(async () => {
  await app.close().catch(() => undefined);
  rmSync(data, { recursive: true, force: true });
});

test.afterAll(() => {
  if (measured.length === 0) return;
  mkdirSync("test-results", { recursive: true });
  writeFileSync(join("test-results", "metrics.json"), `${JSON.stringify({ measured }, null, 2)}\n`);
  for (const item of measured) console.log(formatReading(item));
});

/** The app's log as it stands: the daily file it is writing into while the test runs. */
function appLog(): string {
  const folder = join(data, "logs");
  try {
    return readdirSync(folder)
      .filter((name) => name.endsWith(".log"))
      .map((name) => readFileSync(join(folder, name), "utf8"))
      .join("\n");
  } catch {
    return "";
  }
}

test("boot reaches the first screen inside the budget", async () => {
  // The marker is written by the main process; the log file is the app's own report, not the test's stopwatch.
  await expect.poll(() => bootMsFromLog(appLog()), { timeout: 60_000 }).toBeGreaterThan(0);
  const bootMs = bootMsFromLog(appLog())!;
  const item = reading("boot to first screen", bootMs, BOOT_GOAL_MS);
  measured.push(item);
  console.log(formatReading(item));

  expect(bootMs).toBeGreaterThan(0);
  expect(bootMs).toBeLessThanOrEqual(item.limitMs);
});

/** Replaces the gamepad the shell polls and counts the polls, so a press is only released once the loop has read it. */
async function installPad(): Promise<void> {
  await chrome.evaluate(() => {
    const pad = {
      index: 0, id: "Xbox Wireless Controller", mapping: "standard", connected: true, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    };
    const window_ = window as unknown as { __pad: typeof pad; __polls: number };
    window_.__pad = pad;
    window_.__polls = 0;
    (navigator as unknown as { getGamepads: () => unknown[] }).getGamepads = () => {
      window_.__polls += 1;
      return [pad];
    };
  });
}

const polls = () => chrome.evaluate(() => (window as unknown as { __polls: number }).__polls);

/** Holds the button until the shell's loop has read the pad, then releases it, so no press is lost between frames. */
async function tap(button: number): Promise<void> {
  // The counter is read after the button moves: a poll that happened while the pad was still up must not pass for the
  // loop having seen the press.
  await chrome.evaluate((index) => { (window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad.buttons[index]!.pressed = true; }, button);
  const down = await polls();
  await expect.poll(polls, { timeout: 10_000 }).toBeGreaterThan(down);
  await chrome.evaluate((index) => { (window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad.buttons[index]!.pressed = false; }, button);
  const up = await polls();
  await expect.poll(polls, { timeout: 10_000 }).toBeGreaterThan(up);
}

/** One D-pad movement, timed inside the shell renderer: button down, then the frame where the focus is elsewhere. */
function moveFocus(button: number): Promise<number> {
  return chrome.evaluate((index) => new Promise<number>((resolve) => {
    const pad = (window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad;
    const from = document.activeElement;
    const started = performance.now();
    const give = setTimeout(() => {
      pad.buttons[index]!.pressed = false;
      resolve(-1);
    }, 5_000);
    pad.buttons[index]!.pressed = true;
    const frame = (): void => {
      if (document.activeElement !== from) {
        clearTimeout(give);
        pad.buttons[index]!.pressed = false;
        resolve(performance.now() - started);
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }), button);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("the D-pad moves the focus inside the budget", async () => {
  await installPad();
  // The quick menu is the shell's own focus: the D-pad walks its items, and every movement lands in `document.activeElement`.
  await tap(Button.Start);
  const menu = chrome.locator(".overlay .menu");
  await expect(menu).toBeVisible();
  await expect.poll(() => chrome.evaluate(() => document.activeElement?.classList.contains("menu-item") ?? false)).toBe(true);

  // Down onto the second item and back up onto the first, so every movement has somewhere to go.
  const movements: number[] = [];
  for (let i = 0; i < STEPS; i++) {
    if (i > 0) await sleep(STEP_MS);
    movements.push(await moveFocus(i % 2 === 0 ? Button.DpadDown : Button.DpadUp));
  }
  expect(movements).not.toContain(-1);

  // The first movement is the warm-up: it pays for the frame the menu was rendered in and says nothing about the pad.
  const samples = movements.slice(1);
  const p95 = percentile(samples, 0.95)!;
  const item = reading(`D-pad to focus (p95 of ${samples.length})`, p95, DPAD_GOAL_MS);
  measured.push(item);
  console.log(formatReading(item));
  console.log(`D-pad samples (ms, warm-up first and discarded): ${movements.map((ms) => Math.round(ms)).join(", ")}`);

  expect(samples.length).toBe(STEPS - 1);
  expect(p95).toBeLessThanOrEqual(item.limitMs);
});
