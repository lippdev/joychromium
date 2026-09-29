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

/// <summary>Everything the user can configure. Missing or invalid values fall back to defaults on load.</summary>
public sealed record AppSettings
{
    public Theme Theme { get; init; } = Theme.Default;
    public SearchEngine SearchEngine { get; init; } = SearchEngine.Google;
    public bool AdBlockEnabled { get; init; } = true;
    public bool OnboardingCompleted { get; init; }
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

    public static string DataFolder { get; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JoyChromium");

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
        File.WriteAllText(SettingsPath, JsonSerializer.Serialize(new RawSettings
        {
            Theme = new RawTheme(settings.Theme.Accent, settings.Theme.Background, settings.Theme.Surface, settings.Theme.Text),
            SearchEngine = new RawSearch(settings.SearchEngine.Name, settings.SearchEngine.Template),
            AdBlockEnabled = settings.AdBlockEnabled,
            OnboardingCompleted = settings.OnboardingCompleted,
        }, Options));
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
    }

    private sealed record RawTheme(string? Accent, string? Background, string? Surface, string? Text);
    private sealed record RawSearch(string? Name, string? Template);
}
