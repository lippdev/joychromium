# JoyChromium

A Windows browser based on Chromium, designed for complete navigation with a game controller and a persistent TV-compatible browsing identity.

## Product requirements

- Make core browser flows usable with a gamepad alone; keyboard and mouse are optional, not prerequisites.
- Keep a TV/device identity signal enabled for every page so supported services can offer their TV experience. Validate this against YouTube and other supported sites; the implementation mechanism is still to be determined.
- Take interaction and visual inspiration from Edge on Xbox without reusing Microsoft branding or assets.
- Keep Chromium as the upstream browser engine and preserve a clear path for upstream security updates.

## Status

Pre-alpha. This repository is the product project, not a fork, and does not contain Chromium source or a runnable browser yet. The Chromium source/build integration will be chosen before implementation begins.
