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

## TV identity

Before the first navigation, the app appends `JoyChromiumTV/0.1 (TV; SmartTV)` to WebView2's user-agent. WebView2 applies it to site navigations and subresources; it cannot be toggled off in this prototype. Overriding the user-agent can clear User-Agent Client Hints, and a TV token does not guarantee every site— including YouTube—will serve its TV interface. The app bridges controller directions as keyboard arrows; page-level Gamepad API support still depends on WebView2/runtime behavior.

## Build and checks

```powershell
dotnet build .\JoyChromium.csproj --configuration Release
dotnet run --project .\tests\TvIdentity.Smoke.csproj --configuration Release
```

GitHub Actions runs these checks on Windows. This is an early prototype: it has no extension support, or independent Chromium update pipeline.
