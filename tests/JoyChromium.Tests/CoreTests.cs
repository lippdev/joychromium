using JoyChromium;
using Xunit;

namespace JoyChromium.Tests;

public class TvIdentityTests
{
    private const string Source = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36";

    [Fact]
    public void Ensure_appends_marker_once()
    {
        var tvAgent = TvIdentity.Ensure(Source);
        Assert.True(TvIdentity.IsActive(tvAgent));
        Assert.Contains("(TV; SmartTV)", tvAgent, StringComparison.Ordinal);
        Assert.Equal(tvAgent, TvIdentity.Ensure(tvAgent));
    }

    [Fact]
    public void Ensure_rejects_malformed_marker() =>
        Assert.Throws<InvalidOperationException>(() => TvIdentity.Ensure(Source + " JoyChromiumTV/broken"));
}

public class ThemeTests
{
    [Theory]
    [InlineData("#64DDB5", true)]
    [InlineData("#12345", false)]
    [InlineData("64DDB5", false)]
    [InlineData(null, false)]
    public void IsHexColor_validates(string? value, bool expected) => Assert.Equal(expected, Theme.IsHexColor(value));

    [Fact]
    public void Mix_blends_linearly() => Assert.Equal("#808080", Theme.Mix("#000000", "#FFFFFF", 0.5));

    [Fact]
    public void Presets_report_light_and_dark()
    {
        Assert.False(Theme.Default.IsLight);
        Assert.True(Theme.Presets["Light"].IsLight);
    }

    [Fact]
    public void TryParse_rejects_invalid_colors() => Assert.Null(Theme.TryParse("#123456", "nope", "#000000", "#FFFFFF"));
}

public class SearchEngineTests
{
    [Fact]
    public void BuildQuery_escapes_text() =>
        Assert.Equal("https://www.google.com/search?q=joy%20chromium", SearchEngine.Google.BuildQuery("joy chromium").AbsoluteUri);

    [Theory]
    [InlineData("https://x.example/?q=", false)]
    [InlineData("ftp://x/%s", false)]
    [InlineData("https://x.example/s?q=%s", true)]
    public void IsValidTemplate_requires_https_and_placeholder(string template, bool expected) =>
        Assert.Equal(expected, SearchEngine.IsValidTemplate(template));
}

public class SettingsTests
{
    [Fact]
    public void Defaults_are_safe()
    {
        var s = new AppSettings();
        Assert.Equal("Google", s.SearchEngine.Name);
        Assert.True(s.AdBlockEnabled);
        Assert.False(s.OnboardingCompleted);
        Assert.True(s.HttpsOnly);
        Assert.False(s.PasswordAutosave);
        Assert.Equal(Pages.NewTabScheme, s.NewTabTarget);
        Assert.Equal(Pages.NewTabScheme, Assert.Single(s.StartupTargets([])));
    }

    [Fact]
    public void Restore_uses_last_session_when_present()
    {
        var restore = new AppSettings { Startup = StartupMode.Restore };
        Assert.Equal(2, restore.StartupTargets(["https://a.example", "https://b.example"]).Count);
        Assert.Equal(Pages.NewTabScheme, Assert.Single(restore.StartupTargets([])));
    }

    [Fact]
    public void Load_never_returns_null() => Assert.NotNull(SettingsStore.Load());

    [Fact]
    public void Permissions_are_tracked_per_host()
    {
        var perms = new AppSettings().WithPermission("A.example", "Camera", false).WithPermission("a.example", "Microphone", true);
        Assert.Equal(2, perms.SitePermissions.Count);
        Assert.Single(perms.WithoutPermissions("a.example").SitePermissions);
    }

    [Fact]
    public void Favorites_toggle()
    {
        var (settings, isFavorite) = new AppSettings().ToggleFavorite("https://b.example/two", "Two");
        Assert.True(isFavorite);
        Assert.Single(settings.Favorites);
        Assert.Empty(settings.ToggleFavorite("https://b.example/two", "Two").Settings.Favorites);
    }

    [Fact]
    public void Input_modes_are_tracked_per_host()
    {
        var modes = new AppSettings().WithInputMode("a.example", InputMode.Cursor);
        Assert.Equal(InputMode.Cursor, modes.InputModeFor("a.example"));
        Assert.Equal(InputMode.Arrows, modes.InputModeFor("www.youtube.com"));
        Assert.Equal(InputMode.Spatial, modes.InputModeFor("b.example"));
        Assert.Empty(modes.WithoutInputMode("a.example").SiteInputModes);
    }
}

public class PagesTests
{
    [Fact]
    public void Aliases_round_trip()
    {
        Assert.Equal(Pages.NewTabPage, Pages.Resolve("JoyChromium://NewTab"));
        Assert.Equal(Pages.SettingsScheme, Pages.Alias(Pages.SettingsPage));
        Assert.Equal("https://x.example", Pages.Resolve("https://x.example"));
    }

    [Theory]
    [InlineData("Bad", "ftp://x", false)]
    [InlineData(" ", "https://x.example", false)]
    [InlineData("Ok", "https://x.example", true)]
    public void Shortcut_TryParse_validates(string name, string url, bool expected) =>
        Assert.Equal(expected, Shortcut.TryParse(name, url) is not null);
}
