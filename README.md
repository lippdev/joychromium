# JoyChromium

A controller-first browser for the TV, built on Electron (Chromium). Windows and Linux, one code base. Every page announces itself as a TV (`JoyChromiumTV/1.0 (TV; SmartTV)`), ads and trackers are blocked out of the box, and a gamepad is a first-class way to browse.

## Run from source

Requirements: Node.js 24+.

```bash
cd app
npm ci
npm start
```

`npm start` compiles TypeScript and launches Electron. Useful environment variables: `JOYCHROMIUM_DATA` (data folder, defaults to the OS user-data dir) and `JOYCHROMIUM_START` (first URL, skips onboarding).

## Install

Installers are published on [GitHub Releases](https://github.com/lippdev/joychromium/releases): `.exe` (Windows, one-click), `.AppImage` and `.deb` (Linux). Installed builds update themselves in the background and apply the update when the app closes.

## Controller

Standard gamepads (Xbox, PlayStation, Switch Pro and anything the Gamepad API maps) work on both platforms.

| Input | Action |
|---|---|
| D-pad / left stick | move (see *input modes*) |
| A | select / activate |
| B | back, or close the keyboard / prompt |
| X | reload |
| Y | controller keyboard (hold LB: toggle favorite) |
| LB / RB | history back / forward |
| LT / RT | previous / next tab |
| Start | new tab |
| Back / View | close tab |
| Right stick click | cycle input mode |

Keyboard: `Ctrl+L` address, `Ctrl+T` new tab, `Ctrl+Shift+T` reopen closed, `Ctrl+Shift+N` private tab, `Ctrl+W` close, `Ctrl+Tab` switch, `Ctrl+D` favorite, `Ctrl+F` find, `Ctrl+H` history, `Ctrl+B` favorites, `Ctrl+M` mute, `Ctrl` `+`/`-`/`0` zoom, `F11` full screen, `Ctrl+,` settings.

### Input modes

Each site runs in one of three modes, remembered per host (Settings → Controller). **Spatial** (default): the D-pad jumps between links, buttons and fields using `spatial.js` (nearest element in that direction; scrolls when nothing is ahead). **Cursor**: the left stick moves a pointer, D-pad nudges, A clicks, right stick scrolls. **Arrows** (default for youtube.com and twitch.tv): D-pad and A are sent as arrow keys and Enter, for sites with their own 10-foot UI.

## Security defaults

Ad and tracker blocking (Ghostery engine with the EasyList/EasyPrivacy/uBlock lists, refreshed daily), HTTPS-only with a per-host fallback prompt, certificate errors always blocked, only `http(s)` and `joychromium://` addresses navigate, camera/microphone/location prompt every time unless remembered, downloads go to `Downloads/JoyChromium` with risky extensions refused, popups rate-limited, private tabs, password saving and autofill off. Optional DNS-over-HTTPS (Cloudflare/Quad9/Google). Everything is in Settings → Privacy & security.

## Staying up to date without waiting for a release

- **Engine**: Electron bundles Chromium. Dependabot proposes each Electron release daily; CI (Windows + Linux, unit tests, an end-to-end run of the real app, and a packaging build) gates it; a green run merges automatically and `release.yml` publishes a new version. Installed apps update themselves.
- **Block lists**: the engine re-downloads the lists every 24 hours from the official CDN.
- **Policy**: `policy/policy.json` (signed with `app/scripts/policy-sign.mjs`; public key embedded in `src/shared/policy.ts`) can raise the minimum Chromium, block hosts, add risky download extensions, mark broken app versions so the updater skips them, and show a message. It is fetched from `main`, verified, cached and can only tighten the defaults.

## Development

```bash
cd app
npm run typecheck
npm test          # vitest: the pure modules in src/shared and src/main
npm run test:e2e  # Playwright launches the real app with a throwaway profile
npm run dist      # local installer in app/release (no publish)
```

Layout: `src/shared` (pure rules), `src/main` (Electron main process), `src/preload` (sandboxed bridges), `src/renderer` (shell UI), `src/assets` (internal pages). See `CONTRIBUTING.md` for the branch and commit conventions and `docs/CHECKLIST.md` for what is done and what is planned.

## History

The first prototype was a WPF + WebView2 app (see the git history before the Electron migration). It was replaced because the WebView2 engine is Windows-only and the maintained C# bridges to a bundled Chromium lag years behind upstream; Electron keeps the engine current on every platform.
