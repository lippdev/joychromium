import { describe, expect, it } from "vitest";
import { resolveAddressInput } from "../../src/shared/addressInput";

const open = (url: string) => ({ kind: "open", url });
const search = (text: string) => ({ kind: "search", text });

describe("address or search", () => {
  it("opens what looks like an address, with https when no scheme is typed", () => {
    expect(resolveAddressInput("youtube.com")).toEqual(open("https://youtube.com"));
    expect(resolveAddressInput("  www.youtube.com/watch?v=abc  ")).toEqual(open("https://www.youtube.com/watch?v=abc"));
    expect(resolveAddressInput("g1.globo.com")).toEqual(open("https://g1.globo.com"));
    expect(resolveAddressInput("site.com.br/tv#x")).toEqual(open("https://site.com.br/tv#x"));
    expect(resolveAddressInput("YouTube.COM")).toEqual(open("https://YouTube.COM"));
    expect(resolveAddressInput("example.com:8080/a")).toEqual(open("https://example.com:8080/a"));
  });

  it("keeps a typed scheme and the internal pages as they are", () => {
    expect(resolveAddressInput("https://a.example/x")).toEqual(open("https://a.example/x"));
    expect(resolveAddressInput("http://a.example")).toEqual(open("http://a.example"));
    expect(resolveAddressInput("joychromium://history")).toEqual(open("joychromium://history"));
  });

  it("uses http for this machine and the local network", () => {
    expect(resolveAddressInput("localhost:3000")).toEqual(open("http://localhost:3000"));
    expect(resolveAddressInput("localhost")).toEqual(open("http://localhost"));
    expect(resolveAddressInput("192.168.0.10:8096/web")).toEqual(open("http://192.168.0.10:8096/web"));
  });

  it("searches everything else", () => {
    expect(resolveAddressInput("youtube")).toEqual(search("youtube"));
    expect(resolveAddressInput("filmes de terror 2026")).toEqual(search("filmes de terror 2026"));
    expect(resolveAddressInput("youtube.com tutorial")).toEqual(search("youtube.com tutorial"));
    expect(resolveAddressInput("ok.")).toEqual(search("ok."));
    expect(resolveAddressInput("e.g")).toEqual(search("e.g"));
    expect(resolveAddressInput("config.json")).toEqual(search("config.json"));
    // Not a navigable scheme: searched, never run.
    expect(resolveAddressInput("javascript:alert(1)")).toEqual(search("javascript:alert(1)"));
    expect(resolveAddressInput("file:///C:/x.html")).toEqual(search("file:///C:/x.html"));
  });

  it("ignores an empty entry", () => {
    expect(resolveAddressInput("   ")).toBeUndefined();
  });
});
