import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { mkdtempSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { inflateRawSync } from "node:zlib";

// E4-04: the bug-report zip carries what the running app knows about its own boot, memory and tabs. The export is the
// same function the settings page calls; the tests reach it through the test bridge and read the zip it produced.
let data: string;
let app: ElectronApplication;

test.beforeEach(async () => {
  data = mkdtempSync(join(tmpdir(), "joychromium-diagnostics-"));
  writeFileSync(join(data, "settings.json"), JSON.stringify({ onboardingCompleted: true, startup: "NewTab", language: "en", windowMode: "window" }));
  app = await electron.launch({ args: ["."], env: { ...process.env, JOYCHROMIUM_DATA: data } });
  await expect.poll(() => app.evaluate(() => globalThis.joy.tabs()), { timeout: 30_000 }).toHaveLength(1);
});

test.afterEach(async () => {
  await app.close().catch(() => undefined);
  rmSync(data, { recursive: true, force: true });
});

/** One entry of the zip the app writes: deflate, sizes in the local header, no data descriptor. */
function zipEntry(zip: Buffer, name: string): string | undefined {
  let offset = 0;
  while (offset + 30 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    const method = zip.readUInt16LE(offset + 8);
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLength + extraLength;
    const entryName = zip.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const compressed = zip.subarray(start, start + compressedSize);
    if (entryName === name) return (method === 8 ? inflateRawSync(compressed) : compressed).toString("utf8");
    offset = start + compressedSize;
  }
  return undefined;
}

const mib = (line: string) => Number(/ ([\d.]+) MiB/.exec(line)?.[1]);

test("the diagnostics zip carries boot, memory and tab metrics", async () => {
  const zipPath = await app.evaluate(() => globalThis.joy.exportDiagnostics());
  try {
    const zip = readFileSync(zipPath);
    const report = zipEntry(zip, "diagnostics.txt");
    expect(report).toBeDefined();
    const [boot, memory, ...rest] = report!.trimEnd().split("\n");
    const processLines = rest.slice(0, -1);

    // Measured, not a placeholder: the window is up, so some time passed.
    expect(boot).toMatch(/^Boot to first window: \d+ ms$/);
    expect(Number(/\d+/.exec(boot!)?.[0])).toBeGreaterThan(0);

    // One line per process, and the total is the sum of the working sets Electron reported.
    expect(memory).toMatch(/^Memory working set: [\d.]+ MiB in \d+ process(es)?$/);
    expect(processLines).toHaveLength(Number(/in (\d+)/.exec(memory!)?.[1]));
    expect(processLines.every((line) => /^  \S.*: [\d.]+ MiB$/.test(line))).toBe(true);
    expect(processLines.some((line) => line.startsWith("  Browser: "))).toBe(true);
    const total = mib(memory!);
    const sum = processLines.reduce((sum, line) => sum + mib(line), 0);
    expect(Math.abs(total - sum)).toBeLessThan(0.5);

    expect(rest.at(-1)).toBe("Tabs: 1");

    // The new file joins the report instead of replacing what was there.
    expect(zipEntry(zip, "environment.txt")).toContain("OS ");
    expect(zipEntry(zip, "settings.json")).toBeDefined();
  } finally {
    rmSync(zipPath, { force: true });
    try { rmdirSync(dirname(zipPath)); } catch { /* folder already gone, or another report is in it */ }
  }
});
