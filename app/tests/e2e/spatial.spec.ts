import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The spatial script runs in every frame, so an embedded player is navigable with the D-pad and the page never sees it.
let data: string;
let app: ElectronApplication;
let server: Server;
let thirdParty: string;

test.beforeEach(async () => {
  data = mkdtempSync(join(tmpdir(), "joychromium-e2e-spatial-"));
  writeFileSync(join(data, "settings.json"), JSON.stringify({ onboardingCompleted: true, startup: "NewTab", windowMode: "window" }));
  app = await electron.launch({ args: ["."], env: { ...process.env, JOYCHROMIUM_DATA: data } });
  // A frame from another origin, served locally: the cross-origin case of a third-party player without needing the network.
  server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      '<!doctype html><body style="margin:0">' +
        '<script>parent.postMessage("script:" + typeof window.__joy, "*");' +
        'addEventListener("focusin", function (event) { parent.postMessage("focus:" + event.target.id, "*"); });</script>' +
        '<button id="one" style="position:absolute;left:20px;top:20px;width:160px;height:40px">one</button></body>',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  thirdParty = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : "";
});

test.afterEach(async () => {
  await app.close().catch(() => undefined);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(data, { recursive: true, force: true });
});

const tabs = () => app.evaluate(() => globalThis.joy.tabs());
const command = (c: unknown) => app.evaluate(({}, cmd) => globalThis.joy.command(cmd), c);
const pageEval = <T>(script: string) => app.evaluate(({}, code) => globalThis.joy.pageEval(code), script) as Promise<T>;
const press = (direction: "up" | "down" | "left" | "right") =>
  app.evaluate(({}, d) => globalThis.joy.controller({ type: "direction", direction: d }), direction);

/** A page shaped like an embedded player: a button above the iframe, two inside it, one below. */
const buildPlayerPage = `(() => {
  document.body.style.margin = '0';
  const button = (id, top) => {
    const b = document.createElement('button');
    b.id = id;
    b.textContent = id;
    b.style.cssText = 'position:absolute;left:20px;top:' + top + 'px;width:160px;height:40px';
    document.body.appendChild(b);
  };
  button('above', 20);
  const frame = document.createElement('iframe');
  frame.id = 'player';
  frame.style.cssText = 'position:absolute;left:20px;top:100px;width:600px;height:300px;border:0';
  frame.srcdoc = '<body style="margin:0">' +
    '<button id="one" style="position:absolute;left:20px;top:20px;width:160px;height:40px">one</button>' +
    '<button id="two" style="position:absolute;left:20px;top:100px;width:160px;height:40px">two</button></body>';
  document.body.appendChild(frame);
  button('below', 440);
  return true;
})()`;

const openBlankPage = async () => {
  await app.firstWindow();
  await expect.poll(tabs, { timeout: 30_000 }).toHaveLength(1);
  await command({ type: "navigate", url: "about:blank" });
  await expect.poll(async () => (await tabs()).find((t) => t.isActive)?.isLoading, { timeout: 30_000 }).toBe(false);
};

test("the D-pad reaches a player inside an iframe and the frame's page cannot see the script", async () => {
  await openBlankPage();
  await pageEval(buildPlayerPage);
  await expect.poll(() => pageEval<boolean>("Boolean(document.getElementById('player')?.contentDocument?.getElementById('one'))"), { timeout: 15_000 }).toBe(true);

  // The frame is its own document with its own isolated world: the script is there, the frame's page cannot see it.
  expect(await pageEval<string>("typeof document.getElementById('player').contentWindow.__joy")).toBe("undefined");
  expect(await pageEval<string>("typeof document.getElementById('player').contentWindow.__joyCursor")).toBe("undefined");
  await expect.poll(() => app.evaluate(() => globalThis.joy.spatialWorld()), { timeout: 15_000 }).toEqual({ isolated: "object", page: "undefined" });

  // Entering: down from the button above moves the focus onto the iframe and then to its first control.
  await pageEval("document.getElementById('above').focus()");
  expect(await pageEval<string>("document.activeElement.id")).toBe("above");
  await press("down");
  await expect.poll(() => pageEval<string>("document.activeElement.id")).toBe("player");
  await expect.poll(() => pageEval<string>("document.getElementById('player').contentDocument.activeElement.id")).toBe("one");
  expect(await pageEval<string>("document.getElementById('player').contentDocument.activeElement.className")).toBe("__joy-focus");

  // Inside: the next press moves within the frame's own document.
  await press("down");
  await expect.poll(() => pageEval<string>("document.getElementById('player').contentDocument.activeElement.id")).toBe("two");

  // Leaving: with nothing left below, the focus returns to the iframe and the press continues in the page.
  await press("down");
  await expect.poll(() => pageEval<string>("document.activeElement.id")).toBe("below");

  // And back in through the top edge of the frame.
  await press("up");
  await expect.poll(() => pageEval<string>("document.activeElement.id")).toBe("player");
  await expect.poll(() => pageEval<boolean>("document.getElementById('player').contentDocument.activeElement.classList.contains('__joy-focus')")).toBe(true);
});

test("a player from another origin is navigated too, and its page cannot see the script", async () => {
  await openBlankPage();

  // The parent page cannot read into the frame, so the frame's own page reports what happens inside it.
  await pageEval(`(() => {
    document.body.style.margin = '0';
    window.seen = [];
    addEventListener('message', (event) => { window.seen.push(String(event.data)); });
    const above = document.createElement('button');
    above.id = 'above';
    above.textContent = 'above';
    above.style.cssText = 'position:absolute;left:20px;top:20px;width:160px;height:40px';
    document.body.appendChild(above);
    const frame = document.createElement('iframe');
    frame.id = 'third';
    frame.style.cssText = 'position:absolute;left:20px;top:100px;width:600px;height:300px;border:0';
    frame.src = ${JSON.stringify(thirdParty)};
    document.body.appendChild(frame);
    return true;
  })()`);

  await expect.poll(() => pageEval<boolean>("document.getElementById('third').contentDocument === null")).toBe(true);
  await expect.poll(() => pageEval<string[]>("window.seen"), { timeout: 15_000 }).toContain("script:undefined");

  await pageEval("document.getElementById('above').focus()");
  await press("down");
  await expect.poll(() => pageEval<string[]>("window.seen"), { timeout: 15_000 }).toContain("focus:one");
});
