using System.Globalization;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace JoyChromium;

/// <summary>User-chosen shell colors. Everything else the UI needs is derived from these four.</summary>
public sealed record Theme(string Accent, string Background, string Surface, string Text)
{
    public static Theme Default { get; } = new("#64DDB5", "#0C0E13", "#14171E", "#F3F5F9");

    public static IReadOnlyDictionary<string, Theme> Presets { get; } = new Dictionary<string, Theme>
    {
        ["Mint"] = Default,
        ["Ocean"] = new("#4CC2FF", "#0B1220", "#121C2E", "#EAF2FF"),
        ["Ember"] = new("#FF7A45", "#15100E", "#1F1815", "#FFF1EA"),
        ["Violet"] = new("#B388FF", "#100D18", "#191424", "#F2EDFF"),
        ["Light"] = new("#0F7B6C", "#F4F6FA", "#FFFFFF", "#111418"),
    };

    /// <summary>Returns the theme if all colors parse, otherwise null.</summary>
    public static Theme? TryParse(string? accent, string? background, string? surface, string? text)
    {
        var colors = new[] { accent, background, surface, text };
        return colors.All(IsHexColor) ? new Theme(accent!, background!, surface!, text!) : null;
    }

    public static bool IsHexColor(string? value) =>
        value is { Length: 7 } && value[0] == '#' &&
        int.TryParse(value.AsSpan(1), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out _);

    [JsonIgnore] public bool IsLight => Luminance(Background) > 0.5;

    /// <summary>Text color that reads on top of the accent.</summary>
    [JsonIgnore] public string AccentText => Luminance(Accent) > 0.45 ? "#07120F" : "#FFFFFF";

    [JsonIgnore] public string Surface2 => Mix(Surface, Text, 0.06);
    [JsonIgnore] public string Hover => Mix(Surface, Text, 0.12);
    [JsonIgnore] public string Border => Mix(Surface, Text, 0.14);
    [JsonIgnore] public string Input => Mix(Background, Text, 0.02);
    [JsonIgnore] public string TextMuted => Mix(Text, Surface, 0.30);
    [JsonIgnore] public string TextFaint => Mix(Text, Surface, 0.50);
    [JsonIgnore] public string AccentDim => Mix(Accent, Background, 0.55);
    [JsonIgnore] public string AccentBg => Mix(Accent, Background, 0.88);
    [JsonIgnore] public string AccentBorder => Mix(Accent, Background, 0.70);
    [JsonIgnore] public string KeyboardBg => "#F0" + Surface[1..];

    public static double Luminance(string hex)
    {
        var (r, g, b) = Rgb(hex);
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    }

    /// <summary>Linear blend of two colors; <paramref name="amount"/> is how much of <paramref name="to"/> to use.</summary>
    public static string Mix(string from, string to, double amount)
    {
        var (r1, g1, b1) = Rgb(from);
        var (r2, g2, b2) = Rgb(to);
        int Blend(int a, int b) => (int)Math.Round(a + (b - a) * amount);
        return $"#{Blend(r1, r2):X2}{Blend(g1, g2):X2}{Blend(b1, b2):X2}";
    }

    private static (int R, int G, int B) Rgb(string hex)
    {
        var value = int.Parse(hex.AsSpan(1), NumberStyles.HexNumber, CultureInfo.InvariantCulture);
        return ((value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF);
    }
}

/// <summary>Reads and writes the settings file in %LocalAppData%\JoyChromium.</summary>
public static class ThemeStore
{
    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static string DataFolder { get; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JoyChromium");

    public static string SettingsPath { get; } = Path.Combine(DataFolder, "settings.json");

    public static Theme Load()
    {
        try
        {
            if (!File.Exists(SettingsPath))
                return Theme.Default;
            var file = JsonSerializer.Deserialize<SettingsFile>(File.ReadAllText(SettingsPath), Options);
            var theme = file?.Theme;
            return Theme.TryParse(theme?.Accent, theme?.Background, theme?.Surface, theme?.Text) ?? Theme.Default;
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            return Theme.Default;
        }
    }

    public static void Save(Theme theme)
    {
        Directory.CreateDirectory(DataFolder);
        File.WriteAllText(SettingsPath, JsonSerializer.Serialize(new SettingsFile { Theme = theme }, Options));
    }

    private sealed class SettingsFile
    {
        public Theme? Theme { get; set; }
    }
}
