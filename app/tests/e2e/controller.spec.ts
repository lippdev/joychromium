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

// ---- Text fields, the controller keyboard and the toolbar, with the D-pad only ----

const Pad = { A: 0, B: 1, Up: 12, Down: 13, Left: 14, Right: 15 } as const;
const FORM = `<title>Form</title><body style="font:20px sans-serif;padding:40px"><a href="#a">Link one</a><br><br>` +
  `<input id="q" style="width:400px;font-size:20px"><br><br><a href="#b">Link two</a></body>`;

/** A page with a link, a wide text field under it and another link, served locally (the CI has no network). */
async function openForm(): Promise<void> {
  await app.evaluate(({ protocol }, page) => {
    protocol.handle("https", () => new Response(page, { headers: { "content-type": "text/html" } }));
  }, FORM);
  await app.evaluate(() => globalThis.joy.command({ type: "navigate", url: "https://form.example/" } as never));
  await expect.poll(async () => {
    const tab = (await tabs()).find((t) => t.isActive);
    return tab?.url === "https://form.example/" && !tab.isLoading;
  }, { timeout: 30_000 }).toBe(true);
}

// The D-pad ignores a second direction inside its repeat gate (gamepad.ts), so each step waits it out.
const step = async (button: number) => { await press(0, button); await chrome.waitForTimeout(200); };
const pageFocus = () => app.evaluate(() => globalThis.joy.pageEval("document.activeElement && (document.activeElement.id || document.activeElement.textContent.trim())"));
const shellFocus = () => chrome.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  return el ? el.id || el.getAttribute("aria-label") || (el.textContent ?? "").trim() : "";
});
const shellHasWindowFocus = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.isFocused());
const keyboards = () => chrome.locator("#keyboard").count();

test("A on a text field opens the controller keyboard, which the D-pad walks, every time", async () => {
  await installPads([XBOX]);
  await openForm();
  // As after the keyboard was used once: the tab holds the window's focus. That is when the keys used to look dead.
  await app.evaluate(({ BrowserWindow, webContents }) => {
    const shell = BrowserWindow.getAllWindows()[0]!.webContents;
    webContents.getAllWebContents().find((wc) => wc !== shell)!.focus();
  });

  // The first press takes the first item; the wide field under a short link is the next stop down.
  await step(Pad.Down);
  await expect.poll(pageFocus).toBe("Link one");
  await step(Pad.Down);
  await expect.poll(pageFocus).toBe("q");
  // Walking onto a field does not pop the keyboard up: A does.
  expect(await keyboards()).toBe(0);

  await step(Pad.A);
  await expect(chrome.locator("#keyboard")).toBeVisible();
  await expect.poll(shellHasWindowFocus).toBe(true);
  // The first press lands on the first key, not on the close button; A types into the page's field.
  await step(Pad.Right);
  await expect.poll(shellFocus).toBe("q");
  await step(Pad.Right);
  await expect.poll(shellFocus).toBe("w");
  await step(Pad.A);
  await expect.poll(() => app.evaluate(() => globalThis.joy.pageEval("document.getElementById('q').value"))).toBe("w");

  // B closes it and hands the focus back to the page; the second time works like the first.
  await step(Pad.B);
  await expect.poll(keyboards).toBe(0);
  await step(Pad.A);
  await expect(chrome.locator("#keyboard")).toBeVisible();
  await expect.poll(shellHasWindowFocus).toBe(true);
  await step(Pad.Down);
  await expect.poll(shellFocus).toBe("q");
});

test("up from the top of the page reaches the toolbar and the tabs, and down comes back", async () => {
  await installPads([XBOX]);
  await openForm();
  await step(Pad.Down);
  await expect.poll(pageFocus).toBe("Link one");

  // Nothing above and the page at its top: the address field takes the focus, without opening the keyboard.
  await step(Pad.Up);
  await expect.poll(shellFocus).toBe("address");
  await expect.poll(shellHasWindowFocus).toBe(true);
  expect(await keyboards()).toBe(0);

  // A on the field opens the keyboard; B closes it and the D-pad is still on the toolbar.
  await step(Pad.A);
  await expect(chrome.locator("#keyboard")).toBeVisible();
  await step(Pad.B);
  await expect.poll(keyboards).toBe(0);
  await expect.poll(shellFocus).toBe("address");

  // Left reaches the reload button, up the tab strip.
  await step(Pad.Left);
  await expect.poll(shellFocus).toMatch(/Recarregar|Reload/);
  await step(Pad.Up);
  await expect.poll(() => chrome.evaluate(() => Boolean(document.activeElement?.closest(".tabstrip")))).toBe(true);

  // Down twice: the toolbar, then the page again.
  await step(Pad.Down);
  await expect.poll(() => chrome.evaluate(() => Boolean(document.activeElement?.closest(".bar")))).toBe(true);
  await step(Pad.Down);
  await expect.poll(shellHasWindowFocus).toBe(false);
  expect(await chrome.evaluate(() => document.activeElement === document.body)).toBe(true);
});

// ---- The stick's pointer, its clicks and the right stick's wheel ----

/** A focusable button on top and, under it, a tall area that logs every mouse press and context menu it gets. */
const POINTER_PAGE = `<title>Pointer</title><body style="margin:0;font:20px sans-serif">` +
  `<button id="b" style="margin:20px" onclick="window.__log.push('button')">Focus me</button>` +
  `<div id="area" style="height:4000px;background:#eee"></div>` +
  `<script>window.__log = [];` +
  `addEventListener('mousedown', (e) => { if (e.target.id === 'area') __log.push('down' + e.button); });` +
  `addEventListener('contextmenu', (e) => { e.preventDefault(); __log.push('context'); });</script></body>`;

const tilt = (axis: number, value: number) => chrome.evaluate(([a, v]) => {
  (window as unknown as { __pads: { axes: number[] }[] }).__pads[0]!.axes[a] = v;
}, [axis, value] as const);
const pageLog = () => app.evaluate(() => globalThis.joy.pageEval("window.__log.join(',')")) as Promise<string>;
const pointerShown = () => app.evaluate(() => globalThis.joy.pageEval("(document.getElementById('__joy-cursor') || {}).style?.display === 'block'"));

test("the left stick points and A clicks there, twice for a right click, and the D-pad takes A back", async () => {
  await installPads([XBOX]);
  await app.evaluate(({ protocol }, page) => {
    protocol.handle("https", () => new Response(page, { headers: { "content-type": "text/html" } }));
  }, POINTER_PAGE);
  await app.evaluate(() => globalThis.joy.command({ type: "navigate", url: "https://pointer.example/" } as never));
  await expect.poll(async () => {
    const tab = (await tabs()).find((t) => t.isActive);
    return tab?.url === "https://pointer.example/" && !tab.isLoading;
  }, { timeout: 30_000 }).toBe(true);

  // Spatial is the default mode: the stick still brings the pointer up, over the area.
  await tilt(1, 1);
  await expect.poll(pointerShown, { timeout: 10_000 }).toBe(true);
  await chrome.waitForTimeout(300);
  await tilt(1, 0);

  // One A is a left click where the pointer is (after the short wait for a second press).
  await press(0, Pad.A);
  await expect.poll(pageLog, { timeout: 5_000 }).toBe("down0");
  // Two quick ones are a right click, and no left click on the way.
  await press(0, Pad.A);
  await press(0, Pad.A);
  await expect.poll(pageLog, { timeout: 5_000 }).toBe("down0,down2,context");

  // The D-pad takes A over: A presses what the D-pad focused, not the spot under the pointer, which stays on screen.
  await step(Pad.Down);
  await expect.poll(pageFocus).toBe("b");
  expect(await pointerShown()).toBe(true);
  await step(Pad.A);
  await expect.poll(pageLog).toBe("down0,down2,context,button");

  // The right stick is the wheel.
  expect(await app.evaluate(() => globalThis.joy.pageEval("scrollY"))).toBe(0);
  await tilt(3, 1);
  await expect.poll(() => app.evaluate(() => globalThis.joy.pageEval("scrollY")) as Promise<number>, { timeout: 10_000 }).toBeGreaterThan(0);
  await tilt(3, 0);
});

test("the keyboard's own shortcuts: Y space, LT shift, X delete, LS the layer, and none of them leaves the page", async () => {
  await installPads([XBOX]);
  await openForm();
  await step(Pad.Down);
  await step(Pad.Down);
  await expect.poll(pageFocus).toBe("q");
  await step(Pad.A);
  await expect(chrome.locator("#keyboard")).toBeVisible();
  const value = () => app.evaluate(() => globalThis.joy.pageEval("document.getElementById('q').value"));

  // The first press lands on "q"; A types it, Y adds a space, LT makes the next letter a capital.
  await step(Pad.Right);
  await expect.poll(shellFocus).toBe("q");
  await step(Pad.A);
  await step(3); // Y
  await step(6); // LT
  await step(Pad.A);
  await expect.poll(value).toBe("q Q");
  // X deletes, and it does not reload the page under the keyboard as it does when no keyboard is open.
  await step(2); // X
  await expect.poll(value).toBe("q ");
  expect((await tabs()).find((t) => t.isActive)?.url).toBe("https://form.example/");
  // The left stick's click goes to the symbols, then the accents, then back to the letters.
  const layerKey = () => chrome.locator('#keyboard [data-pad="layer"] .key-label').textContent();
  expect(await layerKey()).toBe("&123");
  await step(10); // LS
  await expect.poll(layerKey).toBe("áç");
  await step(10);
  await expect.poll(layerKey).toBe("abc");
});

test("a new tab opens on the address field with the keyboard up, and the D-pad types there", async () => {
  await installPads([XBOX]);
  await app.evaluate(() => globalThis.joy.command({ type: "new-tab" } as never));
  await expect(chrome.locator("#keyboard")).toBeVisible();
  await expect.poll(shellFocus).toBe("address");
  await expect.poll(shellHasWindowFocus).toBe(true);
  // The first press goes into the keys, at "q"; A types it into the address.
  await step(Pad.Right);
  await expect.poll(shellFocus).toBe("q");
  await step(Pad.A);
  await expect.poll(() => chrome.locator("#address").inputValue()).toBe("q");
});

test("the pointer is an arrow, and a hand over what can be clicked", async () => {
  await app.evaluate(({ protocol }, page) => {
    protocol.handle("https", () => new Response(page, { headers: { "content-type": "text/html" } }));
  }, POINTER_PAGE);
  await app.evaluate(() => globalThis.joy.command({ type: "navigate", url: "https://pointer.example/" } as never));
  await expect.poll(async () => {
    const tab = (await tabs()).find((t) => t.isActive);
    return tab?.url === "https://pointer.example/" && !tab.isLoading;
  }, { timeout: 30_000 }).toBe(true);
  const shapeAt = async (where: string) => {
    await app.evaluate(({}, code) => globalThis.joy.spatialEval(code), `(() => { const r = ${where}.getBoundingClientRect(); window.__joyCursor.show(true, r.left + r.width / 2, r.top + r.height / 2); })()`);
    // The hand is the shape with fingers: its path starts at the fingertip.
    return app.evaluate(() => globalThis.joy.pageEval("document.getElementById('__joy-cursor').style.backgroundImage.includes('M10%201.6') ? 'hand' : 'arrow'"));
  };
  expect(await shapeAt("document.getElementById('area')")).toBe("arrow");
  expect(await shapeAt("document.getElementById('b')")).toBe("hand");
});

test("the pointer is on every page from the start, and stays where it was when the page changes", async () => {
  await app.evaluate(({ protocol }, page) => {
    protocol.handle("https", () => new Response(page, { headers: { "content-type": "text/html" } }));
  }, POINTER_PAGE);
  const open = async (url: string) => {
    await app.evaluate(({}, u) => globalThis.joy.command({ type: "navigate", url: u } as never), url);
    await expect.poll(async () => {
      const tab = (await tabs()).find((t) => t.isActive);
      return tab?.url === url && !tab.isLoading;
    }, { timeout: 30_000 }).toBe(true);
  };
  const where = () => app.evaluate(() => globalThis.joy.pageEval("document.getElementById('__joy-cursor')?.style.transform ?? ''")) as Promise<string>;
  // No stick touched: the pointer is already there, in the middle of the page.
  await open("https://one.example/");
  await expect.poll(pointerShown, { timeout: 10_000 }).toBe(true);
  const first = await where();
  // Another page: the pointer is drawn again, at the same spot.
  await open("https://two.example/");
  await expect.poll(pointerShown, { timeout: 10_000 }).toBe(true);
  await expect.poll(where).toBe(first);
});

test("after a mouse click, the key the D-pad reaches is still lit", async () => {
  await installPads([XBOX]);
  // A mouse click first: from then on Chromium stops drawing :focus-visible for focus moved by script.
  await chrome.locator(".new-tab").click();
  await expect(chrome.locator("#keyboard")).toBeVisible();
  await step(Pad.Right);
  await expect.poll(shellFocus).toBe("q");
  // The selected key turns the text colour (white on the dark themes), not the grey of the other keys.
  const lit = () => chrome.evaluate(() => getComputedStyle(document.activeElement as Element).backgroundColor === getComputedStyle(document.body).color);
  await expect.poll(lit).toBe(true);
  await step(Pad.Right);
  await expect.poll(shellFocus).toBe("w");
  await expect.poll(lit).toBe(true);
});
