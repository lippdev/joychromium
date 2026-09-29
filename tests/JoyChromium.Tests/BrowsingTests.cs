using JoyChromium;
using Xunit;

namespace JoyChromium.Tests;

public sealed class HistoryTests : IDisposable
{
    private readonly string _folder = Path.Combine(Path.GetTempPath(), "joychromium-test-" + Guid.NewGuid().ToString("N"));
    private readonly DateTime _t0 = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private string PathOf => Path.Combine(_folder, "history.jsonl");

    private History Seeded()
    {
        var history = new History(PathOf);
        history.Record("https://a.example/one", "One", _t0);
        history.Record("https://a.example/one", "One (updated)", _t0.AddSeconds(1));
        history.Record("https://b.example/two", "Two", _t0.AddSeconds(2));
        history.Record("joychromium://settings", "Settings", _t0.AddSeconds(3));
        history.Record("https://settings.joychromium/settings.html", "Settings", _t0.AddSeconds(4));
        return history;
    }

    [Fact]
    public void Records_dedupe_and_skip_internal_pages()
    {
        var history = Seeded();
        Assert.Equal(2, history.Count);
        Assert.Equal("https://b.example/two", history.Recent()[0].Url);
        Assert.Equal("One (updated)", history.Recent()[1].Title);
    }

    [Fact]
    public void Search_is_case_insensitive()
    {
        var history = Seeded();
        Assert.Single(history.Search("ONE"));
        Assert.Empty(history.Search("nothing"));
    }

    [Fact]
    public void Round_trips_through_file_and_removes()
    {
        var history = Seeded();
        Assert.Equal(2, new History(PathOf).Count);
        history.Remove("https://a.example/one");
        Assert.Equal(1, history.Count);
        Assert.Equal(1, new History(PathOf).Count);
    }

    public void Dispose()
    {
        if (Directory.Exists(_folder))
            Directory.Delete(_folder, recursive: true);
    }
}

public class SuggestionTests
{
    private static readonly Shortcut[] Favorites = [new("Two", "https://b.example/two")];
    private static readonly HistoryEntry[] History = [new(DateTime.UtcNow, "https://b.example/two", "Two"), new(DateTime.UtcNow, "https://c.example/three", "Three")];

    [Fact]
    public void Favorites_come_first_and_dedupe()
    {
        var s = Suggestion.Build("two", Favorites, History);
        var only = Assert.Single(s);
        Assert.Equal("favorite", only.Kind);
    }

    [Theory]
    [InlineData("")]
    [InlineData("joychromium://settings")]
    public void Empty_or_internal_queries_yield_nothing(string query) => Assert.Empty(Suggestion.Build(query, Favorites, History));
}

public class ControllerInputTests
{
    [Theory]
    [InlineData("www.youtube.com", InputMode.Arrows)]
    [InlineData("twitch.tv", InputMode.Arrows)]
    [InlineData("notyoutube.com", InputMode.Spatial)]
    public void DefaultModeFor_knows_tv_sites(string host, InputMode expected) => Assert.Equal(expected, ControllerInput.DefaultModeFor(host));

    [Fact]
    public void DefaultModeFor_uses_fallback_without_host() => Assert.Equal(InputMode.Cursor, ControllerInput.DefaultModeFor(null, InputMode.Cursor));

    [Fact]
    public void Next_cycles() => Assert.Equal(InputMode.Spatial, ControllerInput.Next(InputMode.Arrows));

    [Fact]
    public void StickToVelocity_has_deadzone_and_curve()
    {
        Assert.Equal((0, 0), ControllerInput.StickToVelocity(1000, -1000));
        Assert.InRange(ControllerInput.StickToVelocity(32767, 0).Dx, 21.9, 22.1);
        Assert.True(ControllerInput.StickToVelocity(0, 32767).Dy < 0);
        Assert.True(ControllerInput.StickToVelocity(16000, 0).Dx < ControllerInput.StickToVelocity(32767, 0).Dx);
    }

    [Theory]
    [InlineData(500, 0)]
    [InlineData(-30000, -1)]
    [InlineData(30000, 1)]
    public void StickToScroll_maps_notches(short y, int expected) => Assert.Equal(expected, ControllerInput.StickToScroll(y));
}
