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
const playingAudio = () => expect.poll(async () => (await tabs()).find((t) => t.isActive)?.isPlayingAudio, { timeout: 10_000 });

/**
 * Replaces the gamepad the shell polls, so the real controller path runs without hardware. The counter is what makes a
 * press reliable: the shell reads the pad on animation frames, and a press that lasts a fixed number of milliseconds can
 * begin and end between two of them — it is then lost without a trace, and the test fails later at whatever the press
 * was supposed to open. `press` below waits for the read instead of hoping for it.
 */
async function installPad(): Promise<void> {
  await chrome.evaluate(() => {
    const pad = {
      id: "Xbox Wireless Controller", mapping: "standard", connected: true, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
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

/** The shell ignores a second direction for 180 ms, so presses keep the spacing the old fixed sleep happened to give them. */
const PRESS_GAP_MS = 200;
let lastPress = 0;

/**
 * Holds the button until the loop has read the pad, then releases it and waits for the release to be read as well: only
 * then has the press reached the shell, whatever the frame rate was. A loop that never reads the pad fails here, with
 * the reason, instead of leaving the next assertion to report "element(s) not found".
 */
async function press(button: number): Promise<void> {
  const wait = lastPress + PRESS_GAP_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastPress = Date.now();
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

/** Walks the quick menu with the D-pad the way a controller does, and activates the item whose label matches. */
async function runMenuItem(label: RegExp): Promise<void> {
  await press(Button.Start);
  const menu = chrome.locator(".overlay .menu");
  await expect(menu).toBeVisible();
  const focusedItem = () => chrome.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    return element?.classList.contains("menu-item") ? element.textContent?.trim() ?? "" : "";
  });
  for (let i = 0; i < 12 && !label.test(await focusedItem()); i++) await press(Button.DpadDown);
  expect(await focusedItem()).toMatch(label);
  await press(Button.A);
  await expect(menu).toHaveCount(0);
}

/** The element the browser put in its picture-in-picture window, read from the injected script's world. */
const pipElement = () => spatialEval("document.pictureInPictureElement ? document.pictureInPictureElement.id : null");

const sendMediaKey = (keyCode: string) => app.evaluate(({ webContents }, code) => {
  const wc = webContents.getAllWebContents().find((w) => w.getURL() === "about:blank");
  wc?.sendInputEvent({ type: "keyDown", keyCode: code });
  wc?.sendInputEvent({ type: "keyUp", keyCode: code });
}, keyCode);

/** 0.25 s of silence as a WAV data URI: real playback without a file, the network or a video codec. */
function silence(): string {
  const rate = 8000;
  const samples = 2000;
  const bytes = Buffer.alloc(44 + samples);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + samples, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate, 28);
  bytes.writeUInt16LE(1, 32);
  bytes.writeUInt16LE(8, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(samples, 40);
  bytes.fill(0x80, 44);
  return `data:audio/wav;base64,${bytes.toString("base64")}`;
}

const WAV = silence();

/** A looping video element that really plays, carried by the silent WAV. */
const video = (muted: boolean) => `(() => {
  const video = document.createElement('video');
  video.id = 'video';
  video.muted = ${muted};
  video.loop = true;
  video.src = ${JSON.stringify(WAV)};
  window.events = [];
  video.addEventListener('play', () => window.events.push('play'));
  video.addEventListener('pause', () => window.events.push('pause'));
  document.body.appendChild(video);
  void video.play();
  return 'ok';
})()`;

/** A focused button that records its click, for the focus-activation cases. */
const focusedButton = `(() => {
  const button = document.createElement('button');
  button.textContent = 'Continue';
  button.onclick = () => { window.clicked = true; };
  document.body.appendChild(button);
  button.focus();
  return document.activeElement === button;
})()`;

/** A video with real frames, from a canvas capture stream: a picture-in-picture window needs video, not just audio. */
const CANVAS_VIDEO = `(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 180;
  canvas.getContext('2d').fillRect(0, 0, 320, 180);
  const video = document.createElement('video');
  video.id = 'video';
  video.muted = true;
  video.srcObject = canvas.captureStream(10);
  document.body.appendChild(video);
  void video.play();
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

/**
 * The injected script runs in its own world, so the spies have to live there too: a page-world override is invisible
 * to it. Each spy records the call and then does the real work.
 */
const recordPlayback = () => spatialEval(`(() => {
  window.calls = [];
  const play = HTMLMediaElement.prototype.play;
  const pause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.play = function (...args) { window.calls.push('play'); return play.apply(this, args); };
  HTMLMediaElement.prototype.pause = function (...args) { window.calls.push('pause'); return pause.apply(this, args); };
  return 'ok';
})()`);

test("A pauses the video that is playing", async () => {
  await installPad();
  await pageEval(video(false));
  await expect.poll(() => pageEval("document.getElementById('video').paused"), { timeout: 5_000 }).toBe(false);
  await playingAudio().toBe(true);
  await recordPlayback();

  await press(Button.A);
  await expect.poll(() => pageEval("document.getElementById('video').paused"), { timeout: 5_000 }).toBe(true);
  expect(await spatialEval("window.calls")).toEqual(["pause"]);
  expect(await pageEval("window.events")).toEqual(["play", "pause"]);
});

test("A leaves a muted background video alone and activates the focused element", async () => {
  await installPad();
  await pageEval(video(true));
  await expect.poll(() => pageEval("document.getElementById('video').paused"), { timeout: 5_000 }).toBe(false);
  await pageEval(focusedButton);
  await recordPlayback();

  await press(Button.A);
  await expect.poll(() => pageEval("window.clicked ?? false"), { timeout: 5_000 }).toBe(true);
  expect(await pageEval("document.getElementById('video').paused")).toBe(false);
  expect(await spatialEval("window.calls")).toEqual([]);
});

test("a page with no media never runs the media action", async () => {
  await installPad();
  await pageEval(focusedButton);
  // The spy answers "media": if the tab gate let the round trip through, A would stop there instead of clicking.
  await spatialEval("(() => { window.calls = 0; window.__joy.playPause = () => { window.calls += 1; return 'media'; }; return 'ok'; })()");

  await press(Button.A);
  await expect.poll(() => pageEval("window.clicked ?? false"), { timeout: 5_000 }).toBe(true);
  expect(await spatialEval("window.calls")).toBe(0);
});

test("the media keys play, pause and skip tracks", async () => {
  await pageEval(video(false));
  await pageEval(TRACK_BUTTONS);
  await expect.poll(() => pageEval("document.getElementById('video').paused"), { timeout: 5_000 }).toBe(false);

  await sendMediaKey("MediaPlayPause");
  await expect.poll(() => pageEval("document.getElementById('video').paused"), { timeout: 5_000 }).toBe(true);
  await sendMediaKey("MediaPlayPause");
  await expect.poll(() => pageEval("document.getElementById('video').paused"), { timeout: 5_000 }).toBe(false);

  // sendInputEvent takes the native key identifier; the page receives the DOM key (MediaTrackNext).
  await sendMediaKey("MediaNextTrack");
  await expect.poll(() => pageEval("window.skipped.next"), { timeout: 5_000 }).toBe(1);
  await sendMediaKey("MediaPreviousTrack");
  await expect.poll(() => pageEval("window.skipped.previous"), { timeout: 5_000 }).toBe(1);
});

test("the quick menu skips tracks from the controller", async () => {
  await installPad();
  await pageEval(video(false));
  await pageEval(TRACK_BUTTONS);

  await runMenuItem(/Next track|Próxima faixa/);
  await expect.poll(() => pageEval("window.skipped.next"), { timeout: 5_000 }).toBe(1);
});

test("the quick menu opens and closes picture-in-picture", async () => {
  await installPad();
  await pageEval(CANVAS_VIDEO);
  await expect.poll(() => pageEval("document.getElementById('video').readyState"), { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  expect(await pipElement()).toBeNull();

  await runMenuItem(/Picture-in-picture/);
  await expect.poll(pipElement, { timeout: 10_000 }).toBe("video");

  // The same item closes the window that is already open, instead of asking the page for a second one.
  await runMenuItem(/Picture-in-picture/);
  await expect.poll(pipElement, { timeout: 10_000 }).toBeNull();
});

test("picture-in-picture on a page with no video changes nothing", async () => {
  await installPad();
  await pageEval(focusedButton);

  expect(await spatialEval("window.__joy.mediaPictureInPicture()")).toBe(false);
  await runMenuItem(/Picture-in-picture/);

  expect(await pipElement()).toBeNull();
  expect(await pageEval("document.activeElement.tagName")).toBe("BUTTON");
  expect(await spatialEval("typeof window.__joy")).toBe("object");
});
