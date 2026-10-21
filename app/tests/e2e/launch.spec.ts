import { _electron as electron, expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import electronPath from "electron";

// What a launcher such as ConsoleMode does: start the browser with flags and a URL, then launch it again while it runs.
test("command-line mode and URL, and a second launch handed to the running app", async () => {
  const data = mkdtempSync(join(tmpdir(), "joychromium-launch-"));
  writeFileSync(join(data, "settings.json"), JSON.stringify({ onboardingCompleted: true, startup: "NewTab", language: "en", windowMode: "tv" }));
  const env = { ...process.env, JOYCHROMIUM_DATA: data };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [".", "--window", "joychromium://history"], env });
  try {
    const tabs = () => app.evaluate(() => globalThis.joy.tabs());
    const active = async () => (await tabs()).find((t) => t.isActive)?.url;
    const fullScreen = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen());

    // --window wins over the saved TV mode for this run, and the URL is the first tab.
    await expect.poll(active, { timeout: 30_000 }).toBe("joychromium://history");
    expect(await fullScreen()).toBe(false);
    // The flag is for this run: the saved preference is still TV.
    expect(JSON.parse(readFileSync(join(data, "settings.json"), "utf8")).windowMode).toBe("tv");

    // The CI has no network: the site the second launch opens is served by the test.
    await app.evaluate(({ protocol }) => {
      protocol.handle("https", () => new Response("<title>Launched</title>", { headers: { "content-type": "text/html" } }));
    });
    // A second launch exits at once and hands its flags and URL to this instance, which opens the URL in a new tab.
    const second = spawn(electronPath as unknown as string, [".", "--tv", "joychromium://open?url=https%3A%2F%2Fexample.com%2F"], { env, stdio: "ignore" });
    await new Promise((resolve) => second.on("exit", resolve));
    await expect.poll(async () => (await tabs()).length, { timeout: 15_000 }).toBe(2);
    expect(await active()).toBe("https://example.com/");
    await expect.poll(fullScreen, { timeout: 15_000 }).toBe(true);
  } finally {
    await app.close().catch(() => undefined);
    rmSync(data, { recursive: true, force: true });
  }
});
