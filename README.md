# JoyChromium

A Windows browser prototype with a controller-first shell and an always-on TV user-agent marker. The first build uses WPF and Microsoft WebView2 (the Chromium engine shipped as the Edge WebView2 Runtime); it is **not** a fork or checkout of `chromium/chromium`.

## Run

Requirements: Windows 10/11, .NET 8 SDK, and the Microsoft Edge WebView2 Evergreen Runtime.

```powershell
dotnet run --project .\JoyChromium.csproj
```

It opens YouTube's TV route. The address bar accepts URLs or search text; the in-app keyboard also opens when a page text field receives focus.

## Controller

An Xbox/XInput-compatible controller is supported. D-pad and left stick move the on-screen keyboard or send arrow keys into the page; A selects/activates, B goes back or closes the keyboard, LB/RB go back/forward, X reloads, Y opens the controller keyboard, Start opens a new tab, Back (view) closes the current tab, and LT/RT switch tabs. `Ctrl+L`, `Ctrl+R`, `Ctrl+T`, `Ctrl+W` and `Ctrl+Tab` are available too.

## Themes

The gear button, `Ctrl+,` or typing `joychromium://settings` opens an internal settings page with color presets and custom accent/background/surface/text colors. The choice is saved to `%LocalAppData%JoyChromiumsettings.json` and applied at startup.

## Start page, new tabs and session

New tabs open an internal page (`joychromium://newtab`) with a search box and editable shortcuts. Settings → *Start & new tab* chooses what opens at startup (new tab page, home, a custom URL or the tabs from the last session), what new tabs show, and the home (⌂) URL. Open tabs are saved to `%LocalAppData%JoyChromiumsession.json` on exit.

## Ad blocking, search and onboarding

uBlock Origin is downloaded from its official GitHub release during the build (`FetchUBlock` target, version pinned in the csproj) and installed into the WebView2 profile as an unpacked extension; it can be toggled in Settings. Address-bar text that is not a URL is searched with the chosen engine (Google by default; DuckDuckGo, Bing, Brave, Startpage or a custom `%s` template). On first launch a `joychromium://welcome` onboarding walks through theme, search engine and ad blocking.

## Security defaults

HTTPS-only (http is upgraded; a failed upgrade shows an internal page that can fall back for that host in this session), certificate errors are always blocked, only `http(s)` and `joychromium://` addresses navigate, camera/microphone/location/notifications prompt every time unless remembered, downloads go to `DownloadsJoyChromium` with risky extensions refused and SmartScreen checks on, tracking prevention is Balanced, password saving and autofill are off, DevTools and context menus are off in Release, popups are rate-limited, `Ctrl+Shift+N` opens a private tab. Optional DNS-over-HTTPS (Cloudflare/Quad9/Google). Everything is in Settings → Privacy & security; the app warns if the WebView2 runtime is older than `SecurityPolicy.MinimumRuntimeVersion`.

## TV identity

Before the first navigation, the app appends `JoyChromiumTV/0.1 (TV; SmartTV)` to WebView2's user-agent. WebView2 applies it to site navigations and subresources; it cannot be toggled off in this prototype. Overriding the user-agent can clear User-Agent Client Hints, and a TV token does not guarantee every site— including YouTube—will serve its TV interface. The app bridges controller directions as keyboard arrows; page-level Gamepad API support still depends on WebView2/runtime behavior.

## Build and checks

```powershell
dotnet build .\JoyChromium.csproj --configuration Release
dotnet run --project .\tests\TvIdentity.Smoke.csproj --configuration Release
```

GitHub Actions runs these checks on Windows. This is an early prototype: it has no extension support, or independent Chromium update pipeline.
