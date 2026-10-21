import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A 1x1 PNG: what the fake sites serve as their icon.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let data: string;
let app: ElectronApplication;
let chrome: Page;

test.beforeEach(async () => {
  data = mkdtempSync(join(tmpdir(), "joychromium-favicons-"));
  writeFileSync(join(data, "settings.json"), JSON.stringify({
    onboardingCompleted: true, startup: "NewTab", language: "en", windowMode: "window",
    favorites: [{ name: "Backfill", url: "https://backfill.example/" }],
  }));
  // Starts on a blank page so the fake sites below are in place before the app asks for anything.
  // A page of the favorite's own site was opened before: the new tab shows the site once.
  writeFileSync(join(data, "history.jsonl"), `${JSON.stringify({ url: "https://backfill.example/other", title: "Other page", visitedUtc: "2026-10-11T12:00:00.000Z" })}
`);
  app = await electron.launch({ args: ["."], env: { ...process.env, JOYCHROMIUM_DATA: data, JOYCHROMIUM_START: "about:blank" } });
  chrome = await app.firstWindow();
  await expect.poll(() => app.evaluate(() => globalThis.joy.tabs().length), { timeout: 30_000 }).toBe(1);
  // The sites: two announce an icon, one serves only /favicon.ico, one has no icon at all. The CI has no network.
  await app.evaluate(({ protocol, session }, png) => {
    const html = (head: string) => new Response(`<title>Site</title>${head}`, { headers: { "content-type": "text/html" } });
    const serve = (request: Request) => {
      const { hostname, pathname } = new URL(request.url);
      if (pathname === "/icon.png" || (pathname === "/favicon.ico" && hostname === "backfill.example")) {
        return new Response(Buffer.from(png, "base64"), { headers: { "content-type": "image/png" } });
      }
      if (pathname === "/favicon.ico") return new Response("no", { status: 404 });
      return html(hostname.startsWith("icons") ? '<link rel="icon" href="/icon.png">' : "");
    };
    protocol.handle("https", serve);
    // The private tab of these tests is the second one: it browses in its own session.
    session.fromPartition("private-2").protocol.handle("https", serve);
  }, PNG);
});

test.afterEach(async () => {
  await app.close().catch(() => undefined);
  rmSync(data, { recursive: true, force: true });
});

const tabs = () => app.evaluate(() => globalThis.joy.tabs());
const active = async () => (await tabs()).find((t) => t.isActive);
const command = (c: unknown) => app.evaluate(({}, cmd) => globalThis.joy.command(cmd), c);
const pageEval = <T>(code: string) => app.evaluate(({}, c) => globalThis.joy.pageEval(c), code) as Promise<T>;
const ICON_URL = (host: string) => new RegExp(`^joychromium://favicon/\\?host=${host.replace(/\./g, "\\.")}&v=\\d+&k=[0-9a-f]{32}$`);

test("a tab shows its site's icon, kept inside the app and gone when the site changes", async () => {
  await command({ type: "navigate", url: "https://icons.example/" });
  await expect.poll(async () => (await active())?.favicon, { timeout: 30_000 }).toMatch(ICON_URL("icons.example"));
  // Kept in the profile, and drawn by the tab strip from there, not from the site.
  expect(existsSync(join(data, "favicons", "icons.example.png"))).toBe(true);
  await expect.poll(() => chrome.evaluate(() => [...document.querySelectorAll<HTMLImageElement>(".tab-icon")]
    .some((img) => img.src.startsWith("joychromium://favicon/") && img.naturalWidth > 0))).toBe(true);

  // A web page asking for the icon, with no key or a made-up one, learns nothing about the browsing history.
  const probe = (query: string) => pageEval<string>(`new Promise((done) => { const i = new Image(); i.onload = () => done("loaded"); i.onerror = () => done("blocked"); i.src = "joychromium://favicon/?host=icons.example${query}"; })`);
  expect(await probe("")).toBe("blocked");
  expect(await probe("&k=00000000000000000000000000000000")).toBe("blocked");

  // A site with no icon at all: the globe, not the previous site's icon.
  await command({ type: "navigate", url: "https://plain.example/" });
  await expect.poll(async () => (await active())?.url, { timeout: 30_000 }).toBe("https://plain.example/");
  await expect.poll(async () => (await active())?.isLoading, { timeout: 30_000 }).toBe(false);
  expect((await active())?.favicon).toBeUndefined();
});

test("a site that only serves /favicon.ico gets its icon too", async () => {
  await command({ type: "navigate", url: "https://backfill.example/" });
  await expect.poll(async () => (await active())?.favicon, { timeout: 30_000 }).toMatch(ICON_URL("backfill.example"));
});

test("a private tab shows the icon but writes nothing to the profile", async () => {
  // With the block lists loaded (they need the network or a cache, so not on every CI run) the private tab's own session
  // gets the blocker too, and that used to throw "second handler" so the tab never opened.
  await expect.poll(() => app.evaluate(() => globalThis.joy.adblockReady), { timeout: 20_000 }).toBe(true).catch(() => undefined);
  await command({ type: "new-tab", isPrivate: true });
  expect((await tabs()).filter((t) => t.isPrivate)).toHaveLength(1);
  await command({ type: "navigate", url: "https://icons-private.example/" });
  await expect.poll(async () => (await active())?.favicon, { timeout: 30_000 }).toMatch(ICON_URL("icons-private.example"));
  expect(existsSync(join(data, "favicons", "icons-private.example.png"))).toBe(false);
});

test("the new tab draws the kept icons, fetching the ones it never saw", async () => {
  await command({ type: "navigate", url: "joychromium://newtab" });
  // A script run in a page still on its way in may never answer, so the page settles first.
  await expect.poll(async () => { const tab = await active(); return tab?.url === "joychromium://newtab" && !tab.isLoading; }, { timeout: 30_000 }).toBe(true);
  // "Backfill" is a favorite the app never loaded: its icon is fetched once, in the background, and then drawn.
  await expect.poll(() => pageEval<boolean>(`[...document.querySelectorAll('#sites .card')].some((card) =>
    card.textContent.includes('Backfill') && [...card.querySelectorAll('img')].some((img) => img.naturalWidth > 0))`), { timeout: 30_000 }).toBe(true);
  expect(existsSync(join(data, "favicons", "backfill.example.png"))).toBe(true);
  expect(await pageEval<number>("document.querySelectorAll('#sites .card').length")).toBe(1);
});
