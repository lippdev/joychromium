import { describe, expect, it } from "vitest";
import type { ShellState, TabState } from "../../src/shared/ipc";
import { applyShellStatePatch, diffShellState, ShellStateAreas, type ShellStateArea } from "../../src/shared/statePatch";

/** The bytes a payload takes on the wire, which is what the IPC budget in E3-03 measures. */
const wireBytes = (payload: unknown): number => new TextEncoder().encode(JSON.stringify(payload)).length;

function tab(id: number): TabState {
  return {
    id,
    title: `Live channel ${id} · a long page title`,
    url: `https://site${id}.example/watch/season-1/episode-${id}?autoplay=1`,
    isActive: id === 1,
    isPrivate: false,
    isPlayingAudio: id === 3,
    isMuted: false,
    favicon: `https://site${id}.example/favicon.ico`,
    isLoading: false,
    sleeping: false,
  };
}

/** The state of a browser window with `count` tabs open, as the main process would send it. */
function stateWithTabs(count: number): ShellState {
  return {
    tabs: Array.from({ length: count }, (_, i) => tab(i + 1)),
    activeUrl: "https://site1.example/watch/season-1/episode-1?autoplay=1",
    isFavorite: false,
    inputMode: "Spatial",
    adBlock: true,
    controllerConnected: true,
    controllerFamily: "xbox",
    chromeVisible: true,
    theme: { accent: "#64DDB5", background: "#0C0E13", surface: "#14171E", text: "#F3F5F9" },
    status: "READY",
    shortcutMod: "Ctrl",
    nativeWindowControls: false,
    maximized: false,
    windowMode: "tv",
    uiScale: 1,
    overscan: 0,
    highContrast: false,
    language: "pt-BR",
    crashReports: true,
    suggestions: [],
  };
}

const snapshot = stateWithTabs(30);
const snapshotBytes = wireBytes(snapshot);

/** One change per area that leaves the tabs alone; the patch is what the renderer would receive. */
const nonTabChanges: [ShellStateArea, (state: ShellState) => ShellState][] = [
  ["status", (s) => ({ ...s, status: "DOWNLOADED · big-file.iso" })],
  ["chrome", (s) => ({ ...s, chromeVisible: false })],
  ["overlay", (s) => ({ ...s, permission: { host: "meet.example", kind: "media", description: "use the microphone" } })],
  ["keyboard", (s) => ({ ...s, keyboard: { target: "address", title: "ADDRESS / SEARCH" } })],
  ["find", (s) => ({ ...s, find: { text: "episode" } })],
  ["suggestions", (s) => ({ ...s, suggestions: [{ title: "Site 12", url: "https://site12.example/" }] })],
  ["settings", (s) => ({ ...s, uiScale: 1.1, overscan: 2, highContrast: true })],
];

describe("shell state patches", () => {
  it("sends a toast as a status patch far below the full snapshot with 30 tabs", () => {
    const next = { ...snapshot, status: "DOWNLOADED · big-file.iso" };
    const patch = diffShellState(snapshot, next);
    expect(patch).toEqual({ status: "DOWNLOADED · big-file.iso" });
    const patchBytes = wireBytes(patch);
    const ratio = patchBytes / snapshotBytes;
    expect(ratio, `status patch ${patchBytes} B vs snapshot ${snapshotBytes} B (${(ratio * 100).toFixed(2)}%)`).toBeLessThan(0.1);
  });

  it("keeps every change that leaves the tabs alone below 10% of the snapshot with 30 tabs", () => {
    for (const [area, change] of nonTabChanges) {
      const patch = diffShellState(snapshot, change(snapshot));
      expect(patch, area).toBeDefined();
      // The whole area travels, and no other area does: the patch is exactly the fields of that area.
      expect(Object.keys(patch ?? {}).sort(), area).toEqual([...ShellStateAreas[area]].sort());
      expect(patch, area).not.toHaveProperty("tabs");
      const patchBytes = wireBytes(patch);
      const ratio = patchBytes / snapshotBytes;
      expect(ratio, `${area} patch ${patchBytes} B vs snapshot ${snapshotBytes} B (${(ratio * 100).toFixed(2)}%)`).toBeLessThan(0.1);
    }
  });

  it("sends nothing when the state did not change", () => {
    expect(diffShellState(snapshot, stateWithTabs(30))).toBeUndefined();
  });

  it("sends the tabs area whole when one tab changes, and nothing else", () => {
    const next = stateWithTabs(30);
    next.tabs[4] = { ...next.tabs[4], title: "Another title" };
    const patch = diffShellState(snapshot, next);
    // The active tab's own fields ride along with the tab list: the UI reads the list and the address bar as one area.
    expect(Object.keys(patch ?? {}).sort()).toEqual(["activeUrl", "isFavorite", "tabs"]);
    expect(patch?.tabs).toHaveLength(30);
    expect(patch?.status).toBeUndefined();
    expect(wireBytes(patch)).toBeLessThan(snapshotBytes);
  });

  it("treats a new object with the same values as unchanged", () => {
    const next = stateWithTabs(30);
    next.theme = { ...next.theme };
    expect(diffShellState(snapshot, next)).toBeUndefined();
  });

  it("applies a patch over the state the renderer already has", () => {
    const patch = diffShellState(snapshot, { ...snapshot, status: "BLOCKED" })!;
    const merged = applyShellStatePatch(snapshot, patch);
    expect(merged.status).toBe("BLOCKED");
    expect(merged.tabs).toHaveLength(30);
    expect(snapshot.status).toBe("READY");
  });

  it("places each state field in exactly one area", () => {
    const placed = (Object.keys(ShellStateAreas) as ShellStateArea[]).flatMap((area) => [...ShellStateAreas[area]]);
    // The snapshot carries every required field; the optional ones are absent until they have a value.
    for (const field of Object.keys(snapshot)) expect(placed, field).toContain(field);
    for (const field of ["permission", "keyboard", "find"]) expect(placed, field).toContain(field);
    expect(new Set(placed).size).toBe(placed.length);
  });
});
