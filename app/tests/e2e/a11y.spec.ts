import AxeBuilder from "@axe-core/playwright";
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** axe-core's WCAG 2.0 A and AA rules: the floor this project promises, rule by rule. */
const AXE_TAGS = ["wcag2a", "wcag2aa"];
// The tab views are WebContentsViews, which Playwright cannot address, so the axe bundle goes in through the bridge.
const AXE_SOURCE = readFileSync(join(dirname(createRequire(__filename).resolve("axe-core")), "axe.min.js"), "utf8");

interface ViolationNode {
  target: string[];
  failureSummary?: string;
}

interface Violation {
  id: string;
  impact?: string | null;
  help: string;
  nodes: ViolationNode[];
}

let data: string;
let app: ElectronApplication;
let chrome: Page;

test.beforeEach(async () => {
  data = mkdtempSync(join(tmpdir(), "joychromium-a11y-"));
  // Favorites and history make the list pages render rows, which is where their buttons live.
  writeFileSync(
    join(data, "settings.json"),
    JSON.stringify({
      onboardingCompleted: true, startup: "NewTab", windowMode: "window",
      favorites: [{ name: "Example", url: "https://example.com/" }],
    }),
  );
  writeFileSync(
    join(data, "history.jsonl"),
    ["https://example.com/one", "https://example.com/two"].map((url, i) => JSON.stringify({ url, title: `Example ${i + 1}`, visitedUtc: `2026-10-1${i + 1}T12:00:00.000Z` })).join("\n") + "\n",
  );
  app = await electron.launch({ args: ["."], env: { ...process.env, JOYCHROMIUM_DATA: data } });
  chrome = await app.firstWindow();
  await expect.poll(() => app.evaluate(() => globalThis.joy.tabs().length), { timeout: 30_000 }).toBe(1);
});

test.afterEach(async () => {
  await app.close().catch(() => undefined);
  rmSync(data, { recursive: true, force: true });
});

const activeTab = async () => (await app.evaluate(() => globalThis.joy.tabs())).find((t) => t.isActive);
const command = (c: unknown) => app.evaluate(({}, cmd) => globalThis.joy.command(cmd), c);
const pageEval = <T>(script: string) => app.evaluate(({}, s) => globalThis.joy.pageEval(s) as Promise<T>, script);
const settle = () => expect.poll(async () => (await activeTab())?.isLoading, { timeout: 30_000 }).toBe(false);

/** Audits the active tab. Its WebContentsView is not a Playwright page, so axe is injected over the test bridge. */
async function auditActivePage(): Promise<Violation[]> {
  await pageEval(AXE_SOURCE);
  return pageEval<Violation[]>(`axe.run(document, { runOnly: { type: "tag", values: ${JSON.stringify(AXE_TAGS)} }, resultTypes: ["violations"] }).then((r) => r.violations)`);
}

/** Audits the shell UI window, which is a regular Playwright page. */
async function auditShell(): Promise<Violation[]> {
  // Legacy mode runs axe.run in the page instead of axe.finishRun in a new tab, and Electron cannot open a tab.
  const results = await new AxeBuilder({ page: chrome }).setLegacyMode().withTags(AXE_TAGS).analyze();
  return results.violations as Violation[];
}

const blocking = (violations: Violation[]) => violations.filter((v) => v.impact === "serious" || v.impact === "critical");

function format(violations: Violation[]): string {
  if (!violations.length) return "no violations";
  return violations
    .map((v) => {
      const nodes = v.nodes.map((n) => `    ${n.target.join(" ")}\n${(n.failureSummary ?? "").split("\n").join("\n    ")}`);
      return `  ${v.id} [${v.impact}] ${v.help}\n${nodes.join("\n")}`;
    })
    .join("\n");
}

function expectClean(label: string, violations: Violation[]): void {
  const severe = blocking(violations);
  expect(severe, `${label}\n${format(severe)}`).toEqual([]);
}

interface PageUnderTest {
  name: string;
  url: string;
  /** What the tab reports for the URL; internal pages show their short scheme form. */
  tabUrl?: string;
  /** A page-specific expression that is true once the page has rendered the data it needs. */
  ready: string;
}

const pages: PageUnderTest[] = [
  { name: "onboarding", url: "joychromium://welcome", ready: "document.querySelectorAll('#languages .opt').length >= 2" },
  { name: "new tab", url: "joychromium://newtab", ready: "document.querySelectorAll('#recent .card').length > 0" },
  { name: "settings", url: "joychromium://settings", ready: "document.getElementById('appVersion').textContent.startsWith('v')" },
  { name: "history", url: "joychromium://history", ready: "document.querySelectorAll('#list .item').length > 0" },
  { name: "favorites", url: "joychromium://favorites", ready: "document.querySelectorAll('#list .item').length > 0" },
  // The query that carries the failed URL and reason stays in the page, but the tab keeps the short scheme form.
  { name: "error page", url: "joychromium://error/?url=https%3A%2F%2Fexample.com&reason=timeout&upgraded=1", tabUrl: "joychromium://error", ready: "document.getElementById('reason').textContent.length > 0" },
];

test("internal pages pass axe", async () => {
  for (const page of pages) {
    await command({ type: "navigate", url: page.url });
    await expect.poll(async () => (await activeTab())?.url, { timeout: 30_000 }).toBe(page.tabUrl ?? page.url);
    await settle();
    await expect.poll(() => pageEval<boolean>(page.ready), { timeout: 30_000 }).toBe(true);
    expect(await pageEval("document.documentElement.lang")).toBe("pt-BR");
    expectClean(page.name, await auditActivePage());
  }
});

test("the shell passes axe with its overlays open", async () => {
  await expect(chrome.locator("#address")).toBeVisible();
  expect(await chrome.evaluate(() => document.documentElement.lang)).toBe("pt-BR");
  expectClean("shell bar", await auditShell());

  await chrome.locator("#tabs-button").click();
  await expect(chrome.locator(".tab-grid")).toBeVisible();
  await expect(chrome.locator("#tabs-button")).toHaveAttribute("aria-expanded", "true");
  // Opening the switcher moves focus into it, and the active tab is the one a controller acts on. The focus lands in an
  // effect after the grid renders, so it is polled: reading it once fails on a runner that renders a tick slower.
  await expect
    .poll(() => chrome.evaluate(() => document.activeElement?.closest(".tab-card")?.classList.contains("active")))
    .toBe(true);
  expectClean("tab switcher", await auditShell());
  await chrome.mouse.click(5, 5);
  await expect(chrome.locator(".tab-grid")).toHaveCount(0);
  await expect(chrome.locator("#tabs-button")).toHaveAttribute("aria-expanded", "false");

  await command({ type: "keyboard-open", target: "address" });
  await expect(chrome.locator("#keyboard")).toBeVisible();
  expectClean("controller keyboard", await auditShell());
  await command({ type: "keyboard-close" });
  await expect(chrome.locator("#keyboard")).toHaveCount(0);
});

test("english keeps lang=en on the shell and the pages", async () => {
  await command({ type: "ui-settings", language: "en" });
  await expect.poll(() => chrome.evaluate(() => document.documentElement.lang), { timeout: 15_000 }).toBe("en");
  expectClean("shell bar in English", await auditShell());

  await command({ type: "navigate", url: "joychromium://settings" });
  await expect.poll(async () => (await activeTab())?.url, { timeout: 30_000 }).toBe("joychromium://settings");
  await expect.poll(() => pageEval<boolean>("document.getElementById('appVersion').textContent.startsWith('v')"), { timeout: 30_000 }).toBe(true);
  expect(await pageEval("document.documentElement.lang")).toBe("en");
  expectClean("settings in English", await auditActivePage());
});
