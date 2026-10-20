import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Media control end to end: the injected script plays and pauses the page's own element, the A button gets there
// through the real gamepad polling loop, and the hardware media keys reach the same actions.
let data: string;
let app: ElectronApplication;
let chrome: Page;

const Button = { A: 0, Start: 9, DpadDown: 13 } as const;

test.beforeEach(async () => {
  data = mkdtempSync(join(tmpdir(), "joychromium-media-"));
  writeFileSync(join(data, "settings.json"), JSON.stringify({ onboardingCompleted: true, startup: "NewTab", windowMode: "window" }));
  app = await electron.launch({ args: ["."], env: { ...process.env, JOYCHROMIUM_DATA: data } });
  chrome = await app.firstWindow();
  await expect.poll(tabs, { timeout: 30_000 }).toHaveLength(1);
  await command({ type: "navigate", url: "about:blank" });
  await settle();
});

test.afterEach(async () => {
  await app.close().catch(() => undefined);
  rmSync(data, { recursive: true, force: true });
});

const tabs = () => app.evaluate(() => globalThis.joy.tabs());
const command = (c: unknown) => app.evaluate(({}, cmd) => globalThis.joy.command(cmd), c);
const pageEval = (script: string) => app.evaluate(({}, code) => globalThis.joy.pageEval(code), script);
const spatialEval = (script: string) => app.evaluate(({}, code) => globalThis.joy.spatialEval(code), script);
const settle = () => expect.poll(async () => (await tabs()).find((t) => t.isActive)?.isLoading, { timeout: 30_000 }).toBe(false);

/** Replaces the gamepad the shell polls, so the real controller path runs without hardware. */
async function installPad(): Promise<void> {
  await chrome.evaluate(() => {
    const pad = {
      id: "Xbox Wireless Controller", mapping: "standard", connected: true, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    (navigator as unknown as { getGamepads: () => unknown[] }).getGamepads = () => [pad];
  });
}

async function press(button: number): Promise<void> {
  await chrome.evaluate((index) => { (window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad.buttons[index].pressed = true; }, button);
  await new Promise((resolve) => setTimeout(resolve, 150));
  await chrome.evaluate((index) => { (window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad.buttons[index].pressed = false; }, button);
  await new Promise((resolve) => setTimeout(resolve, 150));
}

const sendMediaKey = (keyCode: string) => app.evaluate(({ webContents }, code) => {
  const wc = webContents.getAllWebContents().find((w) => w.getURL() === "about:blank");
  wc?.sendInputEvent({ type: "keyDown", keyCode: code });
  wc?.sendInputEvent({ type: "keyUp", keyCode: code });
}, keyCode);

/** A muted canvas stream gives a real playing element without a codec, a file or the network. */
const VIDEO = `(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 36;
  const context = canvas.getContext('2d');
  setInterval(() => { context.fillStyle = '#123'; context.fillRect(0, 0, 64, 36); }, 100);
  const video = document.createElement('video');
  video.id = 'video';
  video.muted = true;
  video.srcObject = canvas.captureStream(10);
  window.events = [];
  video.addEventListener('play', () => window.events.push('play'));
  video.addEventListener('pause', () => window.events.push('pause'));
  document.body.appendChild(video);
  return 'ok';
})()`;

const TRACK_BUTTONS = `(() => {
  window.skipped = { next: 0, previous: 0 };
  for (const direction of ['next', 'previous']) {
    const button = document.createElement('button');
    button.setAttribute('aria-label', direction === 'next' ? 'Next video' : 'Previous video');
    button.onclick = () => { window.skipped[direction] += 1; };
    document.body.appendChild(button);
  }
  return 'ok';
})()`;

test("A plays and pauses the page's video", async () => {
  await installPad();
  await pageEval(VIDEO);
  // The injected script runs in its own world, so the spy has to live there too: a page-world override is
  // invisible to it. Each spy records the call and then does the real work.
  await spatialEval(`(() => {
    window.calls = [];
    const play = HTMLMediaElement.prototype.play;
    const pause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.play = function (...args) { window.calls.push('play'); return play.apply(this, args); };
    HTMLMediaElement.prototype.pause = function (...args) { window.calls.push('pause'); return pause.apply(this, args); };
    return 'ok';
  })()`);

  await press(Button.A);
  await expect.poll(() => pageEval("document.getElementById('video').paused"), { timeout: 5_000 }).toBe(false);
  expect(await spatialEval("window.calls")).toEqual(["play"]);
  expect(await pageEval("window.events")).toEqual(["play"]);

  await press(Button.A);
  await expect.poll(() => pageEval("document.getElementById('video').paused"), { timeout: 5_000 }).toBe(true);
  expect(await spatialEval("window.calls")).toEqual(["play", "pause"]);
  expect(await pageEval("window.events")).toEqual(["play", "pause"]);
});

test("A still activates the focused element when the page has no media", async () => {
  await installPad();
  await pageEval(`(() => {
    const button = document.createElement('button');
    button.textContent = 'Continue';
    button.onclick = () => { window.clicked = true; };
    document.body.appendChild(button);
    button.focus();
    return document.activeElement === button;
  })()`);

  await press(Button.A);
  await expect.poll(() => pageEval("window.clicked ?? false"), { timeout: 5_000 }).toBe(true);
});

test("the media keys play, pause and skip tracks", async () => {
  await pageEval(VIDEO);
  await pageEval(TRACK_BUTTONS);

  await sendMediaKey("MediaPlayPause");
  await expect.poll(() => pageEval("document.getElementById('video').paused"), { timeout: 5_000 }).toBe(false);
  await sendMediaKey("MediaPlayPause");
  await expect.poll(() => pageEval("document.getElementById('video').paused"), { timeout: 5_000 }).toBe(true);

  // sendInputEvent takes the native key identifier; the page receives the DOM key (MediaTrackNext).
  await sendMediaKey("MediaNextTrack");
  await expect.poll(() => pageEval("window.skipped.next"), { timeout: 5_000 }).toBe(1);
  await sendMediaKey("MediaPreviousTrack");
  await expect.poll(() => pageEval("window.skipped.previous"), { timeout: 5_000 }).toBe(1);
});

test("the quick menu skips tracks from the controller", async () => {
  await installPad();
  await pageEval(VIDEO);
  await pageEval(TRACK_BUTTONS);

  await press(Button.Start);
  const menu = chrome.locator(".overlay .menu");
  await expect(menu).toBeVisible();

  const focusedItem = () => chrome.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    return element?.classList.contains("menu-item") ? element.textContent?.trim() ?? "" : "";
  });
  for (let i = 0; i < 12 && !/Next track|Próxima faixa/.test(await focusedItem()); i++) await press(Button.DpadDown);
  expect(await focusedItem()).toMatch(/Next track|Próxima faixa/);

  await press(Button.A);
  await expect.poll(() => pageEval("window.skipped.next"), { timeout: 5_000 }).toBe(1);
  await expect(menu).toHaveCount(0);
});
