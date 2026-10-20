#!/usr/bin/env node
// Measures the resolution a service really decodes with and without the per-site desktop user agent (E10-05).
//
//   cd app && npm run build
//   npm run measure:ua -- --url "https://www.netflix.com/watch/80100172" --seconds 120
//
// It opens the app on the profile it is told to use, samples `video.videoWidth × video.videoHeight` while playing,
// prints the user agent the page received and a markdown row for docs/DRM-UAS.md. Run it twice: once with
// "UA de desktop nos serviços de streaming" off and once with it on, on the same machine and the same day.
import { _electron as electron } from "@playwright/test";

const args = process.argv.slice(2);
const value = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const url = value("--url");
const seconds = Number(value("--seconds", "120"));
if (!url) {
  console.error('usage: npm run measure:ua -- --url "<watch page>" [--seconds 120]');
  process.exit(2);
}

const app = await electron.launch({ args: ["."], env: { ...process.env, JOYCHROMIUM_START: "about:blank" } });
await app.firstWindow();
await app.evaluate(({}, target) => globalThis.joy.command({ type: "navigate", url: target }), url);

const sample = () =>
  app.evaluate(({}, code) => globalThis.joy.pageEval(code),
    "(() => { const v = document.querySelector('video'); return v ? [v.videoWidth, v.videoHeight, v.currentTime, v.paused] : null })()");
const userAgent = () => app.evaluate(({}, code) => globalThis.joy.pageEval(code), "navigator.userAgent");

const startedAt = Date.now();
let best = [0, 0];
let lastTime = 0;
let stalled = 0;
while (Date.now() - startedAt < seconds * 1000) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const sampleNow = await sample();
  if (!sampleNow) {
    console.log(`${Math.round((Date.now() - startedAt) / 1000)}s · no <video> on the page yet`);
    continue;
  }
  const [width, height, time] = sampleNow;
  if (width * height > best[0] * best[1]) best = [width, height];
  stalled = time > lastTime ? 0 : stalled + 1;
  lastTime = Math.max(lastTime, time);
  console.log(`${Math.round((Date.now() - startedAt) / 1000)}s t=${Math.round(time)}s ${width}x${height} max=${best[0]}x${best[1]}`);
  if (stalled >= 3) {
    console.log("playback looks stalled: press play on the TV (A) and the measurement continues");
  }
}

const agent = await userAgent();
const tvIdentity = /JoyChromiumTV\//.test(agent);
await app.close();

console.log(`\nuser agent: ${agent}`);
console.log(`identity: ${tvIdentity ? "TV" : "desktop"}`);
const measured = best[0] > 0 ? `${best[0]}x${best[1]}` : undefined;
console.log(`max resolution: ${measured ?? "none — no video played, nothing to record"}`);
console.log(`\nrow for docs/DRM-UAS.md (fill service, date and who):`);
const tvSide = tvIdentity ? measured ?? "a medir" : "a medir";
const desktopSide = tvIdentity ? "a medir" : measured ?? "a medir";
console.log(`| _service_ | \`${new URL(url).hostname}\` | _${tvSide}_ | _${desktopSide}_ | — | ${new Date().toISOString().slice(0, 10)} | _quem_ | _notas_ |`);
process.exit(0);
