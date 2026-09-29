using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace JoyChromium;

/// <summary>A search provider: <see cref="Template"/> contains <c>%s</c> where the query goes.</summary>
public sealed record SearchEngine(string Name, string Template)
{
    public static SearchEngine Google { get; } = new("Google", "https://www.google.com/search?q=%s");

    public static IReadOnlyList<SearchEngine> Builtin { get; } =
    [
        Google,
        new("DuckDuckGo", "https://duckduckgo.com/?q=%s"),
        new("Bing", "https://www.bing.com/search?q=%s"),
        new("Brave", "https://search.brave.com/search?q=%s"),
        new("Startpage", "https://www.startpage.com/do/search?q=%s"),
    ];

    public static bool IsValidTemplate(string? template) =>
        !string.IsNullOrWhiteSpace(template) &&
        template.Contains("%s", StringComparison.Ordinal) &&
        Uri.TryCreate(template.Replace("%s", "q", StringComparison.Ordinal), UriKind.Absolute, out var uri) &&
        (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);

    public static SearchEngine? TryParse(string? name, string? template) =>
        IsValidTemplate(template) ? new SearchEngine(string.IsNullOrWhiteSpace(name) ? "Custom" : name.Trim(), template!.Trim()) : null;

    public Uri BuildQuery(string text) =>
        new(Template.Replace("%s", Uri.EscapeDataString(text), StringComparison.Ordinal));
}

/// <summary>What the first tab shows when the app starts.</summary>
public enum StartupMode { NewTab, Home, Restore, Custom }

/// <summary>What a freshly opened tab shows.</summary>
public enum NewTabMode { NewTabPage, Home, Custom }

/// <summary>A tile on the new tab page.</summary>
public sealed record Shortcut(string Name, string Url)
{
    public static IReadOnlyList<Shortcut> Default { get; } =
    [
        new("YouTube TV", "https://www.youtube.com/tv"),
        new("Twitch", "https://www.twitch.tv"),
        new("Netflix", "https://www.netflix.com"),
        new("Prime Video", "https://www.primevideo.com"),
        new("Disney+", "https://www.disneyplus.com"),
        new("Spotify", "https://open.spotify.com"),
    ];

    public static Shortcut? TryParse(string? name, string? url) =>
        Pages.IsWebUrl(url) && !string.IsNullOrWhiteSpace(name) ? new Shortcut(name.Trim(), url!.Trim()) : null;
}

/// <summary>Everything the user can configure. Missing or invalid values fall back to defaults on load.</summary>
public sealed record AppSettings
{
    public const string DefaultHomeUrl = "https://www.youtube.com/tv";

    public Theme Theme { get; init; } = Theme.Default;
    public SearchEngine SearchEngine { get; init; } = SearchEngine.Google;
    public bool AdBlockEnabled { get; init; } = true;
    public bool OnboardingCompleted { get; init; }
    public StartupMode Startup { get; init; } = StartupMode.NewTab;
    public string StartupUrl { get; init; } = DefaultHomeUrl;
    public NewTabMode NewTab { get; init; } = NewTabMode.NewTabPage;
    public string NewTabUrl { get; init; } = DefaultHomeUrl;
    public string HomeUrl { get; init; } = DefaultHomeUrl;
    public IReadOnlyList<Shortcut> Shortcuts { get; init; } = Shortcut.Default;
    public bool HttpsOnly { get; init; } = true;
    public TrackingLevel TrackingPrevention { get; init; } = TrackingLevel.Balanced;
    public DohProvider DnsOverHttps { get; init; } = DohProvider.Off;
    public bool PasswordAutosave { get; init; }
    public bool Autofill { get; init; }
    public bool BlockDangerousDownloads { get; init; } = true;

    /// <summary>Remembered permission decisions: host → permission kind → allowed.</summary>
    public IReadOnlyDictionary<string, IReadOnlyDictionary<string, bool>> SitePermissions { get; init; } =
        new Dictionary<string, IReadOnlyDictionary<string, bool>>();

    public AppSettings WithPermission(string host, string kind, bool allow)
    {
        var all = SitePermissions.ToDictionary(p => p.Key, p => (IReadOnlyDictionary<string, bool>)new Dictionary<string, bool>(p.Value));
        var site = all.TryGetValue(host, out var existing) ? new Dictionary<string, bool>(existing) : [];
        site[kind] = allow;
        all[host] = site;
        return this with { SitePermissions = all };
    }

    public AppSettings WithoutPermissions(string host) =>
        this with { SitePermissions = SitePermissions.Where(p => p.Key != host).ToDictionary(p => p.Key, p => p.Value) };

    /// <summary>URL a new tab should load. Internal pages are returned as their joychromium:// scheme.</summary>
    public string NewTabTarget => NewTab switch
    {
        NewTabMode.Home => HomeUrl,
        NewTabMode.Custom => NewTabUrl,
        _ => Pages.NewTabScheme,
    };

    /// <summary>URLs to open at startup; more than one only when restoring a session.</summary>
    public IReadOnlyList<string> StartupTargets(IReadOnlyList<string> lastSession) => Startup switch
    {
        StartupMode.Home => [HomeUrl],
        StartupMode.Custom => [StartupUrl],
        StartupMode.Restore when lastSession.Count > 0 => lastSession,
        _ => [NewTabTarget],
    };
}

/// <summary>Internal page addresses and their joychromium:// aliases.</summary>
public static class Pages
{
    public const string Host = "settings.joychromium";
    public const string SettingsScheme = "joychromium://settings";
    public const string WelcomeScheme = "joychromium://welcome";
    public const string NewTabScheme = "joychromium://newtab";
    public const string SettingsPage = $"https://{Host}/settings.html";
    public const string OnboardingPage = $"https://{Host}/onboarding.html";
    public const string NewTabPage = $"https://{Host}/newtab.html";
    public const string ErrorPage = $"https://{Host}/error.html";

    public static string ErrorPageFor(string url, string reason, bool upgraded) =>
        $"{ErrorPage}?url={Uri.EscapeDataString(url)}&reason={Uri.EscapeDataString(reason)}&upgraded={(upgraded ? 1 : 0)}";

    /// <summary>Maps a joychromium:// alias to the real page, or returns the input unchanged.</summary>
    public static string Resolve(string url) => url.ToLowerInvariant() switch
    {
        SettingsScheme => SettingsPage,
        WelcomeScheme => OnboardingPage,
        NewTabScheme => NewTabPage,
        _ => url,
    };

    /// <summary>Maps a real internal page back to its alias for display, or returns the input unchanged.</summary>
    public static string Alias(string url) => url switch
    {
        SettingsPage => SettingsScheme,
        OnboardingPage => WelcomeScheme,
        NewTabPage => NewTabScheme,
        _ => url,
    };

    public static bool IsInternal(string url) =>
        url is SettingsPage or OnboardingPage or NewTabPage || url.StartsWith(ErrorPage, StringComparison.Ordinal);

    public static bool IsWebUrl(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
}

/// <summary>Reads and writes settings.json in %LocalAppData%\JoyChromium.</summary>
public static class SettingsStore
{
    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>%LocalAppData%JoyChromium, or JOYCHROMIUM_DATA when set (tests use a throwaway folder).</summary>
    public static string DataFolder { get; } =
        Environment.GetEnvironmentVariable("JOYCHROMIUM_DATA") is { Length: > 0 } custom
            ? custom
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JoyChromium");

    public static string SettingsPath { get; } = Path.Combine(DataFolder, "settings.json");

    public static AppSettings Current { get; private set; } = new();

    public static AppSettings Load()
    {
        Current = ReadFile();
        return Current;
    }

    public static void Save(AppSettings settings)
    {
        Current = settings;
        Directory.CreateDirectory(DataFolder);
        File.WriteAllText(SettingsPath, Serialize(settings));
    }

    public static string Serialize(AppSettings settings) =>
        JsonSerializer.Serialize(new RawSettings
        {
            Theme = new RawTheme(settings.Theme.Accent, settings.Theme.Background, settings.Theme.Surface, settings.Theme.Text),
            SearchEngine = new RawSearch(settings.SearchEngine.Name, settings.SearchEngine.Template),
            AdBlockEnabled = settings.AdBlockEnabled,
            OnboardingCompleted = settings.OnboardingCompleted,
            Startup = settings.Startup.ToString(),
            StartupUrl = settings.StartupUrl,
            NewTab = settings.NewTab.ToString(),
            NewTabUrl = settings.NewTabUrl,
            HomeUrl = settings.HomeUrl,
            Shortcuts = settings.Shortcuts.Select(s => new RawShortcut(s.Name, s.Url)).ToList(),
            HttpsOnly = settings.HttpsOnly,
            TrackingPrevention = settings.TrackingPrevention.ToString(),
            DnsOverHttps = settings.DnsOverHttps.ToString(),
            PasswordAutosave = settings.PasswordAutosave,
            Autofill = settings.Autofill,
            BlockDangerousDownloads = settings.BlockDangerousDownloads,
            SitePermissions = settings.SitePermissions.ToDictionary(p => p.Key, p => new Dictionary<string, bool>(p.Value)),
        }, Options);

    public static string SessionPath { get; } = Path.Combine(DataFolder, "session.json");

    public static IReadOnlyList<string> LoadSession()
    {
        try
        {
            if (!File.Exists(SessionPath))
                return [];
            var urls = JsonSerializer.Deserialize<List<string>>(File.ReadAllText(SessionPath), Options) ?? [];
            return urls.Where(u => Pages.IsWebUrl(u) || u == Pages.NewTabScheme).ToList();
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            return [];
        }
    }

    public static void SaveSession(IEnumerable<string> urls)
    {
        try
        {
            Directory.CreateDirectory(DataFolder);
            File.WriteAllText(SessionPath, JsonSerializer.Serialize(urls.ToList(), Options));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Losing the session is not worth blocking shutdown.
        }
    }

    private static AppSettings ReadFile()
    {
        try
        {
            if (!File.Exists(SettingsPath))
                return new AppSettings();
            var raw = JsonSerializer.Deserialize<RawSettings>(File.ReadAllText(SettingsPath), Options);
            if (raw is null)
                return new AppSettings();
            return new AppSettings
            {
                Theme = Theme.TryParse(raw.Theme?.Accent, raw.Theme?.Background, raw.Theme?.Surface, raw.Theme?.Text) ?? Theme.Default,
                SearchEngine = SearchEngine.TryParse(raw.SearchEngine?.Name, raw.SearchEngine?.Template) ?? SearchEngine.Google,
                AdBlockEnabled = raw.AdBlockEnabled ?? true,
                OnboardingCompleted = raw.OnboardingCompleted ?? false,
                Startup = Enum.TryParse<StartupMode>(raw.Startup, true, out var startup) ? startup : StartupMode.NewTab,
                StartupUrl = Pages.IsWebUrl(raw.StartupUrl) ? raw.StartupUrl! : AppSettings.DefaultHomeUrl,
                NewTab = Enum.TryParse<NewTabMode>(raw.NewTab, true, out var newTab) ? newTab : NewTabMode.NewTabPage,
                NewTabUrl = Pages.IsWebUrl(raw.NewTabUrl) ? raw.NewTabUrl! : AppSettings.DefaultHomeUrl,
                HomeUrl = Pages.IsWebUrl(raw.HomeUrl) ? raw.HomeUrl! : AppSettings.DefaultHomeUrl,
                Shortcuts = raw.Shortcuts is null
                    ? Shortcut.Default
                    : raw.Shortcuts.Select(s => Shortcut.TryParse(s.Name, s.Url)).OfType<Shortcut>().ToList(),
                HttpsOnly = raw.HttpsOnly ?? true,
                TrackingPrevention = Enum.TryParse<TrackingLevel>(raw.TrackingPrevention, true, out var tracking) ? tracking : TrackingLevel.Balanced,
                DnsOverHttps = Enum.TryParse<DohProvider>(raw.DnsOverHttps, true, out var doh) ? doh : DohProvider.Off,
                PasswordAutosave = raw.PasswordAutosave ?? false,
                Autofill = raw.Autofill ?? false,
                BlockDangerousDownloads = raw.BlockDangerousDownloads ?? true,
                SitePermissions = (raw.SitePermissions ?? [])
                    .Where(p => !string.IsNullOrWhiteSpace(p.Key))
                    .ToDictionary(p => p.Key.ToLowerInvariant(), p => (IReadOnlyDictionary<string, bool>)new Dictionary<string, bool>(p.Value)),
            };
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            return new AppSettings();
        }
    }

    // Raw shapes keep file parsing lenient: every field is optional and validated separately.
    private sealed class RawSettings
    {
        public RawTheme? Theme { get; set; }
        public RawSearch? SearchEngine { get; set; }
        public bool? AdBlockEnabled { get; set; }
        public bool? OnboardingCompleted { get; set; }
        public string? Startup { get; set; }
        public string? StartupUrl { get; set; }
        public string? NewTab { get; set; }
        public string? NewTabUrl { get; set; }
        public string? HomeUrl { get; set; }
        public List<RawShortcut>? Shortcuts { get; set; }
        public bool? HttpsOnly { get; set; }
        public string? TrackingPrevention { get; set; }
        public string? DnsOverHttps { get; set; }
        public bool? PasswordAutosave { get; set; }
        public bool? Autofill { get; set; }
        public bool? BlockDangerousDownloads { get; set; }
        public Dictionary<string, Dictionary<string, bool>>? SitePermissions { get; set; }
    }

    private sealed record RawShortcut(string? Name, string? Url);

    private sealed record RawTheme(string? Accent, string? Background, string? Surface, string? Text);
    private sealed record RawSearch(string? Name, string? Template);
}
