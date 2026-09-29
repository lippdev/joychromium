import { app, BrowserWindow, session } from "electron";
import { join } from "node:path";
import { AdBlock } from "./adblock";
import { ensureTvIdentity } from "./tvIdentity";

// Phase 0 proof of concept: one window, TV user agent, ad blocking. The full shell follows in phase 1.
const START_PAGE = "https://www.youtube.com/tv";

/** State the end-to-end test reads through `electronApp.evaluate`. */
export interface JoyState {
  adblockReady: boolean;
  userAgent: string;
  /** Diagnostics hook: would the engine block a script request to this URL? */
  wouldBlock: (url: string) => boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var joy: JoyState;
}

globalThis.joy = { adblockReady: false, userAgent: "", wouldBlock: () => false };

async function start(): Promise<void> {
  const dataDir = process.env.JOYCHROMIUM_DATA ?? app.getPath("userData");
  const adblock = new AdBlock(dataDir);
  try {
    await adblock.load();
    adblock.enable(session.defaultSession);
  } catch (error) {
    console.error("Ad blocking unavailable:", error);
  }
  globalThis.joy.adblockReady = adblock.isReady;
  globalThis.joy.wouldBlock = (url) => adblock.wouldBlock(url);

  const userAgent = ensureTvIdentity(session.defaultSession.getUserAgent());
  session.defaultSession.setUserAgent(userAgent);
  globalThis.joy.userAgent = userAgent;

  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0C0E13",
    title: "JoyChromium",
    webPreferences: {
      preload: join(__dirname, "..", "preload", "preload.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await window.loadURL(process.env.JOYCHROMIUM_START ?? START_PAGE);
}

app.whenReady().then(start).catch((error) => {
  console.error(error);
  app.exit(1);
});

app.on("window-all-closed", () => app.quit());
