using JoyChromium;

var source = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36";
var tvAgent = TvIdentity.Ensure(source);
if (!TvIdentity.IsActive(tvAgent) || !tvAgent.Contains("(TV; SmartTV)", StringComparison.Ordinal))
    throw new InvalidOperationException("TV marker missing from effective user-agent.");
if (TvIdentity.Ensure(tvAgent) != tvAgent)
    throw new InvalidOperationException("TV marker must be applied exactly once.");
Console.WriteLine("TV user-agent marker is present and idempotent.");

var theme = Theme.Default;
if (!Theme.IsHexColor(theme.Accent) || Theme.IsHexColor("#12345") || Theme.IsHexColor("64DDB5"))
    throw new InvalidOperationException("Hex color validation is wrong.");
if (Theme.Mix("#000000", "#FFFFFF", 0.5) != "#808080")
    throw new InvalidOperationException("Color mix is wrong.");
if (theme.IsLight || !Theme.Presets["Light"].IsLight)
    throw new InvalidOperationException("Light/dark detection is wrong.");
if (Theme.TryParse("#123456", "nope", "#000000", "#FFFFFF") is not null)
    throw new InvalidOperationException("TryParse must reject invalid colors.");
if (SettingsStore.Load() is null)
    throw new InvalidOperationException("SettingsStore.Load must always return settings.");
Console.WriteLine("Theme parsing, mixing and presets are consistent.");

if (SearchEngine.Google.BuildQuery("joy chromium").AbsoluteUri != "https://www.google.com/search?q=joy%20chromium")
    throw new InvalidOperationException("Search query building is wrong.");
if (SearchEngine.IsValidTemplate("https://x.example/?q=") || SearchEngine.IsValidTemplate("ftp://x/%s") || !SearchEngine.IsValidTemplate("https://x.example/s?q=%s"))
    throw new InvalidOperationException("Search template validation is wrong.");
if (new AppSettings() is not { SearchEngine.Name: "Google", AdBlockEnabled: true, OnboardingCompleted: false })
    throw new InvalidOperationException("Default settings are wrong.");
Console.WriteLine("Search engine defaults and validation are consistent.");

var defaults = new AppSettings();
if (defaults.NewTabTarget != Pages.NewTabScheme || defaults.StartupTargets([]).Single() != Pages.NewTabScheme)
    throw new InvalidOperationException("Default new tab / startup targets are wrong.");
var restore = defaults with { Startup = StartupMode.Restore };
if (restore.StartupTargets(["https://a.example", "https://b.example"]).Count != 2 || restore.StartupTargets([]).Single() != Pages.NewTabScheme)
    throw new InvalidOperationException("Session restore targets are wrong.");
if (Pages.Resolve("JoyChromium://NewTab") != Pages.NewTabPage || Pages.Alias(Pages.SettingsPage) != Pages.SettingsScheme || Pages.Resolve("https://x.example") != "https://x.example")
    throw new InvalidOperationException("Internal page aliasing is wrong.");
if (Shortcut.TryParse("Bad", "ftp://x") is not null || Shortcut.TryParse(" ", "https://x.example") is not null || Shortcut.TryParse("Ok", "https://x.example") is null)
    throw new InvalidOperationException("Shortcut validation is wrong.");
Console.WriteLine("Startup, new tab and shortcut rules are consistent.");
