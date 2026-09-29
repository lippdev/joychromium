import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Drives the real Electron app with a throwaway profile. Network access is required once for the ad-block lists.
test("starts with the TV identity and ad blocking", async () => {
  const data = mkdtempSync(join(tmpdir(), "joychromium-e2e-"));
  const app = await electron.launch({
    args: ["."],
    env: { ...process.env, JOYCHROMIUM_DATA: data, JOYCHROMIUM_START: "about:blank" },
  });
  try {
    const window = await app.firstWindow();
    await expect.poll(() => app.evaluate(() => globalThis.joy.userAgent), { timeout: 30_000 }).toContain("JoyChromiumTV/1.0 (TV; SmartTV)");
    expect(await window.evaluate(() => navigator.userAgent)).toContain("JoyChromiumTV/1.0 (TV; SmartTV)");
    await expect.poll(() => app.evaluate(() => globalThis.joy.adblockReady), { timeout: 60_000 }).toBe(true);
    // The engine must recognise a canonical ad host; this proves the lists loaded, not just that the object exists.
    const ad = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";
    expect(await app.evaluate(({}, url) => globalThis.joy.wouldBlock(url), ad)).toBe(true);
    expect(await app.evaluate(({}, url) => globalThis.joy.wouldBlock(url), "https://www.youtube.com/tv")).toBe(false);
  } finally {
    await app.close();
    rmSync(data, { recursive: true, force: true });
  }
});
