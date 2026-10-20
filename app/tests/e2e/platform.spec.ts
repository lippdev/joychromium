import { _electron as electron, expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The window opens in TV mode (fullscreen) by default, and a second launch reuses the running instance.
test("opens fullscreen in TV mode and keeps a single instance", async () => {
  const data = mkdtempSync(join(tmpdir(), "joychromium-e2e-"));
  writeFileSync(join(data, "settings.json"), JSON.stringify({ onboardingCompleted: true, startup: "NewTab", language: "en" }));
  const app = await electron.launch({ args: ["."], env: { ...process.env, JOYCHROMIUM_DATA: data } });
  try {
    await app.firstWindow();
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen()), { timeout: 30_000 }).toBe(true);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);

    // A second copy of the same profile must hand over and exit instead of opening another window. Some platforms
    // end it with a signal instead of exit code 0, so what matters is that it ended at all.
    const electronBinary = await app.evaluate(() => process.execPath);
    const second = spawn(electronBinary, ["."], { env: { ...process.env, JOYCHROMIUM_DATA: data }, stdio: "ignore" });
    const ended = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 20_000);
      second.once("exit", () => { clearTimeout(timer); resolve(true); });
    });
    expect(ended).toBe(true);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  } finally {
    await app.close();
    rmSync(data, { recursive: true, force: true });
  }
});

// Inside the Flatpak sandbox the host updates the bundle, so the settings row says where updates come from instead of
// offering a download that would land on top of the sandbox files.
test("a Flatpak build reports Flathub as its updater", async () => {
  // FLATPAK_ID only decides the updater on Linux; everywhere else the same variable must change nothing.
  test.skip(process.platform !== "linux", "a Flatpak sandbox only exists on Linux");
  const data = mkdtempSync(join(tmpdir(), "joychromium-e2e-"));
  writeFileSync(join(data, "settings.json"), JSON.stringify({ onboardingCompleted: true, startup: "NewTab", language: "en", windowMode: "window" }));
  const app = await electron.launch({ args: ["."], env: { ...process.env, JOYCHROMIUM_DATA: data, FLATPAK_ID: "dev.lipp.joychromium" } });
  try {
    await app.firstWindow();
    // Navigating while the first tab is still loading opens a second one, so let the startup tab land first.
    await expect.poll(async () => {
      const open = await app.evaluate(() => globalThis.joy.tabs());
      return open.length === 1 && !open[0]?.isLoading;
    }, { timeout: 30_000 }).toBe(true);
    await app.evaluate(({}, url) => globalThis.joy.command({ type: "navigate", url }), "joychromium://settings");
    // Tab views are not reachable through Playwright, so the page is read through the test bridge.
    const read = (script: string) =>
      app.evaluate(({}, code) => globalThis.joy.pageEval(code) as Promise<string>, script);
    // The row shows where updates come from as soon as the page opens, with no check and no download on offer.
    await expect.poll(() => read("document.getElementById('appUpdate')?.textContent ?? ''"), { timeout: 30_000 })
      .toBe("Updates come from Flathub; install the new version from your software center");
    expect(await read("String(document.getElementById('updateDownload')?.hidden)")).toBe("true");
  } finally {
    await app.close();
    rmSync(data, { recursive: true, force: true });
  }
});
