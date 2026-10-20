import { _electron as electron, expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The window opens in TV mode (fullscreen) by default, and a second launch reuses the running instance.
test("opens fullscreen in TV mode and keeps a single instance", async () => {
  const data = mkdtempSync(join(tmpdir(), "joychromium-e2e-"));
  writeFileSync(join(data, "settings.json"), JSON.stringify({ onboardingCompleted: true, startup: "NewTab" }));
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
