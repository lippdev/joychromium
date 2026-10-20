import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Temporary: prints the new tab page state on the Windows runner so the failing wait in screen-reader.spec can be
// diagnosed. Removed before the PR merges.
test("diagnose the new tab page", async () => {
  test.skip(process.platform !== "win32", "Windows runner only");
  const data = mkdtempSync(join(tmpdir(), "joychromium-diag-"));
  writeFileSync(
    join(data, "settings.json"),
    JSON.stringify({
      onboardingCompleted: true, startup: "NewTab", windowMode: "window",
      favorites: [{ name: "Example", url: "https://example.com/" }],
    }),
  );
  const app = await electron.launch({
    args: [".", "--force-renderer-accessibility"],
    env: { ...process.env, JOYCHROMIUM_DATA: data },
  });
  const chrome = await app.firstWindow();
  await expect.poll(() => app.evaluate(() => globalThis.joy.tabs().length), { timeout: 30_000 }).toBe(1);

  const SCRIPT = `JSON.stringify({
    href: location.href,
    ready: document.readyState,
    title: document.title,
    joy: typeof window.joy,
    apps: document.getElementById('apps') ? document.getElementById('apps').children.length : -1,
    cards: document.querySelectorAll('#apps .card').length,
    items: document.querySelectorAll('#apps [role=listitem]').length,
    q: document.getElementById('q') ? document.getElementById('q').getAttribute('aria-label') : null
  })`;
  const snapshot = () => app.evaluate(({}, script) => globalThis.joy.pageEval(script), SCRIPT) as Promise<string>;

  const startupTab = await app.evaluate(() => globalThis.joy.tabs());
  const beforeNavigate = await snapshot();

  await app.evaluate(({},) => globalThis.joy.command({ type: "navigate", url: "joychromium://newtab" }));
  await new Promise((resolve) => setTimeout(resolve, 4000));
  const afterSameUrl = await snapshot();

  await app.evaluate(({},) => globalThis.joy.command({ type: "navigate", url: "joychromium://settings" }));
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await app.evaluate(({},) => globalThis.joy.command({ type: "navigate", url: "joychromium://newtab" }));
  await new Promise((resolve) => setTimeout(resolve, 4000));
  const afterRoundTrip = await snapshot();

  await app.close().catch(() => undefined);
  rmSync(data, { recursive: true, force: true });

  expect(
    { startupTab, beforeNavigate, afterSameUrl, afterRoundTrip },
    "new tab page state",
  ).toEqual({});
});
