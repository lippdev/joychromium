/**
 * Boots the app on a native Wayland compositor and checks it renders there (E2-08).
 *
 * The compositor is headless Weston: no X server, no XWayland, and `DISPLAY` is removed from the environment, so a
 * window can only come from the Wayland path. What it proves: the app connects to the compositor, both views size
 * themselves to it, and both paint real pixels. Run it after `npm run build`, with `weston` installed.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WIDTH = 1600;
const HEIGHT = 900;
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const root = join(tmpdir(), `joychromium-wayland-${process.pid}`);
const data = join(root, "data");
const runtime = join(root, "run");
rmSync(root, { recursive: true, force: true });
mkdirSync(data, { recursive: true });
mkdirSync(runtime, { recursive: true, mode: 0o700 });
writeFileSync(join(data, "settings.json"), JSON.stringify({ onboardingCompleted: true, startup: "NewTab" }));

const env = { ...process.env, XDG_RUNTIME_DIR: runtime, WAYLAND_DISPLAY: "wayland-1", JOYCHROMIUM_DATA: data, XDG_SESSION_TYPE: "wayland" };
delete env.DISPLAY;

const weston = spawn("weston", ["--backend=headless-backend.so", `--width=${WIDTH}`, `--height=${HEIGHT}`, "--idle-time=0"], {
  env,
  stdio: ["ignore", "ignore", "ignore"],
});
let app;
const finish = (code, message) => {
  console.log(message);
  app?.kill("SIGTERM");
  weston.kill("SIGKILL");
  rmSync(root, { recursive: true, force: true });
  process.exit(code);
};

/** The app writes its first line to <data>/logs as soon as the main process is up. */
async function waitForStart(ms = 60_000) {
  const started = Date.now();
  while (Date.now() - started < ms) {
    try {
      const folder = join(data, "logs");
      for (const file of readdirSync(folder)) {
        if (readFileSync(join(folder, file), "utf8").includes("starting")) return readFileSync(join(folder, file), "utf8").trim().split("\n").pop();
      }
    } catch {
      // The folder appears only after the first log line.
    }
    await sleep(500);
  }
  return undefined;
}

async function cdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const call = (method, params = {}) =>
    new Promise((resolve) => {
      const callId = ++id;
      const handler = (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== callId) return;
        socket.removeEventListener("message", handler);
        resolve(message.result);
      };
      socket.addEventListener("message", handler);
      socket.send(JSON.stringify({ id: callId, method, params }));
    });
  return { call, close: () => socket.close() };
}

/** Screenshots of both views: a window that never painted has nothing to show, and a blank frame compresses to nothing. */
async function inspect(targets) {
  const report = {};
  for (const target of targets) {
    const session = await cdp(target.webSocketDebuggerUrl);
    const size = await session.call("Runtime.evaluate", { expression: "({ w: innerWidth, h: innerHeight, state: document.visibilityState })", returnByValue: true });
    const shot = await session.call("Page.captureScreenshot", { format: "png" });
    session.close();
    report[target.url.includes("chrome") ? "chrome" : "page"] = {
      size: size?.result?.value,
      bytes: shot?.data ? Buffer.from(shot.data, "base64").length : 0,
    };
  }
  return report;
}

await sleep(2000);
app = spawn(join("node_modules", ".bin", "electron"), [".", "--ozone-platform=wayland", `--remote-debugging-port=${PORT}`], { env, stdio: ["ignore", "ignore", "ignore"] });

const started = await waitForStart();
if (!started) finish(1, "FAIL: the app never started on Wayland");

let targets = [];
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    targets = list.filter((t) => t.type === "page");
    if (targets.some((t) => /\/\/chrome\//.test(t.url)) && targets.some((t) => /\/\/newtab\//.test(t.url))) break;
  } catch {
    // DevTools is up only after the main process starts listening.
  }
  await sleep(500);
}
if (targets.length < 2) finish(1, `FAIL: only these views came up on Wayland: ${targets.map((t) => t.url).join(", ") || "none"}`);

await sleep(2000);
const report = await inspect(targets);
const problems = [];
for (const [name, view] of Object.entries(report)) {
  if (!view.size || view.size.w !== WIDTH) problems.push(`${name} is ${view.size?.w ?? "?"}px wide, expected ${WIDTH}`);
  if (view.size?.state !== "visible") problems.push(`${name} reports visibility ${view.size?.state}`);
  if (view.bytes < 10_000) problems.push(`${name} painted ${view.bytes} bytes, which is a blank frame`);
}
if (Object.keys(report).length !== 2) problems.push(`expected the chrome and a page, got ${Object.keys(report).join(", ")}`);

const summary = Object.entries(report).map(([name, v]) => `${name} ${v.size?.w}x${v.size?.h} ${Math.round(v.bytes / 1024)}kB`).join(", ");
if (problems.length > 0) finish(1, `FAIL: ${problems.join("; ")}\n${started}\n${summary}`);
finish(0, `OK: native Wayland, no X11 — ${summary}\n${started}`);
