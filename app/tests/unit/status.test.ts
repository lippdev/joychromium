import { describe, expect, it } from "vitest";
import { dictionary, t } from "../../src/shared/i18n";
import { STATUS_IDS, statusText } from "../../src/shared/status";

describe("shell messages", () => {
  it("has a text in both languages for every message the shell raises", () => {
    const missing = STATUS_IDS.flatMap((id) => [
      ["en", dictionary("en")],
      ["pt-BR", dictionary("pt-BR")],
    ].filter(([, table]) => !(table as Record<string, string>)[`status.${id}`]).map(([language]) => `${language}/${id}`));
    expect(missing).toEqual([]);
  });

  it("translates with the language in effect", () => {
    expect(statusText("popupBlocked", "en")).toBe("POPUP BLOCKED");
    expect(statusText("popupBlocked", "pt-BR")).toBe("POPUP BLOQUEADO");
    // A missing language falls back to Portuguese, the way the rest of the dictionary does.
    expect(statusText("popupBlocked", undefined)).toBe(t(undefined, "status.popupBlocked"));
  });

  it("appends the detail the caller has, and nothing when it has none", () => {
    expect(statusText("downloadBlocked", "en", "setup.exe")).toBe("DOWNLOAD BLOCKED · setup.exe");
    expect(statusText("blockedHost", "pt-BR", "evil.example")).toBe("BLOQUEADO PELA POLICY · evil.example");
    expect(statusText("downloaded", "en")).toBe("DOWNLOADED");
  });
});
