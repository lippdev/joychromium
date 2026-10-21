import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// PRD section 3's acceptance journeys, end to end. Every step that a viewer would take on the couch is a press on a
// synthetic pad in the slot the Gamepad API uses, so the shell's real polling loop, the input router and the page
// scripts all run; nothing here clicks a button or calls a shell command. Each test gets a fresh profile, so no journey
// inherits state from another (the first one starts at the real first boot).
//
// The two focus movers are driven, not imitated: to reach a target the test asks the surface which direction the app
// itself would take and presses that one. The page planner mirrors `src/assets/spatial.js` (the script the tab preload
// injects) and the overlay planner mirrors `moveOverlayFocus` in `src/renderer/shell/gamepad.ts`; both are recomputed
// after each press, so a page that scrolls or re-renders still gets walked correctly.

const Pad = { A: 0, B: 1, X: 2, Y: 3, Start: 9, Up: 12, Down: 13, Left: 14, Right: 15 } as const;

type Direction = "up" | "down" | "left" | "right";
const DPAD: Record<Direction, number> = { up: Pad.Up, down: Pad.Down, left: Pad.Left, right: Pad.Right };

interface Plan {
  same: boolean;
  missing: boolean;
  dirs: Direction[];
}

interface Harness {
  data: string;
  app: ElectronApplication;
  chrome: Page;
}

interface Fixture {
  settings?: Record<string, unknown>;
  history?: { url: string; title: string; visitedUtc: string }[];
  /** Extra Chromium switches, for the parts of a journey the machine has no hardware for. */
  args?: string[];
}

let current: Harness | undefined;

test.afterEach(async () => {
  await current?.app.close().catch(() => undefined);
  if (current) rmSync(current.data, { recursive: true, force: true });
  current = undefined;
});

async function launch(fixture: Fixture = {}): Promise<Harness> {
  const data = mkdtempSync(join(tmpdir(), "joychromium-journey-"));
  if (fixture.settings) writeFileSync(join(data, "settings.json"), JSON.stringify(fixture.settings));
  if (fixture.history) writeFileSync(join(data, "history.jsonl"), fixture.history.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  const app = await electron.launch({ args: [".", ...(fixture.args ?? [])], env: { ...process.env, JOYCHROMIUM_DATA: data } });
  const chrome = await app.firstWindow();
  await expect.poll(() => app.evaluate(() => globalThis.joy.tabs().length), { timeout: 30_000 }).toBeGreaterThan(0);
  current = { data, app, chrome };
  return current;
}

/** The desktop profile every journey after the first boot starts from. */
// The new tab only shows sites the user added, so the journeys start with one shortcut of their own.
const SETTLED = {
  onboardingCompleted: true, startup: "NewTab", windowMode: "tv", language: "en",
  shortcuts: [{ name: "YouTube TV", url: "https://www.youtube.com/tv" }],
} as const;

const tabs = (h: Harness) => h.app.evaluate(() => globalThis.joy.tabs());
const activeTab = async (h: Harness) => (await tabs(h)).find((tab) => tab.isActive);
const activeUrl = async (h: Harness) => (await activeTab(h))?.url;
const pageEval = <T>(h: Harness, script: string) => h.app.evaluate(({}, code) => globalThis.joy.pageEval(code), script) as Promise<T>;

/** A pad in the slot the shell polls, and nothing else: the loop, the router and the page scripts are the app's own. */
async function installPad(h: Harness): Promise<void> {
  await h.chrome.evaluate(() => {
    const pad = {
      index: 0, id: "Xbox Wireless Controller", mapping: "standard", connected: true, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    (navigator as unknown as { getGamepads: () => unknown[] }).getGamepads = () => [pad];
  });
}

async function press(h: Harness, button: number, hold = 150): Promise<void> {
  const set = (pressed: boolean) => h.chrome.evaluate(([index, is]) => {
    (window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad.buttons[index].pressed = is;
  }, [button, pressed]);
  await set(true);
  await new Promise((resolve) => setTimeout(resolve, hold));
  await set(false);
  await new Promise((resolve) => setTimeout(resolve, 220));
}

async function move(h: Harness, direction: Direction): Promise<void> {
  await press(h, DPAD[direction]);
}

/** Serves every https request with a local document: a real origin and a real page, no network. */
async function serveHttps(h: Harness, html: string): Promise<void> {
  await h.app.evaluate(({ protocol }, page) => {
    protocol.handle("https", () => new Response(page, { headers: { "content-type": "text/html" } }));
  }, html);
}

async function waitForPage(h: Harness, ready: string, timeout = 30_000): Promise<void> {
  await expect.poll(() => pageEval<boolean>(h, ready), { timeout }).toBe(true);
}

// ---- Focus drivers ----

const BOX = `const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; };`;

/** Mirrors moveOverlayFocus in renderer/shell/gamepad.ts, the way the shell walks its own dialogs. */
const OVERLAY_PLAN = (expr: string) => `(() => {
  ${BOX}
  const group = document.querySelector('.overlay[role="dialog"]') || document.body;
  const buttons = Array.from(group.querySelectorAll('button:not([disabled])'));
  const target = (${expr});
  const targetIndex = target ? buttons.indexOf(target) : -1;
  if (targetIndex < 0) return { same: false, missing: true, dirs: [] };
  const best = (current, direction) => {
    if (!current) return buttons[0] || null;
    const rect = current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let found = null;
    let bestScore = Infinity;
    for (const button of buttons) {
      if (button === current) continue;
      const r = button.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx;
      const dy = r.top + r.height / 2 - cy;
      const ahead = direction === 'up' ? -dy : direction === 'down' ? dy : direction === 'left' ? -dx : dx;
      if (ahead <= 4) continue;
      const off = direction === 'up' || direction === 'down' ? Math.abs(dx) : Math.abs(dy);
      const score = ahead + off * 2;
      if (score < bestScore) { found = button; bestScore = score; }
    }
    return found;
  };
  const start = buttons.indexOf(document.activeElement);
  const prev = new Map();
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const at = queue.shift();
    if (at === targetIndex) break;
    for (const direction of ['up', 'down', 'left', 'right']) {
      const next = best(at >= 0 ? buttons[at] : null, direction);
      const index = next ? buttons.indexOf(next) : -1;
      if (index < 0 || seen.has(index)) continue;
      seen.add(index);
      prev.set(index, { from: at, direction });
      queue.push(index);
    }
  }
  if (!seen.has(targetIndex)) return { same: false, missing: false, dirs: [] };
  const dirs = [];
  for (let at = targetIndex; at !== start;) { const step = prev.get(at); dirs.unshift(step.direction); at = step.from; }
  return { same: start === targetIndex, missing: false, dirs };
})()`;

/** Mirrors the focus walk of src/assets/spatial.js, the script the tab preload puts in every frame. */
const PAGE_PLAN = (expr: string) => `(() => {
  ${BOX}
  const SELECTOR = 'a[href], button, iframe:not([tabindex="-1"]), input:not([type=hidden]), select, textarea, summary, [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"], [contenteditable="true"], video[controls], audio[controls]';
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none' && !el.matches('a,button')) return false;
    if (el.disabled || el.getAttribute('aria-hidden') === 'true') return false;
    return true;
  };
  const inViewport = (r) => r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  const candidates = () => Array.from(document.querySelectorAll(SELECTOR)).filter(visible);
  const focused = () => {
    const a = document.activeElement;
    if (a && a !== document.body && a !== document.documentElement && visible(a)) return a;
    return null;
  };
  const viewportCenter = () => ({ left: innerWidth / 2, top: innerHeight / 2, right: innerWidth / 2, bottom: innerHeight / 2, width: 0, height: 0 });
  const pick = (fr, dir, from) => {
    const fc = { x: fr.left + fr.width / 2, y: fr.top + fr.height / 2 };
    let best = null;
    let bestScore = Infinity;
    for (const el of candidates()) {
      if (el === from) continue;
      const r = el.getBoundingClientRect();
      if (!inViewport(r)) continue;
      const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      let ahead, off;
      switch (dir) {
        case 'up': ahead = fr.top - r.bottom; off = Math.abs(c.x - fc.x); break;
        case 'down': ahead = r.top - fr.bottom; off = Math.abs(c.x - fc.x); break;
        case 'left': ahead = fr.left - r.right; off = Math.abs(c.y - fc.y); break;
        default: ahead = r.left - fr.right; off = Math.abs(c.y - fc.y); break;
      }
      if (ahead < -Math.min(r.height, r.width) / 2) continue;
      const overlap = dir === 'up' || dir === 'down'
        ? Math.max(0, Math.min(r.right, fr.right) - Math.max(r.left, fr.left))
        : Math.max(0, Math.min(r.bottom, fr.bottom) - Math.max(r.top, fr.top));
      const score = Math.max(0, ahead) + off * (overlap > 0 ? 0.6 : 2.2);
      if (score < bestScore) { best = el; bestScore = score; }
    }
    return best;
  };
  const target = (${expr});
  if (!target || !visible(target)) return { same: false, missing: true, dirs: [] };
  const list = candidates();
  const targetIndex = list.indexOf(target);
  if (targetIndex < 0) return { same: false, missing: true, dirs: [] };
  const startElement = focused();
  const start = startElement ? list.indexOf(startElement) : -1;
  const next = (at, direction) => {
    const element = at >= 0 ? list[at] : null;
    const rect = element ? element.getBoundingClientRect() : viewportCenter();
    const found = pick(rect, direction, element);
    return found ? list.indexOf(found) : -1;
  };
  const prev = new Map();
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const at = queue.shift();
    if (at === targetIndex) break;
    for (const direction of ['up', 'down', 'left', 'right']) {
      const index = next(at, direction);
      if (index < 0 || seen.has(index)) continue;
      seen.add(index);
      prev.set(index, { from: at, direction });
      queue.push(index);
    }
  }
  if (!seen.has(targetIndex)) return { same: false, missing: false, dirs: [] };
  const dirs = [];
  for (let at = targetIndex; at !== start;) { const step = prev.get(at); dirs.unshift(step.direction); at = step.from; }
  return { same: start === targetIndex, missing: false, dirs };
})()`;

type Surface = "shell" | "page";

async function plan(h: Harness, surface: Surface, expr: string): Promise<Plan> {
  const script = surface === "shell" ? OVERLAY_PLAN(expr) : PAGE_PLAN(expr);
  return (surface === "shell" ? h.chrome.evaluate(script) : pageEval(h, script)) as Promise<Plan>;
}

/** The direction that at least gets closer to a target the current viewport cannot reach (a long page scrolls). */
async function toward(h: Harness, surface: Surface, expr: string): Promise<Direction> {
  const script = `(() => {
    ${BOX}
    const target = (${expr});
    if (!target) return 'down';
    const t = box(target);
    const active = document.activeElement;
    const a = active && active !== document.body ? box(active) : { cx: innerWidth / 2, cy: innerHeight / 2 };
    const dx = t.cx - a.cx;
    const dy = t.cy - a.cy;
    if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? 'up' : 'down';
    return dx < 0 ? 'left' : 'right';
  })()`;
  return (surface === "shell" ? h.chrome.evaluate(script) : pageEval(h, script)) as Promise<Direction>;
}

/** Walks the D-pad to the element, one press at a time, re-planning from wherever the focus actually landed. */
async function focusOn(h: Harness, surface: Surface, expr: string, label: string, maxSteps = 80): Promise<void> {
  for (let step = 0; step < maxSteps; step++) {
    const result = await plan(h, surface, expr);
    if (result.same) return;
    if (result.missing) throw new Error(`the ${surface} has no ${label}`);
    if (result.dirs.length === 0) {
      await move(h, await toward(h, surface, expr));
      continue;
    }
    await move(h, result.dirs[0]);
  }
  throw new Error(`the D-pad did not reach ${label} on the ${surface}`);
}

/** Types on the controller keyboard, and submits with OK unless the caller wants the suggestions first. */
async function typeOnKeyboard(h: Harness, text: string, submit = true): Promise<void> {
  const key = (label: string) => `[...document.querySelectorAll('#keyboard .key')].find((k) => k.textContent.trim() === ${JSON.stringify(label)})`;
  for (const character of text) {
    await focusOn(h, "shell", key(character), `key ${character}`);
    await press(h, Pad.A);
  }
  if (!submit) return;
  await focusOn(h, "shell", `[...document.querySelectorAll('#keyboard .key.primary')][0]`, "OK");
  await press(h, Pad.A);
}

test("first boot: onboarding tests the controller, then language and search engine, then the home screen", async () => {
  const h = await launch();
  // TV mode is the default: the window is fullscreen before anything else is on screen.
  expect(await h.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen())).toBe(true);

  await expect.poll(() => activeUrl(h), { timeout: 30_000 }).toBe("joychromium://welcome");
  await waitForPage(h, "document.querySelectorAll('#languages .opt').length >= 2");

  // The controller test: the shell's poll sees the pad and the page reports it.
  await installPad(h);
  await expect.poll(() => pageEval<boolean>(h, "document.getElementById('pad').classList.contains('found')"), { timeout: 15_000 }).toBe(true);
  // The profile is still in its default language until the next step chooses one.
  expect(await pageEval<string>(h, "document.getElementById('padText').textContent")).toBe("Controle encontrado · Xbox");

  // Language: D-pad to English, A to choose it.
  await focusOn(h, "page", `[...document.querySelectorAll('#languages .opt')].find((b) => b.textContent.trim() === 'English')`, "English");
  await press(h, Pad.A);
  await expect.poll(() => pageEval<string>(h, "document.documentElement.lang")).toBe("en");
  await expect.poll(() => h.chrome.evaluate(() => document.documentElement.lang)).toBe("en");

  // Theme and new-tab steps are just Next; the search engine is the second choice the scenario asks for.
  await focusOn(h, "page", "document.getElementById('next')", "Next");
  await press(h, Pad.A);
  await expect.poll(() => pageEval<string>(h, "document.querySelector('.step.show').dataset.step")).toBe("1");
  await expect.poll(() => pageEval<string>(h, "document.getElementById('next').textContent")).toBe("Next");
  await focusOn(h, "page", "document.getElementById('next')", "Next");
  await press(h, Pad.A);
  await expect.poll(() => pageEval<string>(h, "document.querySelector('.step.show').dataset.step")).toBe("2");
  await focusOn(h, "page", `[...document.querySelectorAll('#engines .opt')].find((b) => b.textContent.includes('DuckDuckGo'))`, "DuckDuckGo");
  await press(h, Pad.A);

  const saved = () => JSON.parse(readFileSync(join(h.data, "settings.json"), "utf8"));
  await expect.poll(() => saved().searchEngine?.name).toBe("DuckDuckGo");

  await focusOn(h, "page", "document.getElementById('next')", "Next"); // Next: the new-tab step
  await press(h, Pad.A);
  await expect.poll(() => pageEval<string>(h, "document.querySelector('.step.show').dataset.step")).toBe("3");
  await focusOn(h, "page", "document.getElementById('next')", "Next"); // Next: the summary
  await press(h, Pad.A);
  await expect.poll(() => pageEval<string>(h, "document.querySelector('.step.show').dataset.step")).toBe("4");
  await focusOn(h, "page", "document.getElementById('next')", "Start");
  await press(h, Pad.A);

  // The home screen, with the choices the onboarding made already saved.
  await expect.poll(() => activeUrl(h), { timeout: 30_000 }).toBe("joychromium://newtab");
  // A fresh profile has no sites of its own yet: the page is ready when it shows the engine onboarding picked.
  await waitForPage(h, "document.getElementById('engine').textContent === 'DuckDuckGo'");
  await expect.poll(() => saved().onboardingCompleted).toBe(true);
  expect(saved().language).toBe("en");
  expect(saved().searchEngine.name).toBe("DuckDuckGo");
});

const PLAYER = `<!doctype html><meta charset="utf-8"><title>YouTube TV</title>
<style>body{margin:0;background:#000;color:#fff;font:24px sans-serif}#stage{position:absolute;inset:0}#watch{position:absolute;left:80px;top:80px;width:360px;height:120px;font-size:32px}</style>
<div id="stage"><button id="watch" autofocus>Watch</button><video id="video" muted loop playsinline></video></div>
<script>
window.events = [];
async function watch() {
  window.events.push('watch');
  document.getElementById('video').play().catch(() => {});
  try { await document.getElementById('stage').requestFullscreen(); window.events.push('fullscreen'); }
  catch (error) { window.events.push('fullscreen-failed:' + error.message); }
}
document.getElementById('watch').addEventListener('click', watch);
addEventListener('keydown', (event) => { if (event.key === 'Enter') watch(); });
document.addEventListener('fullscreenchange', () => window.events.push(document.fullscreenElement ? 'enter' : 'leave'));
</script>`;

test("home to YouTube TV in Arrows mode, a video in fullscreen, and B back to the home screen", async () => {
  const h = await launch({ settings: { ...SETTLED } });
  await waitForPage(h, "document.querySelectorAll('#sites .card').length > 0");
  await serveHttps(h, PLAYER);
  await installPad(h);

  // Home screen: down from the search field into the app cards, then along the row to the YouTube TV tile.
  await move(h, "down");
  for (let i = 0; i < 8; i++) {
    const title = await pageEval<string>(h, "(() => (document.activeElement && document.activeElement.title) || '')()");
    if (title === "https://www.youtube.com/tv") break;
    await move(h, "left");
  }
  expect(await pageEval<string>(h, "(() => (document.activeElement && document.activeElement.title) || '')()")).toBe("https://www.youtube.com/tv");
  await press(h, Pad.A);
  await expect.poll(() => activeUrl(h), { timeout: 30_000 }).toBe("https://www.youtube.com/tv");
  await waitForPage(h, "document.readyState === 'complete' && Boolean(document.getElementById('watch'))");

  // A host with its own arrow-key navigation gets the D-pad, not the spatial walker.
  await expect.poll(() => h.chrome.locator(".status-line .mode").textContent()).toBe("ARROWS");
  expect(await pageEval<string>(h, "document.activeElement.id")).toBe("watch");

  // A: the page's own Enter handler starts the video and takes the screen.
  await press(h, Pad.A);
  await expect.poll(() => pageEval<string>(h, "String(document.fullscreenElement && document.fullscreenElement.id)"), { timeout: 15_000 }).toBe("stage");
  expect(await pageEval<string[]>(h, "window.events")).toContain("enter");
  await expect.poll(() => h.chrome.locator(".shell").getAttribute("class")).toContain("chrome-hidden");

  // B leaves the video: the shell navigates back even with the page covering its renderer.
  await press(h, Pad.B);
  await expect.poll(() => activeUrl(h), { timeout: 30_000 }).toBe("joychromium://newtab");
  await expect.poll(() => h.chrome.locator(".shell").getAttribute("class")).not.toContain("chrome-hidden");
});

const WEATHER = `<!doctype html><meta charset="utf-8"><title>Weather</title>
<style>body{margin:0;background:#101820;color:#fff;font:24px sans-serif}a,button{position:absolute;left:60px;width:360px;height:88px;font-size:28px}</style>
<h1>Weather</h1>
<a id="today" href="https://tempo.example/today" style="top:120px">Today</a>
<a id="tomorrow" href="https://tempo.example/tomorrow" style="top:240px">Tomorrow</a>
<button id="details" style="top:360px">Details</button>`;

test("searching with the virtual keyboard and its suggestions, then opening the result and walking it in Spatial mode", async () => {
  const h = await launch({
    settings: { ...SETTLED },
    history: [{ url: "https://tempo.example/previsao", title: "Previsão do tempo — INMET", visitedUtc: "2026-10-19T12:00:00.000Z" }],
  });
  await waitForPage(h, "document.getElementById('q') !== null");
  await serveHttps(h, WEATHER);
  await installPad(h);

  // Y opens the controller keyboard; on the home screen it starts a search, not the internal URL.
  await press(h, Pad.Y);
  await expect.poll(() => h.chrome.locator("#keyboard").isVisible(), { timeout: 15_000 }).toBe(true);
  expect(await h.chrome.locator("#address").inputValue()).toBe("");

  await typeOnKeyboard(h, "previsao", false);
  expect(await h.chrome.locator("#address").inputValue()).toBe("previsao");
  const chips = h.chrome.locator(".suggestions .chip");
  await expect.poll(() => chips.count(), { timeout: 15_000 }).toBeGreaterThan(0);
  expect(await chips.first().textContent()).toContain("Previsão do tempo — INMET");

  // The suggestions sit above the keys: up from the keyboard enters the list, A opens the selected one.
  await move(h, "up");
  await expect(chips.first()).toBeFocused();
  await press(h, Pad.A);
  await expect.poll(() => activeUrl(h), { timeout: 30_000 }).toBe("https://tempo.example/previsao");
  await waitForPage(h, "Boolean(document.getElementById('tomorrow'))");

  // The result page is a web page, so the D-pad walks its real DOM focus and A follows the link.
  await expect.poll(() => h.chrome.locator(".status-line .mode").textContent()).toBe("SPATIAL");
  await focusOn(h, "page", "document.getElementById('tomorrow')", "the Tomorrow link");
  expect(await pageEval<string>(h, "document.activeElement.id")).toBe("tomorrow");
  await press(h, Pad.A);
  await expect.poll(() => activeUrl(h), { timeout: 30_000 }).toBe("https://tempo.example/tomorrow");
});

/** Opens the quick menu with Start and activates one item, by label. */
async function quickMenu(h: Harness, label: RegExp): Promise<void> {
  await press(h, Pad.Start);
  await expect(h.chrome.locator(".overlay .menu")).toBeVisible();
  await focusOn(h, "shell", `[...document.querySelectorAll('.menu .menu-item')].find((b) => ${label.toString()}.test((b.textContent || '').trim()))`, `menu item ${label}`);
  await press(h, Pad.A);
  await expect(h.chrome.locator(".overlay .menu")).toHaveCount(0);
}

test("three tabs, switching in the tab switcher and closing one, all from the pad", async () => {
  const h = await launch({ settings: { ...SETTLED } });
  await waitForPage(h, "document.querySelectorAll('#sites .card').length > 0");
  await installPad(h);

  // Tab 2: a new tab, then Settings from the quick menu. Tab 3: a new tab, then History from the home footer.
  await quickMenu(h, /^New tab/);
  await expect.poll(async () => (await tabs(h)).length).toBe(2);
  await quickMenu(h, /^Settings/);
  await expect.poll(() => activeUrl(h), { timeout: 30_000 }).toBe("joychromium://settings");
  await quickMenu(h, /^New tab/);
  await expect.poll(async () => (await tabs(h)).length).toBe(3);
  await waitForPage(h, "document.querySelectorAll('#sites .card').length > 0");
  await focusOn(h, "page", "document.getElementById('hist')", "the History link");
  await press(h, Pad.A);
  await expect.poll(() => activeUrl(h), { timeout: 30_000 }).toBe("joychromium://history");
  const urls = async () => (await tabs(h)).map((tab) => tab.url);
  expect(await urls()).toEqual(["joychromium://newtab", "joychromium://settings", "joychromium://history"]);

  // The switcher opens on the active tab; walk to the first card and A switches to it.
  await press(h, Pad.Start);
  await focusOn(h, "shell", "[...document.querySelectorAll('.menu .menu-item')].find((b) => (b.textContent || '').trim().startsWith('Tabs'))", "the tabs menu item");
  await press(h, Pad.A);
  await expect(h.chrome.locator(".tab-grid")).toBeVisible();
  await focusOn(h, "shell", "document.querySelectorAll('.tab-card')[0].querySelector('.tab-open')", "the first tab card");
  await press(h, Pad.A);
  await expect(h.chrome.locator(".tab-grid")).toHaveCount(0);
  await expect.poll(async () => (await activeTab(h))?.url, { timeout: 30_000 }).toBe("joychromium://newtab");

  // Back in the switcher, the settings card's close button closes that tab; the other two stay.
  await press(h, Pad.Start);
  await focusOn(h, "shell", "[...document.querySelectorAll('.menu .menu-item')].find((b) => (b.textContent || '').trim().startsWith('Tabs'))", "the tabs menu item");
  await press(h, Pad.A);
  await expect(h.chrome.locator(".tab-grid")).toBeVisible();
  await focusOn(h, "shell", "document.querySelectorAll('.tab-card')[1].querySelector('.tab-close')", "the settings card close button");
  await press(h, Pad.A);
  await expect.poll(async () => (await tabs(h)).length).toBe(2);
  expect(await urls()).toEqual(["joychromium://newtab", "joychromium://history"]);
  await press(h, Pad.B);
  await expect(h.chrome.locator(".tab-grid")).toHaveCount(0);
});

const MICROPHONE = `<!doctype html><meta charset="utf-8"><title>Meeting</title>
<p id="status">asking</p>
<script>
window.events = [];
window.events.push('loaded');
navigator.mediaDevices.getUserMedia({ audio: true })
  .then((stream) => { window.events.push('granted'); document.getElementById('status').textContent = 'granted'; stream.getTracks().forEach((t) => t.stop()); })
  .catch((error) => { window.events.push('error:' + error.name); document.getElementById('status').textContent = 'error:' + error.name; });
</script>`;

test("a site asks for the microphone, the pad walks the prompt and chooses Always allow", async () => {
  // Chromium only reaches the permission stage when a capture device exists, and CI has no microphone: the fake device
  // switch gives it one. The stream is Chromium's; the answer below is the app's own Electron permission handler.
  const h = await launch({ settings: { ...SETTLED }, args: ["--use-fake-device-for-media-stream"] });
  await waitForPage(h, "document.querySelectorAll('#sites .card').length > 0");
  await serveHttps(h, MICROPHONE);
  await installPad(h);

  // The site is opened from the couch: https://sala.com, typed on the controller keyboard.
  await press(h, Pad.Y);
  await expect.poll(() => h.chrome.locator("#keyboard").isVisible(), { timeout: 15_000 }).toBe(true);
  const key = (label: string) => `[...document.querySelectorAll('#keyboard .key')].find((k) => k.textContent.trim() === ${JSON.stringify(label)})`;
  await focusOn(h, "shell", key("https://"), "the https:// key");
  await press(h, Pad.A);
  for (const character of "sala") {
    await focusOn(h, "shell", key(character), `key ${character}`);
    await press(h, Pad.A);
  }
  await focusOn(h, "shell", key(".com"), "the .com key");
  await press(h, Pad.A);
  await focusOn(h, "shell", "[...document.querySelectorAll('#keyboard .key.primary')][0]", "OK");
  await press(h, Pad.A);
  await expect.poll(() => activeUrl(h), { timeout: 30_000 }).toBe("https://sala.com/");

  // The real Electron permission handler asks; the dialog is the shell's own overlay.
  await expect(h.chrome.locator('.overlay[role="dialog"]')).toBeVisible({ timeout: 15_000 });
  expect(await h.chrome.locator('.overlay[role="dialog"]').textContent()).toContain("sala.com");

  // D-pad to the last action, "Always allow", and A.
  await focusOn(h, "shell", "document.querySelector('.dialog-actions button:last-child')", "Always allow");
  await press(h, Pad.A);
  await expect(h.chrome.locator('.overlay[role="dialog"]')).toHaveCount(0);

  // Remembered for the site: the setting is saved and the page was not refused.
  const saved = () => JSON.parse(readFileSync(join(h.data, "settings.json"), "utf8"));
  await expect.poll(() => saved().sitePermissions?.["sala.com"]?.media).toBe(true);
  await expect.poll(() => pageEval<string>(h, "window.events.join('|')"), { timeout: 15_000 }).not.toContain("NotAllowedError");
  await expect.poll(() => pageEval<string>(h, "navigator.permissions.query({ name: 'microphone' }).then((p) => p.state)")).toBe("granted");

  // X reloads; the answer was remembered, so the page gets no second prompt.
  await press(h, Pad.X);
  await expect.poll(() => pageEval<boolean>(h, "document.readyState === 'complete' && window.events.includes('loaded')"), { timeout: 30_000 }).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  await expect(h.chrome.locator('.overlay[role="dialog"]')).toHaveCount(0);
  await expect.poll(() => pageEval<string>(h, "window.events.join('|')")).not.toContain("NotAllowedError");
});

test("an update cannot be completed end to end without a published release; the app reports where it stops", async () => {
  // This is the honest boundary of scenario 6. electron-updater is a no-op outside a packaged build, and finishing a
  // self-update needs a published release with the new version, a download and a restart into it: there is no such
  // artifact in the test suite, and faking one would prove nothing about the updater. What is decidable here is that
  // an unpackaged build refuses to pretend it can self-update, and the install route itself (updateInstallRoute /
  // Updater.canInstallNow, "package-manager" only for a downloaded deb/rpm) is covered by the unit tests.
  const h = await launch({ settings: { ...SETTLED } });
  expect(await h.app.evaluate(({ app }) => app.isPackaged)).toBe(false);
  await waitForPage(h, "document.querySelectorAll('#sites .card').length > 0");
  await installPad(h);

  await quickMenu(h, /^Settings/);
  await expect.poll(() => activeUrl(h), { timeout: 30_000 }).toBe("joychromium://settings");
  await expect.poll(() => pageEval<string>(h, "document.getElementById('appUpdate').textContent"), { timeout: 30_000 })
    .toBe("Running unpackaged; self-update only works when installed");
  // No update URL and no downloaded package: there is nothing to install and the page offers no button.
  expect(await pageEval<string>(h, "String(document.getElementById('updateDownload').hidden)")).toBe("true");
});
