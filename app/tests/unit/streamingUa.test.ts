import { describe, expect, it } from "vitest";
import { chromeUserAgent, isStreamingHost, matchesHost, STREAMING_HOSTS, userAgentForUrl } from "../../src/shared/streamingUa";

const desktop = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36";
const tv = `${desktop} JoyChromiumTV/1.0 (TV; SmartTV)`;

describe("per-site streaming user agent", () => {
  it("drops the Electron and app tokens, as Chrome's own agent has neither", () => {
    expect(chromeUserAgent("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) JoyChromium/0.1.1-alpha Chrome/152.0.0.0 Electron/44.9.3 Safari/537.36"))
      .toBe("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36");
    expect(chromeUserAgent(tv)).toBe(tv);
  });
  it("matches a listed host and its subdomains only", () => {
    expect(matchesHost("netflix.com", "netflix.com")).toBe(true);
    expect(matchesHost("www.netflix.com", "netflix.com")).toBe(true);
    expect(matchesHost("WWW.Netflix.COM.", "netflix.com")).toBe(true);
    expect(matchesHost("netflix.com.evil.example", "netflix.com")).toBe(false);
    expect(matchesHost("notnetflix.com", "netflix.com")).toBe(false);
    expect(matchesHost("apple.com", "tv.apple.com")).toBe(false);
    expect(matchesHost(undefined, "netflix.com")).toBe(false);
    expect(isStreamingHost("www.primevideo.com")).toBe(true);
    expect(isStreamingHost("example.com")).toBe(false);
    expect(isStreamingHost(undefined)).toBe(false);
  });

  it("sends the desktop agent to a listed host when the rule is on", () => {
    expect(userAgentForUrl("https://www.netflix.com/browse", { desktop, tv, enabled: true })).toBe(desktop);
    expect(userAgentForUrl("https://netflix.com/", { desktop, tv, enabled: true })).toBe(desktop);
    expect(userAgentForUrl("https://www.primevideo.com/", { desktop, tv, enabled: true })).toBe(desktop);
  });

  it("keeps the TV agent everywhere else and when the rule is off", () => {
    expect(userAgentForUrl("https://example.com/", { desktop, tv, enabled: true })).toBe(tv);
    expect(userAgentForUrl("https://www.youtube.com/tv", { desktop, tv, enabled: true })).toBe(tv);
    expect(userAgentForUrl("https://netflix.com.evil.example/", { desktop, tv, enabled: true })).toBe(tv);
    expect(userAgentForUrl("about:blank", { desktop, tv, enabled: true })).toBe(tv);
    expect(userAgentForUrl("joychromium://settings", { desktop, tv, enabled: true })).toBe(tv);
    expect(userAgentForUrl("https://www.netflix.com/", { desktop, tv, enabled: false })).toBe(tv);
  });

  it("lists only bare hosts, so a pattern never carries a scheme or a path", () => {
    for (const host of STREAMING_HOSTS) {
      expect(host).toBe(host.toLowerCase().trim());
      expect(host).not.toContain("/");
      expect(host).not.toContain(":");
    }
  });
});
