// Renders docs/assets/demo.gif frame by frame (window.render(t) in scene.html), with Edge through Playwright:
//   node docs/assets/motion/render.cjs 20
//   ffmpeg -framerate 20 -i <tmp>/joychromium-demo-frames/%04d.png -vf "scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" -loop 0 docs/assets/demo.gif
const { chromium } = require("../../../app/node_modules/playwright");
const path = require("path"), fs = require("fs");
const FPS = Number(process.argv[2] || 20), only = process.argv[3];
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.goto(require("url").pathToFileURL(path.join(__dirname, "scene.html")).href);
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(require("os").tmpdir(), "joychromium-demo-frames"); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out);
  const total = await page.evaluate(() => window.TOTAL);
  const times = only ? only.split(",").map(Number) : Array.from({ length: Math.round(total * FPS) }, (_, i) => i / FPS);
  for (let i = 0; i < times.length; i++) {
    await page.evaluate((t) => window.render(t), times[i]);
    await page.screenshot({ path: path.join(out, String(i).padStart(4, "0") + ".png") });
  }
  await browser.close();
  console.log("frames:", times.length);
})();
