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
if (ThemeStore.Load() is null)
    throw new InvalidOperationException("ThemeStore.Load must always return a theme.");
Console.WriteLine("Theme parsing, mixing and presets are consistent.");
