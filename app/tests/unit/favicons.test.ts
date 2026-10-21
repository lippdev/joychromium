import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FAVICON_MAX_BYTES, FaviconStore, faviconHost, pickFavicon, readFavicon, sniffImage } from "../../src/main/favicons";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const ICO = Buffer.from([0, 0, 1, 0, 1, 0, 16, 16]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>');
const respond = (body: Uint8Array | string, status = 200, headers: Record<string, string> = {}) => async () => new Response(body as BodyInit, { status, headers });

describe("favicon host and choice", () => {
  it("accepts plain web hosts only", () => {
    expect(faviconHost("https://www.YouTube.com/watch?v=1")).toBe("www.youtube.com");
    expect(faviconHost("http://localhost:3000/x")).toBe("localhost");
    expect(faviconHost("joychromium://newtab")).toBeUndefined();
    expect(faviconHost("https://[::1]/")).toBeUndefined();
    expect(faviconHost("not a url")).toBeUndefined();
    expect(faviconHost(undefined)).toBeUndefined();
  });

  it("prefers a web icon over a data one", () => {
    expect(pickFavicon(["data:image/png;base64,AAAA", "https://a.example/i.png"])).toBe("https://a.example/i.png");
    expect(pickFavicon(["joychromium://logo.png", "data:image/png;base64,AAAA"])).toBe("data:image/png;base64,AAAA");
    expect(pickFavicon(["joychromium://logo.png"])).toBeUndefined();
  });
});

describe("reading a favicon", () => {
  it("trusts the bytes, not the header", async () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(ICO)).toBe("image/x-icon");
    expect(sniffImage(SVG)).toBe("image/svg+xml");
    expect(sniffImage(Buffer.from("<html><script>alert(1)</script>"))).toBeUndefined();
    const icon = await readFavicon("https://a.example/f.ico", respond(PNG, 200, { "content-type": "text/html" }));
    expect(icon?.mime).toBe("image/png");
  });

  it("refuses what is not an image, is too big, or fails", async () => {
    expect(await readFavicon("https://a.example/f", respond("<html></html>"))).toBeUndefined();
    expect(await readFavicon("https://a.example/f", respond(PNG, 404))).toBeUndefined();
    expect(await readFavicon("https://a.example/f", respond(Buffer.concat([PNG, Buffer.alloc(FAVICON_MAX_BYTES)])))).toBeUndefined();
    expect(await readFavicon("https://a.example/f", async () => { throw new Error("offline"); })).toBeUndefined();
    expect(await readFavicon("file:///C:/x.png", respond(PNG))).toBeUndefined();
  });

  it("decodes a data icon and upgrades a plain http one", async () => {
    expect((await readFavicon(`data:image/png;base64,${PNG.toString("base64")}`, respond("")))?.mime).toBe("image/png");
    expect((await readFavicon(`data:image/svg+xml,${encodeURIComponent(SVG.toString())}`, respond("")))?.mime).toBe("image/svg+xml");
    let asked = "";
    await readFavicon("http://a.example/f.png", async (url) => { asked = url; return new Response(PNG); });
    expect(asked).toBe("https://a.example/f.png");
  });
});

describe("favicon store", () => {
  const temp = () => mkdtempSync(join(tmpdir(), "joy-fav-"));

  it("keeps an icon on disk and finds it again in a new run", () => {
    const dir = temp();
    try {
      const store = new FaviconStore(join(dir, "favicons"));
      expect(store.urlFor("a.example")).toBeUndefined();
      store.put("a.example", { mime: "image/png", bytes: PNG }, true);
      expect(store.urlFor("a.example")).toMatch(/^joychromium:\/\/favicon\/\?host=a\.example&v=\d+&k=[0-9a-f]{32}$/);
      const again = new FaviconStore(join(dir, "favicons"));
      expect(again.has("a.example")).toBe(true);
      expect(again.get("a.example")).toEqual({ mime: "image/png", bytes: PNG });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("changes the address when the icon changes, so a shown icon refreshes", () => {
    const dir = temp();
    try {
      const store = new FaviconStore(join(dir, "f"));
      store.put("a.example", { mime: "image/png", bytes: PNG }, true);
      const first = store.urlFor("a.example");
      store.put("a.example", { mime: "image/x-icon", bytes: ICO }, true);
      expect(store.urlFor("a.example")).not.toBe(first);
      // One file per host: the old format is gone.
      expect(readdirSync(join(dir, "f"))).toEqual(["a.example.ico"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps a private tab's icon in memory only", () => {
    const dir = temp();
    try {
      const store = new FaviconStore(join(dir, "f"));
      store.put("secret.example", { mime: "image/png", bytes: PNG }, false);
      expect(store.get("secret.example")?.mime).toBe("image/png");
      expect(existsSync(join(dir, "f"))).toBe(false);
      expect(new FaviconStore(join(dir, "f")).has("secret.example")).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("drops the oldest icons beyond its limit and clears everything on request", () => {
    const dir = temp();
    try {
      const store = new FaviconStore(join(dir, "f"), () => undefined, 2);
      for (const host of ["a.example", "b.example", "c.example"]) store.put(host, { mime: "image/png", bytes: PNG }, true);
      expect(store.has("a.example")).toBe(false);
      expect(readdirSync(join(dir, "f")).sort()).toEqual(["b.example.png", "c.example.png"]);
      store.clear();
      expect(store.has("b.example")).toBe(false);
      expect(existsSync(join(dir, "f"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
