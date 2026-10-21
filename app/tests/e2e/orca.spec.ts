import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * E7-03: what a screen reader says, not what the tree contains.
 *
 * Orca talks to speech-dispatcher over SSIP, and speech-dispatcher's `dummy` output module never opens a real
 * device. With `LogLevel 5` the server logs the text it received for every utterance, so this file reads exactly what
 * Orca handed to the synthesizer: the words, in order, for the flow a reader user walks through.
 *
 * `screen-reader.spec.ts` proves the names and roles the app publishes; this proves they are *spoken*, which is a
 * different claim. A name the reader never reads out on focus is a name the user does not hear.
 *
 * Linux only: Orca is the reader, and it is the only one whose speech can be captured without a person. Narrator and
 * VoiceOver stay manual, in docs/SCREEN-READER.md. Without the packages the test skips with the reason instead of
 * pretending it listened.
 */

const XBOX = "Xbox Wireless Controller";
const Button = { Y: 3 } as const;

const CONF = `LogLevel 5
AudioOutputMethod "alsa"
AddModule "dummy" "sd_dummy"
DefaultModule dummy
`;

let root: string;
let home: string;
let env: NodeJS.ProcessEnv;
let bus: ChildProcess | undefined;
let dispatcher: ChildProcess | undefined;
let orca: ChildProcess | undefined;
let stackProblem: string | undefined;

let data: string;
let app: ElectronApplication;
let chrome: Page;
let server: Server | undefined;
let servedAt = "";

/** Utterances since the current test started, in the order Orca produced them. */
let said: string[] = [];
let cursor = 0;

const speechLog = () => join(root, "run/speech-dispatcher/log/speech-dispatcher.log");

function haveBinary(name: string): boolean {
  try {
    execFileSync("which", [name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Why the capture cannot run here, or undefined when it can. */
function captureProblem(): string | undefined {
  if (process.platform !== "linux") return "Orca's speech is only capturable on Linux; Narrator and VoiceOver are manual";
  for (const binary of ["orca", "speech-dispatcher", "dbus-daemon"]) {
    if (!haveBinary(binary)) return `${binary} is not installed (apt install orca speech-dispatcher)`;
  }
  return undefined;
}

/** The text speech-dispatcher was asked to say, with Orca's SSML markers (word highlighting) taken out. */
function utterances(): string[] {
  if (!existsSync(speechLog())) return [];
  const log = readFileSync(speechLog(), "utf8");
  return [...log.matchAll(/Incoming text: \|([^|]*)\|/g)]
    .map((match) => match[1]!.replace(/<mark[^>]*\/>/g, "").replace(/<[^>]*>/g, "").trim())
    .filter(Boolean);
}

/** Appends whatever Orca said since the last read, and reports whether anything matched. */
function readNew(): string[] {
  const all = utterances();
  // A restarted server starts its log over; the transcript already read stays, the cursor goes back to the top.
  if (all.length < cursor) cursor = 0;
  const fresh = all.slice(cursor);
  cursor = all.length;
  said.push(...fresh);
  return fresh;
}

/**
 * Waits for an utterance matching `pattern`. Orca speaks after the event that woke it, and a fixed sleep either
 * flakes or wastes seconds; polling the transcript is what makes this deterministic.
 */
async function expectSpoken(pattern: RegExp, what: string): Promise<void> {
  await expect
    .poll(() => { readNew(); return said.some((line) => pattern.test(line)); }, {
      timeout: 30_000,
      intervals: [250],
      message: `${what}: Orca never said ${pattern}. It said: ${JSON.stringify(said)}`,
    })
    .toBe(true);
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.beforeAll(async () => {
  stackProblem = captureProblem();
  if (stackProblem) return;
  root = mkdtempSync(join(tmpdir(), "joychromium-orca-"));
  home = join(root, "home");
  for (const dir of ["home", "run", "conf", "out"]) mkdirSync(join(root, dir), { recursive: true });
  // The dummy module still opens an audio device; ALSA's `null` device accepts the samples and drops them.
  writeFileSync(join(home, ".asoundrc"), "pcm.!default { type null }\nctl.!default { type null }\n");
  writeFileSync(join(root, "conf/speechd.conf"), CONF);

  env = {
    ...process.env,
    HOME: home,
    XDG_RUNTIME_DIR: join(root, "run"),
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_CACHE_HOME: join(home, ".cache"),
    XDG_DATA_HOME: join(home, ".local/share"),
  };

  const daemon = spawn("dbus-daemon", ["--session", "--print-address=1", "--nofork"], { env, stdio: ["ignore", "pipe", "pipe"] });
  bus = daemon;
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
  env.DBUS_SESSION_BUS_ADDRESS = address;

  // `-t 0` keeps the server alive while no client is connected: the default exits after a few idle seconds, the log
  // starts over when Orca respawns it, and a reader watching the tail of the file loses the utterance it was after.
  dispatcher = spawn("speech-dispatcher", ["-s", "-C", join(root, "conf"), "-l", "5", "-t", "0"], { env, stdio: "ignore" });
  await wait(1_000);
  orca = spawn("orca", ["--replace", "--speech-system", "speechdispatcher", "--debug-file", join(root, "out/orca.debug")], { env, stdio: "ignore" });
  // Orca announces "Screen reader on." once its speech service is up, which is the only ready signal it gives.
  await expect.poll(() => utterances().some((line) => /Screen reader on/.test(line)), { timeout: 60_000 }).toBe(true);
});

test.afterAll(async () => {
  orca?.kill();
  dispatcher?.kill();
  bus?.kill();
  server?.close();
  if (root) rmSync(root, { recursive: true, force: true });
});

test.beforeEach(async () => {
  test.skip(Boolean(stackProblem), stackProblem ?? "");
  data = mkdtempSync(join(tmpdir(), "joychromium-orca-data-"));
  writeFileSync(
    join(data, "settings.json"),
    JSON.stringify({
      onboardingCompleted: true, startup: "NewTab", windowMode: "window", language: "en",
      shortcuts: [{ name: "YouTube TV", url: "https://www.youtube.com/tv" }],
      favorites: [{ name: "Example", url: "https://example.com/" }],
    }),
  );
  writeFileSync(join(data, "history.jsonl"), `${JSON.stringify({ url: "https://example.com/one", title: "Example 1", visitedUtc: "2026-10-11T12:00:00.000Z" })}\n`);
  app = await electron.launch({
    // A reader's arrival is what turns the tree on; --force-renderer-accessibility does the same for a headless run.
    args: [".", "--force-renderer-accessibility"],
    env: { ...env, JOYCHROMIUM_DATA: data },
  });
  chrome = await app.firstWindow();
  await expect.poll(tabs, { timeout: 30_000 }).toHaveLength(1);
  readNew();
  said = [];
  cursor = utterances().length;
});

test.afterEach(async () => {
  if (app) await app.close().catch(() => undefined);
  if (data) rmSync(data, { recursive: true, force: true });
  server?.close();
  server = undefined;
});

const tabs = () => app.evaluate(() => globalThis.joy.tabs());
const activeTab = async () => (await tabs()).find((tab) => tab.isActive);
const command = (c: unknown) => app.evaluate(({}, cmd) => globalThis.joy.command(cmd), c);
const pageEval = <T>(script: string) => app.evaluate(({}, s) => globalThis.joy.pageEval(s) as Promise<T>, script);

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

async function press(button: number): Promise<void> {
  const set = (pressed: boolean) => chrome.evaluate(([b, is]) => {
    (window as unknown as { __pads: { buttons: { pressed: boolean }[] }[] }).__pads[0].buttons[b].pressed = is;
  }, [button, pressed]);
  await set(true);
  await wait(150);
  await set(false);
  await wait(150);
}

async function pressKey(key: string): Promise<void> {
  await chrome.keyboard.press(key);
}

test("the search flow reaches the reader, element by element", async () => {
  // One app, one session: Orca follows a single window from boot to the permission prompt, the way a reader user
  // walks the flow, and every step is asserted before the next one starts.

  // 1. The new tab page's search field has focus at boot, and it is announced in full: name, role and hint.
  await expectSpoken(/Search entry/, "the new tab search field");

  // 2. Y on the controller opens the keyboard. The focus lands on its dialog, and every key is a named button.
  await installPad();
  await press(Button.Y);
  await expectSpoken(/D-PAD MOVES/, "the controller keyboard's hints");
  await pressKey("Tab");
  await pressKey("Tab");
  await expectSpoken(/q push button/, "a key in the controller keyboard grid");
  await command({ type: "keyboard-close" });

  // 3. The address bar. Name, role, value and selection, which is what Orca's Chromium script says for a text field.
  await chrome.locator("#address").click();
  await expectSpoken(/Address entry joychromium:\/\/newtab/, "the address field");

  // 4. The suggestions. The list appearing is not announced on its own while the field keeps the focus: a reader
  // user hears it when the field hands the focus over, which is ArrowDown. The keyboard overlay covers the bar, so
  // the field is typed into, not clicked.
  await chrome.locator("#address").fill("exam");
  await pressKey("ArrowDown");
  await expectSpoken(/SUGGESTIONS List with \d+ items?/, "the suggestions list");
  await expectSpoken(/Example https:\/\/example\.com\//, "the first suggestion");
  await command({ type: "keyboard-close" });

  // 5. The cards of the new tab page. The list is counted, and each card is named by its title: the badge letter is
  // decoration, so a reader that spelled it would say "Y YouTube TV".
  await command({ type: "navigate", url: "joychromium://newtab" });
  await expect.poll(async () => (await activeTab())?.url, { timeout: 30_000 }).toBe("joychromium://newtab");
  await expect.poll(() => pageEval<number>("document.querySelectorAll('#sites .card').length"), { timeout: 30_000 }).toBeGreaterThan(0);
  await command({ type: "keyboard-close" });
  await pageEval("document.querySelector('#sites .card').focus()");
  await expectSpoken(/List with \d+ items/, "the quick links list");
  await expectSpoken(/YouTube TV push button/, "the first quick link");
  expect(said.join(" ")).not.toMatch(/Y YouTube TV/);

  // 6. A page asks for a permission, and the prompt is a named dialog whose first button is announced.
  server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    // Geolocation asks without a user gesture, which a page that wants a notification may not have.
    response.end("<html><body><h1>Permissions</h1><script>navigator.geolocation.getCurrentPosition(() => {}, () => {})</script></body></html>");
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  servedAt = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  await command({ type: "navigate", url: servedAt, allowHttp: true });
  await expect.poll(() => chrome.getByRole("dialog").count(), { timeout: 30_000 }).toBeGreaterThan(0);
  // Orca sometimes starts a Say All when a page loads and then withholds focus announcements for as long as it runs.
  // Tab is what a reader user would press anyway: it stops the Say All and moves to the next button, so the prompt is
  // announced whichever way the reader arrived at it.
  await pressKey("Tab");
  await expectSpoken(/Deny push button\.|Always deny push button\./, "the permission prompt's buttons");
});
