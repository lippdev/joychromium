using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Web.WebView2.Core;

namespace JoyChromium;

/// <summary>
/// Installs uBlock Origin into the WebView2 profile and keeps it current.
/// The build bundles one version; newer releases are fetched from the official GitHub repository into
/// %LocalAppData% and take over on the next start, so the app itself does not need a release for that.
/// </summary>
public static class AdBlock
{
    public const string ExtensionName = "uBlock Origin";
    public const string ReleasesApi = "https://api.github.com/repos/gorhill/uBlock/releases/latest";
    private const string FolderName = "uBlock0.chromium";
    private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(24);

    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static string BundledFolder { get; } = Path.Combine(AppContext.BaseDirectory, "Assets", "extensions", FolderName);
    public static string UpdatesFolder { get; } = Path.Combine(SettingsStore.DataFolder, "extensions");
    public static string StatePath { get; } = Path.Combine(UpdatesFolder, "state.json");

    public static string Status { get; private set; } = "Not checked yet";

    /// <summary>Newest valid copy: a downloaded one beats the bundled one only when its version is higher.</summary>
    public static string? ActiveFolder
    {
        get
        {
            string? bestFolder = null;
            Version? bestVersion = null;
            var candidates = Directory.Exists(UpdatesFolder)
                ? Directory.GetDirectories(UpdatesFolder, FolderName + "-*").Prepend(BundledFolder)
                : [BundledFolder];
            foreach (var dir in candidates)
            {
                if (ReadVersion(dir) is { } version && (bestVersion is null || version > bestVersion))
                    (bestFolder, bestVersion) = (dir, version);
            }
            return bestFolder;
        }
    }

    public static bool IsBundled => ActiveFolder is not null;

    public static string? ActiveVersion => ReadVersion(ActiveFolder)?.ToString();

    /// <summary>Makes the profile match <paramref name="enabled"/>: installs the active copy, replacing an older path if needed.</summary>
    public static async Task<bool> ApplyAsync(CoreWebView2Profile profile, bool enabled)
    {
        var folder = ActiveFolder;
        var state = LoadState();
        var installed = await profile.GetBrowserExtensionsAsync();
        var mine = installed.Where(extension => extension.Name == ExtensionName).ToList();

        // Unpacked extension IDs derive from the folder path, so a new version means remove-then-add.
        if (folder is not null && state.InstalledFolder is not null && state.InstalledFolder != folder)
        {
            foreach (var extension in mine)
                await extension.RemoveAsync();
            mine.Clear();
        }
        var current = mine.FirstOrDefault();
        if (current is null)
        {
            if (!enabled || folder is null)
                return false;
            current = await profile.AddBrowserExtensionAsync(folder);
            SaveState(state with { InstalledFolder = folder, InstalledId = current.Id });
        }
        if (current.IsEnabled != enabled)
            await current.EnableAsync(enabled);
        return enabled;
    }

    /// <summary>Checks GitHub at most once a day and downloads a newer release for the next start.</summary>
    public static async Task CheckForUpdateAsync(HttpClient http, DateTime nowUtc)
    {
        var state = LoadState();
        if (state.LastCheckUtc is { } last && nowUtc - last < CheckInterval)
        {
            Status = $"v{ActiveVersion} · checked {last:yyyy-MM-dd HH:mm} UTC";
            return;
        }
        try
        {
            using var doc = JsonDocument.Parse(await http.GetStringAsync(ReleasesApi));
            var tag = doc.RootElement.GetProperty("tag_name").GetString() ?? "";
            if (!Version.TryParse(tag, out var latest))
            {
                Status = $"Unexpected release tag '{tag}'";
                return;
            }
            SaveState(state with { LastCheckUtc = nowUtc });
            if (ReadVersion(ActiveFolder) is { } active && latest <= active)
            {
                Status = $"v{active} is current";
                return;
            }
            var asset = doc.RootElement.GetProperty("assets").EnumerateArray()
                .Select(a => a.GetProperty("browser_download_url").GetString())
                .FirstOrDefault(u => u is not null && u.EndsWith(".chromium.zip", StringComparison.OrdinalIgnoreCase)
                                     && u.StartsWith("https://github.com/gorhill/uBlock/", StringComparison.OrdinalIgnoreCase));
            if (asset is null)
            {
                Status = $"Release {tag} has no chromium zip";
                return;
            }
            await DownloadAsync(http, asset, latest);
            Status = $"v{latest} downloaded; active after restart";
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or IOException or InvalidDataException or UnauthorizedAccessException)
        {
            Status = $"Update check failed: {ex.Message}";
        }
    }

    private static async Task DownloadAsync(HttpClient http, string url, Version version)
    {
        Directory.CreateDirectory(UpdatesFolder);
        var temp = Path.Combine(UpdatesFolder, $"tmp-{Guid.NewGuid():N}");
        var zip = temp + ".zip";
        try
        {
            await using (var file = File.Create(zip))
            await using (var stream = await http.GetStreamAsync(url))
                await stream.CopyToAsync(file);
            ZipFile.ExtractToDirectory(zip, temp);
            var extracted = Path.Combine(temp, FolderName);
            var manifest = ReadManifest(extracted);
            if (manifest?.Name != ExtensionName || ReadVersion(extracted) != version)
                throw new InvalidDataException("Downloaded archive is not the expected uBlock Origin release.");
            var final = Path.Combine(UpdatesFolder, $"{FolderName}-{version}");
            if (Directory.Exists(final))
                Directory.Delete(final, recursive: true);
            Directory.Move(extracted, final);
            PruneOld(keep: 2);
        }
        finally
        {
            if (File.Exists(zip)) File.Delete(zip);
            if (Directory.Exists(temp)) Directory.Delete(temp, recursive: true);
        }
    }

    /// <summary>Keeps the newest downloads so a bad one can be rolled back by deleting it.</summary>
    private static void PruneOld(int keep)
    {
        var dirs = Directory.GetDirectories(UpdatesFolder, FolderName + "-*")
            .Select(d => (Dir: d, Version: ReadVersion(d)))
            .OrderByDescending(d => d.Version)
            .ToList();
        foreach (var (dir, _) in dirs.Skip(keep))
            Directory.Delete(dir, recursive: true);
    }

    private static Version? ReadVersion(string? folder) =>
        Version.TryParse(ReadManifest(folder)?.Version, out var v) ? v : null;

    private static Manifest? ReadManifest(string? folder)
    {
        try
        {
            var path = folder is null ? null : Path.Combine(folder, "manifest.json");
            return path is not null && File.Exists(path) ? JsonSerializer.Deserialize<Manifest>(File.ReadAllText(path), Options) : null;
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    private static State LoadState()
    {
        try
        {
            return File.Exists(StatePath) ? JsonSerializer.Deserialize<State>(File.ReadAllText(StatePath), Options) ?? new State() : new State();
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            return new State();
        }
    }

    private static void SaveState(State state)
    {
        Directory.CreateDirectory(UpdatesFolder);
        File.WriteAllText(StatePath, JsonSerializer.Serialize(state, Options));
    }

    private sealed record Manifest(string? Name, string? Version);
    private sealed record State(string? InstalledFolder = null, string? InstalledId = null, DateTime? LastCheckUtc = null);
}
