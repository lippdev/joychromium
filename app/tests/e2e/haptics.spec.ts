import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Haptic feedback end to end: the shell asks the controller in the user's hands for a short tap when A confirms and a
// double tap when something is blocked, and asks for nothing at all while the switch in Settings is off.
let data: string;
let app: ElectronApplication;
let chrome: Page;

const Button = { A: 0 } as const;
/** The blocked address the main process refuses: a URL scheme the browser will not navigate to. */
const BLOCKED_URL = "file:///etc/passwd";

test.beforeEach(async () => {
  data = mkdtempSync(join(tmpdir(), "joychromium-haptics-"));
});

test.afterEach(async () => {
  await app.close().catch(() => undefined);
  rmSync(data, { recursive: true, force: true });
});

async function launch(vibration: boolean): Promise<void> {
  writeFileSync(join(data, "settings.json"), JSON.stringify({ onboardingCompleted: true, startup: "NewTab", windowMode: "window", vibration }));
  app = await electron.launch({ args: ["."], env: { ...process.env, JOYCHROMIUM_DATA: data } });
  chrome = await app.firstWindow();
  await expect.poll(tabs, { timeout: 30_000 }).toHaveLength(1);
  await command({ type: "navigate", url: "about:blank" });
  await settle();
}

const tabs = () => app.evaluate(() => globalThis.joy.tabs());
const command = (c: unknown) => app.evaluate(({}, cmd) => globalThis.joy.command(cmd), c);
const pageEval = <T>(script: string) => app.evaluate(({}, code) => globalThis.joy.pageEval(code) as Promise<T>, script);
const settle = () => expect.poll(async () => (await tabs()).find((t) => t.isActive)?.isLoading, { timeout: 30_000 }).toBe(false);

interface Effect {
  type: string;
  duration: number;
  strongMagnitude: number;
  weakMagnitude: number;
}

/**
 * A synthetic pad whose vibration actuator records every effect the shell asks for. The counter is what makes a press
 * reliable: the shell reads the pad on animation frames, and a press held for a fixed number of milliseconds can begin
 * and end between two of them — it is then lost without a trace, and the cue the test waits for never happens.
 */
async function installPad(): Promise<void> {
  await chrome.evaluate(() => {
    const effects: unknown[] = [];
    const pad = {
      index: 0, id: "Xbox Wireless Controller", mapping: "standard", connected: true, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
      vibrationActuator: {
        effects,
        playEffect(type: string, params: Record<string, number>) {
          effects.push({ type, ...params });
          return Promise.resolve("complete");
        },
      },
    };
    const host = window as unknown as { __pad: typeof pad; __polls: number };
    host.__pad = pad;
    host.__polls = 0;
    (navigator as unknown as { getGamepads: () => unknown[] }).getGamepads = () => {
      host.__polls += 1;
      return [pad];
    };
  });
}

const polls = () => chrome.evaluate(() => (window as unknown as { __polls: number }).__polls);

/**
 * Holds the button until the loop has read the pad, then releases it and waits for the release to be read as well: only
 * then has the press reached the shell, whatever the frame rate was.
 */
async function press(button: number): Promise<void> {
  const set = (pressed: boolean) => chrome.evaluate(([index, is]) => {
    (window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad.buttons[index]!.pressed = is;
  }, [button, pressed] as const);
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

/** Effects the pad received so far. */
const effects = () => chrome.evaluate(() => (window as unknown as { __pad: { vibrationActuator: { effects: Effect[] } } }).__pad.vibrationActuator.effects);

test("A asks for a short tap and a blocked navigation for a double tap", async () => {
  await launch(true);
  await installPad();
  await expect.poll(effects, { timeout: 15_000 }).toEqual([]);

  await press(Button.A);
  await expect.poll(effects, { timeout: 5_000 }).toHaveLength(1);
  expect((await effects())[0]).toMatchObject({ type: "dual-rumble", duration: 40 });

  await command({ type: "navigate", url: BLOCKED_URL });
  await expect.poll(async () => (await effects()).length, { timeout: 5_000 }).toBe(3);
  const [, first, second] = await effects();
  expect(first).toMatchObject({ type: "dual-rumble", duration: 90 });
  expect(second).toMatchObject({ type: "dual-rumble", duration: 90 });
  expect(first.strongMagnitude).toBeGreaterThan(0.4);
});

test("with the switch off the pad is never asked", async () => {
  await launch(false);
  await installPad();
  await press(Button.A);
  await command({ type: "navigate", url: BLOCKED_URL });
  // Long enough for the preference round trip and both error pulses to have happened had they been asked for.
  await new Promise((resolve) => setTimeout(resolve, 800));
  expect(await effects()).toEqual([]);
});

test("the settings switch saves the preference", async () => {
  await launch(false);
  await command({ type: "navigate", url: "joychromium://settings" });
  await settle();
  await expect.poll(() => pageEval<boolean>("document.getElementById('vibration').checked")).toBe(false);

  await pageEval("(() => { const el = document.getElementById('vibration'); el.checked = true; el.dispatchEvent(new Event('change')); return 'ok'; })()");
  await expect.poll(() => JSON.parse(readFileSync(join(data, "settings.json"), "utf8")).vibration).toBe(true);
});
