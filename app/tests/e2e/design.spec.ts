import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The development-only design catalog: every component of PRD 6.2 rendered, and the D-pad walking through them.
let data: string;
let app: ElectronApplication;

test.beforeEach(async () => {
  data = mkdtempSync(join(tmpdir(), "joychromium-e2e-design-"));
  writeFileSync(join(data, "settings.json"), JSON.stringify({ onboardingCompleted: true, startup: "NewTab", windowMode: "window" }));
  app = await electron.launch({ args: ["."], env: { ...process.env, JOYCHROMIUM_DATA: data } });
});

test.afterEach(async () => {
  await app.close().catch(() => undefined);
  rmSync(data, { recursive: true, force: true });
});

const tabs = () => app.evaluate(() => globalThis.joy.tabs());
const command = (c: unknown) => app.evaluate(({}, cmd) => globalThis.joy.command(cmd), c);
const pageEval = <T>(script: string) => app.evaluate(({}, code) => globalThis.joy.pageEval(code), script) as Promise<T>;
const activeDemo = () => pageEval<string | undefined>("document.activeElement?.closest('[data-demo]')?.dataset.demo");

test("renders every component and a controller press moves the focus", async () => {
  await app.firstWindow();
  await expect.poll(tabs, { timeout: 30_000 }).toHaveLength(1);

  await command({ type: "navigate", url: "joychromium://design" });
  await expect.poll(async () => (await tabs()).find((t) => t.isActive)?.url, { timeout: 30_000 }).toBe("joychromium://design");
  await expect.poll(async () => (await tabs()).find((t) => t.isActive)?.isLoading, { timeout: 30_000 }).toBe(false);

  await expect.poll(() => pageEval<number>("document.querySelectorAll('[data-component]').length"), { timeout: 30_000 }).toBeGreaterThanOrEqual(14);
  const components = await pageEval<string[]>("Array.from(document.querySelectorAll('[data-component]')).map((el) => el.dataset.component)");
  expect(components).toEqual(expect.arrayContaining([
    "button", "card", "list-item", "text-field", "keyboard", "tabs", "toast", "dialog", "settings-card",
  ]));
  // Each catalog entry carries its live state: idle at rest, disabled where the control is, selected on the tabs.
  await expect.poll(() => pageEval<string | undefined>("document.querySelector('[data-demo=\"button-disabled\"]')?.dataset.stateKey")).toBe("disabled");
  await expect.poll(() => pageEval<string | undefined>("document.querySelector('[data-demo=\"tabs\"]')?.dataset.stateKey")).toBe("selected");

  // The catalog starts on its first component; one D-pad press moves the real DOM focus to the next one.
  await expect.poll(activeDemo, { timeout: 15_000 }).toBe("focus-ring-button");
  await app.evaluate(() => globalThis.joy.controller({ type: "direction", direction: "down" }));
  await expect.poll(activeDemo).toBe("button-primary");
  expect(await pageEval<boolean>("document.activeElement.classList.contains('__joy-focus')")).toBe(true);
  await expect.poll(() => pageEval<string | undefined>("document.querySelector('[data-demo=\"button-primary\"]')?.dataset.stateKey")).toBe("focus");
});
