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

if (!SecurityPolicy.IsNavigationAllowed("https://x.example") || SecurityPolicy.IsNavigationAllowed("file:///C:/x") ||
    SecurityPolicy.IsNavigationAllowed("javascript:alert(1)") || SecurityPolicy.IsNavigationAllowed("edge://settings"))
    throw new InvalidOperationException("Navigation allow-list is wrong.");
if (SecurityPolicy.UpgradeToHttps("http://x.example:80/a?b=1") != "https://x.example/a?b=1" || SecurityPolicy.UpgradeToHttps("https://x.example") is not null)
    throw new InvalidOperationException("HTTPS upgrade is wrong.");
if (!SecurityPolicy.IsDangerousDownload("setup.EXE") || SecurityPolicy.IsDangerousDownload("photo.jpg") || SecurityPolicy.SafeFileName("../../evil.txt") != "evil.txt")
    throw new InvalidOperationException("Download rules are wrong.");
if (!SecurityPolicy.RuntimeIsSupported("154.0.4258.37") || SecurityPolicy.RuntimeIsSupported("99.0.1.1") || SecurityPolicy.RuntimeIsSupported(null))
    throw new InvalidOperationException("Runtime version check is wrong.");
if (SecurityPolicy.BrowserArguments(DohProvider.Off) != "" || !SecurityPolicy.BrowserArguments(DohProvider.Quad9).Contains("dns.quad9.net"))
    throw new InvalidOperationException("DoH arguments are wrong.");
var popups = new List<DateTime>(); var t0 = DateTime.UtcNow;
if (!SecurityPolicy.AllowPopup(popups, t0) || !SecurityPolicy.AllowPopup(popups, t0) || !SecurityPolicy.AllowPopup(popups, t0) ||
    SecurityPolicy.AllowPopup(popups, t0) || !SecurityPolicy.AllowPopup(popups, t0.AddSeconds(2)))
    throw new InvalidOperationException("Popup limiter is wrong.");
var perms = new AppSettings().WithPermission("A.example", "Camera", false).WithPermission("a.example", "Microphone", true);
if (perms.SitePermissions.Count != 2 || perms.WithoutPermissions("a.example").SitePermissions.Count != 1)
    throw new InvalidOperationException("Permission bookkeeping is wrong.");
Console.WriteLine("Security policy rules are consistent.");

var policyBytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "policy.json"));
var policySig = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "policy.json.sig"));
if (!PolicyService.Verify(policyBytes, policySig) || PolicyService.Verify(policyBytes, policySig[..^4] + "AAAA") || PolicyService.Verify([.. policyBytes, 0x20], policySig))
    throw new InvalidOperationException("Policy signature verification is wrong.");
var shipped = PolicyService.Parse(policyBytes) ?? throw new InvalidOperationException("Shipped policy.json does not parse.");
if (shipped.Version < 1 || shipped.EffectiveMinimumRuntime != SecurityPolicy.MinimumRuntimeVersion)
    throw new InvalidOperationException("Shipped policy is inconsistent with the embedded defaults.");
var strict = new RemotePolicy { MinimumRuntimeVersion = "999.0.0.0", BlockedHosts = ["evil.example"] };
if (strict.EffectiveMinimumRuntime != "999.0.0.0" || !strict.BlocksHost("cdn.evil.example") || strict.BlocksHost("notevil.example") ||
    new RemotePolicy { MinimumRuntimeVersion = "1.0.0.0" }.EffectiveMinimumRuntime != SecurityPolicy.MinimumRuntimeVersion)
    throw new InvalidOperationException("Remote policy merge rules are wrong.");
Console.WriteLine("Remote policy signing and merge rules are consistent.");

var historyPath = Path.Combine(Path.GetTempPath(), "joychromium-test-" + Guid.NewGuid().ToString("N"), "history.jsonl");
var history = new History(historyPath);
var t1 = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
history.Record("https://a.example/one", "One", t1);
history.Record("https://a.example/one", "One (updated)", t1.AddSeconds(1));
history.Record("https://b.example/two", "Two", t1.AddSeconds(2));
history.Record("joychromium://settings", "Settings", t1.AddSeconds(3));
history.Record("https://settings.joychromium/settings.html", "Settings", t1.AddSeconds(4));
if (history.Count != 2 || history.Recent()[0].Url != "https://b.example/two" || history.Recent()[1].Title != "One (updated)")
    throw new InvalidOperationException("History recording/dedupe is wrong.");
if (history.Search("ONE").Count != 1 || history.Search("nothing").Count != 0)
    throw new InvalidOperationException("History search is wrong.");
if (new History(historyPath).Count != 2)
    throw new InvalidOperationException("History does not round-trip through its file.");
history.Remove("https://a.example/one");
if (history.Count != 1 || new History(historyPath).Count != 1)
    throw new InvalidOperationException("History removal is wrong.");
var favs = new AppSettings().ToggleFavorite("https://b.example/two", "Two");
if (!favs.IsFavorite || favs.Settings.Favorites.Count != 1 || favs.Settings.ToggleFavorite("https://b.example/two", "Two").Settings.Favorites.Count != 0)
    throw new InvalidOperationException("Favorite toggling is wrong.");
var suggestions = Suggestion.Build("two", favs.Settings.Favorites, history.Recent());
if (suggestions.Count != 1 || suggestions[0].Kind != "favorite" || Suggestion.Build("", favs.Settings.Favorites, history.Recent()).Count != 0 ||
    Suggestion.Build("joychromium://settings", favs.Settings.Favorites, history.Recent()).Count != 0)
    throw new InvalidOperationException("Suggestion building is wrong.");
Directory.Delete(Path.GetDirectoryName(historyPath)!, recursive: true);
Console.WriteLine("History, favorites and suggestions are consistent.");
