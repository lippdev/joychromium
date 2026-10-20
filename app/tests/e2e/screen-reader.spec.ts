import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * E7-03: what the search flow hands to a screen reader, checked in two layers.
 *
 * - Playwright computes roles and accessible names from the shell window and, through the test bridge, from the
 *   internal pages. That runs on every OS in CI.
 * - On Linux the same app also publishes an AT-SPI tree over D-Bus, which is exactly what Orca reads. `atspi-tree.py`
 *   reads it here, so a name or a role that the DOM only claims to have is caught. The reader's speech itself is not
 *   automated: a human pass over docs/SCREEN-READER.md stays the only way to hear it.
 *
 * The address bar's suggestions are here too: they are a list box of options, and a reader has to hear the list and the
 * item it is on, not a row of bare buttons.
 */

const ATSPI = join(__dirname, "atspi-tree.py");
const XBOX = "Xbox Wireless Controller";
const Button = { Y: 3 } as const;

let data: string;
let app: ElectronApplication;
let chrome: Page;
let bus: { address: string; stop: () => void } | undefined;
let busProblem: string | undefined;

/** A private session bus: AT-SPI travels on D-Bus and a headless runner has no session of its own. */
async function startSessionBus(): Promise<{ address: string; stop: () => void }> {
  const daemon = spawn("dbus-daemon", ["--session", "--print-address=1", "--nofork"], { stdio: ["ignore", "pipe", "pipe"] });
  const address = await new Promise<string>((resolve, reject) => {
    let seen = "";
    daemon.stdout!.on("data", (chunk: Buffer) => {
      seen += chunk.toString();
      const line = seen.split("\n")[0]?.trim();
      if (line) resolve(line);
    });
    daemon.once("error", reject);
    daemon.once("exit", (code) => reject(new Error(`dbus-daemon exited with ${code}`)));
  });
  return { address, stop: () => daemon.kill() };
}

function atspiEnv(): NodeJS.ProcessEnv {
  return { ...process.env, DBUS_SESSION_BUS_ADDRESS: bus?.address ?? "" };
}

/** Why the AT-SPI half cannot run here, or undefined when it can. */
function atspiProblem(): string | undefined {
  if (process.platform !== "linux") return "the AT-SPI tree only exists on Linux; Orca is the reader it feeds";
  try {
    execFileSync("python3", ["-c", "import pyatspi"], { stdio: "ignore" });
  } catch {
    return "pyatspi is not installed (apt install python3-pyatspi at-spi2-core)";
  }
  return undefined;
}

interface AxNode {
  role: string;
  name: string;
  children?: AxNode[];
}

interface FlatNode {
  role: string;
  name: string;
  /** The roles between this node and the application, outermost first. */
  ancestors: string[];
}

function flatten(root: AxNode, ancestors: string[] = []): FlatNode[] {
  const here = { role: root.role, name: root.name, ancestors };
  return [here, ...(root.children ?? []).flatMap((child) => flatten(child, [...ancestors, root.role]))];
}

function find(root: AxNode, match: (node: AxNode) => boolean): AxNode | undefined {
  if (match(root)) return root;
  for (const child of root.children ?? []) {
    const hit = find(child, match);
    if (hit) return hit;
  }
  return undefined;
}

function readTree(): AxNode {
  const out = execFileSync("python3", [ATSPI, "dump"], { env: atspiEnv(), encoding: "utf8", timeout: 60_000 });
  return JSON.parse(out) as AxNode;
}

/** The flat tree, or nothing while the app has not published one yet. */
async function flatTree(): Promise<FlatNode[]> {
  try {
    return flatten(readTree());
  } catch {
    return [];
  }
}

const activeTab = async () => (await app.evaluate(() => globalThis.joy.tabs())).find((t) => t.isActive);
const command = (c: unknown) => app.evaluate(({}, cmd) => globalThis.joy.command(cmd), c);
const pageEval = <T>(script: string) => app.evaluate(({}, s) => globalThis.joy.pageEval(s) as Promise<T>, script);

test.beforeAll(async () => {
  busProblem = atspiProblem();
  if (busProblem) return;
  try {
    bus = await startSessionBus();
    // Before the app starts: Chromium only builds the tree for a client that is already asking.
    execFileSync("python3", [ATSPI, "enable"], { env: atspiEnv(), encoding: "utf8", timeout: 60_000 });
  } catch (error) {
    busProblem = `AT-SPI needs a session bus: ${error instanceof Error ? error.message : String(error)}`;
    bus?.stop();
    bus = undefined;
  }
});

test.afterAll(() => {
  bus?.stop();
});

test.beforeEach(async () => {
  data = mkdtempSync(join(tmpdir(), "joychromium-screen-reader-"));
  writeFileSync(
    join(data, "settings.json"),
    JSON.stringify({
      onboardingCompleted: true,
      startup: "NewTab",
      windowMode: "window",
      language: "pt-BR",
      favorites: [{ name: "Example", url: "https://example.com/" }],
    }),
  );
  writeFileSync(join(data, "history.jsonl"), `${JSON.stringify({ url: "https://example.com/one", title: "Example 1", visitedUtc: "2026-10-11T12:00:00.000Z" })}\n`);
  app = await electron.launch({
    // The accessibility tree is built on request: --force-renderer-accessibility is what a reader's arrival does.
    args: [".", "--force-renderer-accessibility"],
    env: { ...process.env, JOYCHROMIUM_DATA: data, ...(bus ? { DBUS_SESSION_BUS_ADDRESS: bus.address } : {}) },
  });
  chrome = await app.firstWindow();
  await expect.poll(() => app.evaluate(() => globalThis.joy.tabs().length), { timeout: 30_000 }).toBe(1);
});

test.afterEach(async () => {
  await app.close().catch(() => undefined);
  rmSync(data, { recursive: true, force: true });
});

/** Synthetic pads in the slots the Gamepad API uses, so the real polling loop runs without hardware. */
async function installPad(): Promise<void> {
  await chrome.evaluate((id) => {
    const pad = {
      index: 0, id, mapping: "standard", connected: true, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    };
    (window as unknown as { __pads: (typeof pad)[] }).__pads = [pad];
    (navigator as unknown as { getGamepads: () => unknown[] }).getGamepads = () => [pad];
  }, XBOX);
}

/** The tab stops loading, the way every other e2e waits before reading a page. */
const settle = () => expect.poll(async () => (await activeTab())?.isLoading, { timeout: 30_000 }).toBe(false);

/**
 * Waits for an expression to hold in the active tab. A bare `expect.poll` reports "timeout" whatever went wrong, and
 * an executeJavaScript that lands while the page is navigating rejects instead of counting: the last address the page
 * had is what tells those apart.
 */
async function waitForPage(expression: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  let last = "never read";
  while (Date.now() < deadline) {
    const read = await pageEval<{ ok: boolean; href: string }>(`({ ok: Boolean(${expression}), href: location.href })`)
      .catch((error: unknown) => ({ ok: false, href: error instanceof Error ? error.message : String(error) }));
    if (read.ok) return;
    last = read.href;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`The active page never satisfied ${expression} (last read at ${last})`);
}

async function press(button: number): Promise<void> {
  const set = (pressed: boolean) => chrome.evaluate(([b, is]) => {
    (window as unknown as { __pads: { buttons: { pressed: boolean }[] }[] }).__pads[0].buttons[b].pressed = is;
  }, [button, pressed]);
  await set(true);
  await new Promise((resolve) => setTimeout(resolve, 150));
  await set(false);
  await new Promise((resolve) => setTimeout(resolve, 150));
}

test("the shell names the address field and announces the controller keyboard", async () => {
  const address = chrome.getByRole("textbox", { name: "Endereço" });
  await expect(address).toHaveCount(1);
  await expect(address).toBeVisible();

  // Y on the controller is the shortcut to the controller keyboard; it has to reach a named dialog, with the focus
  // inside it, or a reader user hears nothing at all.
  await installPad();
  await press(Button.Y);
  const keyboard = chrome.getByRole("dialog", { name: "Teclado do controle" });
  await expect(keyboard).toBeVisible();
  await expect.poll(() => chrome.evaluate(() => Boolean(document.activeElement?.closest("#keyboard")))).toBe(true);
  // A key in the grid is a button with its own name, so the grid is usable by Tab as well as by the D-pad.
  await expect(keyboard.getByRole("button", { name: "q", exact: true })).toHaveCount(1);

  await command({ type: "keyboard-close" });
  await expect(chrome.locator("#keyboard")).toHaveCount(0);

  // Focusing the field opens the same keyboard, but the field keeps the focus: that is where a physical keyboard types.
  await chrome.locator("#address").click();
  await expect(chrome.locator("#keyboard")).toBeVisible();
  expect(await chrome.evaluate(() => document.activeElement?.id)).toBe("address");
  await command({ type: "keyboard-close" });
});

test("the shell names its controls in the language the user picked", async () => {
  await command({ type: "ui-settings", language: "en" });
  await expect.poll(() => chrome.evaluate(() => document.documentElement.lang), { timeout: 15_000 }).toBe("en");
  await expect(chrome.getByRole("textbox", { name: "Address" })).toHaveCount(1);
  await expect(chrome.getByRole("button", { name: "Back" })).toHaveCount(1);
  await expect(chrome.getByRole("button", { name: "Tabs" })).toHaveCount(1);

  await installPad();
  await press(Button.Y);
  await expect(chrome.getByRole("dialog", { name: "Controller keyboard" })).toBeVisible();
});

test("the address suggestions are a named list the field can enter", async () => {
  await chrome.locator("#address").click();
  await expect.poll(() => chrome.locator("#keyboard").isVisible(), { timeout: 15_000 }).toBe(true);
  await chrome.locator("#address").fill("exam");

  const list = chrome.getByRole("listbox", { name: "SUGESTÕES" });
  await expect(list).toBeVisible();
  const options = list.getByRole("option");
  await expect.poll(() => options.count(), { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(options.first()).toContainText("Example");
  await expect(options.first()).toHaveAttribute("aria-selected", "false");

  // Down from the field lands on the first option, which is the one A or Enter opens.
  await chrome.locator("#address").press("ArrowDown");
  await expect(options.first()).toBeFocused();
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
});

test("the new tab search field is named and its cards are a list", async () => {
  await command({ type: "navigate", url: "joychromium://newtab" });
  await expect.poll(async () => (await activeTab())?.url, { timeout: 30_000 }).toBe("joychromium://newtab");
  await settle();
  await waitForPage("document.querySelectorAll('#apps .card').length > 0");

  const summary = await pageEval<{
    name: string; landmark: string; list: string; label: string; items: number; cards: string[]; badgeHidden: string;
  }>(`(() => {
    const q = document.getElementById('q');
    const apps = document.getElementById('apps');
    const cards = [...apps.querySelectorAll('[role="listitem"] .card')];
    return {
      name: q.getAttribute('aria-label'),
      landmark: document.getElementById('search').getAttribute('role'),
      list: apps.getAttribute('role'),
      label: apps.getAttribute('aria-label'),
      items: cards.length,
      cards: cards.map((card) => card.querySelector('span')?.textContent.trim() ?? ''),
      badgeHidden: cards[0]?.querySelector('i')?.getAttribute('aria-hidden') ?? '',
    };
  })()`);
  expect(summary.name).toBe("Pesquisar");
  expect(summary.landmark).toBe("search");
  expect(summary.list).toBe("list");
  expect(summary.label).toBe("Aplicativos");
  expect(summary.items).toBeGreaterThan(0);
  // The initial is decoration: the card is named by its title, not by "Y" plus the title.
  expect(summary.cards[0]).toBe("YouTube TV");
  expect(summary.badgeHidden).toBe("true");

  // The flow itself: type in the field, submit the form, land on the page. An internal address keeps the test offline.
  await pageEval(`(() => {
    const q = document.getElementById('q');
    q.value = 'joychromium://settings';
    q.form.requestSubmit();
  })()`);
  await expect.poll(async () => (await activeTab())?.url, { timeout: 30_000 }).toBe("joychromium://settings");
});

test("the history search and its results reach a reader as a named list", async () => {
  await command({ type: "navigate", url: "joychromium://history" });
  await expect.poll(async () => (await activeTab())?.url, { timeout: 30_000 }).toBe("joychromium://history");
  await settle();
  await waitForPage("document.querySelectorAll('#list [role=\"listitem\"]').length > 0");

  const summary = await pageEval<{ name: string; role: string; label: string; rows: string[] }>(`(() => {
    const list = document.getElementById('list');
    return {
      name: document.getElementById('q').getAttribute('aria-label'),
      role: list.getAttribute('role'),
      label: list.getAttribute('aria-label'),
      rows: [...list.querySelectorAll('[role="listitem"] .open .t')].map((t) => t.textContent.trim()),
    };
  })()`);
  expect(summary.name).toBe("Pesquisar no histórico");
  expect(summary.role).toBe("list");
  expect(summary.label).toBe("Histórico");
  expect(summary.rows[0]).toBe("Example 1");

  // Filtering by the same field the reader just announced keeps working.
  await pageEval(`(() => {
    const q = document.getElementById('q');
    q.value = 'nothing matches this';
    q.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitForPage("document.querySelectorAll('#list [role=\"listitem\"]').length === 0");
});

test("the AT-SPI tree exposes the address field, the keyboard, the suggestions and the card list", async () => {
  test.skip(Boolean(busProblem), busProblem ?? "");

  // The shell: an entry named for the address bar, inside a form, in the shell's own document.
  await expect
    .poll(async () => (await flatTree()).some((n) => n.role === "entry" && n.name === "Endereço" && n.ancestors.includes("form")), { timeout: 30_000 })
    .toBe(true);
  // The window itself is named, so a reader says which app it is in.
  expect((await flatTree()).some((n) => n.role === "frame" && n.name === "JoyChromium")).toBe(true);

  // The controller keyboard, opened the way Y opens it, is a dialog with a name and the keys as buttons.
  await command({ type: "keyboard-open", target: "address" });
  await expect
    .poll(async () => (await flatTree()).some((n) => n.role === "dialog" && n.name === "Teclado do controle"), { timeout: 15_000 })
    .toBe(true);
  const dialog = find(readTree(), (n) => n.role === "dialog" && n.name === "Teclado do controle");
  expect(dialog).toBeDefined();
  expect(flatten(dialog!).some((n) => n.role === "push button" && n.name === "q")).toBe(true);

  // Typing in the address turns the shell's suggestions into a named list box of list items, not loose buttons.
  await chrome.locator("#address").fill("exam");
  await expect
    .poll(async () => (await flatTree()).some((n) => n.role === "list box" && n.name === "SUGESTÕES"), { timeout: 15_000 })
    .toBe(true);
  const box = find(readTree(), (n) => n.role === "list box" && n.name === "SUGESTÕES");
  const options = (box?.children ?? []).filter((n) => n.role === "list item");
  expect(options.length).toBeGreaterThan(0);
  expect(options[0]?.name).toContain("Example");
  await command({ type: "keyboard-close" });

  // The new tab page: the search field is named, the search form is a landmark, and the apps are a list of buttons.
  await command({ type: "navigate", url: "joychromium://newtab" });
  await expect
    .poll(async () => (await flatTree()).some((n) => n.role === "entry" && n.name === "Pesquisar"), { timeout: 30_000 })
    .toBe(true);

  // The page fills its cards after the document is up, so the list is polled until it holds items.
  const items = async (): Promise<AxNode[]> => {
    try {
      const list = find(readTree(), (n) => n.role === "list" && n.name === "Aplicativos");
      return (list?.children ?? []).filter((n) => n.role === "list item");
    } catch {
      return [];
    }
  };
  await expect.poll(async () => (await items()).length, { timeout: 30_000 }).toBeGreaterThan(0);

  expect(find(readTree(), (n) => n.role === "landmark" && n.name === "Pesquisar")).toBeDefined();
  expect(find((await items())[0]!, (n) => n.role === "push button")?.name).toBe("YouTube TV");
});
