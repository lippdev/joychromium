import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// What a browser must refuse, end to end: a popup, a scheme it does not navigate, a file it does not save and a host the
// policy blocks. The decisions are unit tested; what these tests cover is the wiring in the shell that applies them.
const PAGE = `<!doctype html><meta charset="utf-8"><title>Security probe</title>
<a id="payload" href="/payload.exe" download>payload</a>
<a id="js" href="javascript:document.title='ran'">js</a>
<script>
  document.getElementById("js").addEventListener("click", () => { /* the scheme is what matters, not this */ });
</script>`;
const ORIGIN = "https://probe.example";

let data: string;
let app: ElectronApplication;
let chrome: Page;

test.beforeEach(async () => {
  data = mkdtempSync(join(tmpdir(), "joychromium-security-"));
  writeFileSync(join(data, "settings.json"), JSON.stringify({ onboardingCompleted: true, startup: "NewTab", language: "en", windowMode: "window" }));
  app = await electron.launch({ args: ["."], env: { ...process.env, JOYCHROMIUM_DATA: data, JOYCHROMIUM_START: "about:blank" } });
  chrome = await app.firstWindow();
  await expect.poll(() => app.evaluate(() => globalThis.joy.tabs().length), { timeout: 30_000 }).toBe(1);
  await app.evaluate(({ protocol }, page) => {
    protocol.handle("https", (request) => {
      if (request.url.endsWith("/payload.exe")) {
        return new Response("not really a disk image", { headers: { "content-type": "application/octet-stream" } });
      }
      return new Response(page, { headers: { "content-type": "text/html" } });
    });
  }, PAGE);
});

test.afterEach(async () => {
  await app.close().catch(() => undefined);
  rmSync(data, { recursive: true, force: true });
});

const command = (c: unknown) => app.evaluate(({}, cmd) => globalThis.joy.command(cmd), c);
const activeUrl = async () => (await app.evaluate(() => globalThis.joy.tabs())).find((t) => t.isActive)?.url;
const pageEval = <T>(script: string) => app.evaluate(({}, code) => globalThis.joy.pageEval(code), script) as Promise<T>;
const status = () => chrome.locator(".toasts").textContent();

async function openProbe(): Promise<void> {
  await command({ type: "navigate", url: `${ORIGIN}/` });
  await expect.poll(activeUrl, { timeout: 30_000 }).toBe(`${ORIGIN}/`);
  await expect.poll(() => pageEval<string>("document.title"), { timeout: 30_000 }).toBe("Security probe");
}

test("a popup becomes a tab, and a burst of them is cut off", async () => {
  await openProbe();
  // The first one is what the design promises: a site's window becomes a tab instead of a separate window.
  await pageEval("window.open('/first')");
  await expect.poll(async () => (await app.evaluate(() => globalThis.joy.tabs())).length, { timeout: 15_000 }).toBe(2);
  // A burst is what it refuses, and the console says so without opening anything else.
  await pageEval("for (let i = 0; i < 6; i++) window.open('/burst' + i)");
  await expect.poll(async () => (await status()) ?? "", { timeout: 15_000 }).toContain("POPUP BLOCKED");
  // The shell allows three popups per second, and the first one above already spent one of them.
  expect((await app.evaluate(() => globalThis.joy.tabs())).length).toBeLessThanOrEqual(5);
});

test("a javascript: address never runs in the page", async () => {
  await openProbe();
  await command({ type: "navigate", url: "javascript:document.title='ran'" });
  await expect.poll(() => pageEval<string>("document.title"), { timeout: 10_000 }).toBe("Security probe");
});

test("a dangerous download is cancelled before it is written", async () => {
  await openProbe();
  await pageEval("document.getElementById('payload').click()");
  await expect.poll(async () => (await status()) ?? "", { timeout: 20_000 }).toContain("DOWNLOAD BLOCKED");
  // Nothing reaches the downloads folder the app uses for this profile.
  const downloads = await app.evaluate(({ app: electronApp }) => electronApp.getPath("downloads"));
  expect(existsSync(join(downloads, "JoyChromium", "payload.exe"))).toBe(false);
});
