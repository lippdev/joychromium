# Flatpak

`dev.lipp.joychromium.yml` builds the app from this checkout and packages `app/dist` + `app/package.json`, its runtime
dependencies and the Electron runtime. The engine is the `node_modules/electron` build — the castLabs Electron for
Content Security, the same one the other installers ship (ADR-009) — because
`org.electronjs.Electron2.BaseApp` provides `zypak` and the system libraries but no `electron` binary. zypak is what
makes Chromium's sandbox work inside the Flatpak sandbox; `run.sh` starts the app through it.

## Building locally

```bash
sudo flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
sudo flatpak install -y flathub \
  org.freedesktop.Platform//26.08 org.freedesktop.Sdk//26.08 \
  org.electronjs.Electron2.BaseApp//26.08 org.freedesktop.Sdk.Extension.node24//26.08

flatpak-builder --force-clean --disable-rofiles-fuse --default-branch=stable \
  --repo=flatpak/repo --state-dir=flatpak/state flatpak/build flatpak/dev.lipp.joychromium.yml
flatpak build-bundle --arch=x86_64 flatpak/repo JoyChromium.flatpak dev.lipp.joychromium stable
flatpak install --user -y ./JoyChromium.flatpak
flatpak run dev.lipp.joychromium
```

The build needs network: `npm ci` fetches the dependency tree and `electron/install.js` downloads the ECS build. The
manifest grants it with `build-args: --share=network`, which is fine for a local build and for the `Flatpak` workflow,
and not accepted by Flathub — see below.

`.github/workflows/flatpak.yml` runs the same two commands on every change to `flatpak/` or `app/` and uploads the
bundle as an artifact. It publishes nothing.

## What is left for Flathub

Publication is not code: it needs an account, a repository under the `flathub` organization and a third-party review.
What a submission still needs, in order:

1. The `type: dir` source becomes a `type: git` source pinned to the release commit.
2. The npm and Electron downloads become offline sources — `flatpak-node-generator npm app/package-lock.json` — because
   the Flathub build sandbox has no network. Remove `build-args: --share=network` when that lands.
3. At least one screenshot in `dev.lipp.joychromium.metainfo.xml`; Flathub asks for it in review and there is none in
   the repository yet.
4. The manifest is copied into a PR against `flathub/dev.lipp.joychromium` with the app id, icon and desktop file as
   they are here.

## What the sandbox does and does not allow

- Downloads and the diagnostics zip land in `~/Downloads/JoyChromium` through `--filesystem=xdg-download`; the rest of
  the home directory is not shared.
- Controllers: the manifest grants `--device=dri` and no input devices, so `/dev/input` is not in the sandbox and the
  Gamepad API sees nothing — keyboard, mouse and TV remotes work. `--device=input` (Flatpak 1.15.6 and newer) is the
  narrow opt-in and cannot go in the manifest yet: Flatpak 1.14, which Ubuntu 24.04 ships and the CI runner uses,
  rejects it with `Unknown device type input, valid types are: dri, all, kvm, shm`. On those versions the wider
  `flatpak override --user --device=all dev.lipp.joychromium` is the only way in.
- The app never updates itself in the sandbox: the settings row says updates come from Flathub and no download is
  offered (see `app/src/main/updater.ts`, `FLATPAK_UPDATE_STATUS`).
- Widevine still comes from the ECS build's component download on first use, the same path the other Linux installers
  take.
