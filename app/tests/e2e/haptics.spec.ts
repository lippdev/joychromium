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

/** A synthetic pad whose vibration actuator records every effect the shell asks for. */
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
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    (navigator as unknown as { getGamepads: () => unknown[] }).getGamepads = () => [pad];
  });
}

async function press(button: number): Promise<void> {
  const set = (pressed: boolean) => chrome.evaluate(([index, is]) => {
    (window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad.buttons[index].pressed = is;
  }, [button, pressed]);
  await set(true);
  await new Promise((resolve) => setTimeout(resolve, 150));
  await set(false);
  await new Promise((resolve) => setTimeout(resolve, 150));
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
