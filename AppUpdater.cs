using Velopack;
using Velopack.Sources;

namespace JoyChromium;

/// <summary>Self-update through Velopack, fed by GitHub Releases. Downloads in the background, installs when the app closes.</summary>
public static class AppUpdater
{
    public const string RepoUrl = "https://github.com/lippdev/joychromium";

    private static readonly UpdateManager Manager = new(new GithubSource(RepoUrl, null, false));
    private static UpdateInfo? _pending;

    public static string Version =>
        typeof(AppUpdater).Assembly.GetName().Version?.ToString(3) ?? "0.0.0";

    public static string Status { get; private set; } = "Not checked yet";

    public static bool IsInstalled => Manager.IsInstalled;

    public static async Task CheckAndDownloadAsync()
    {
        if (!Manager.IsInstalled)
        {
            Status = "Running from a plain build; self-update only works when installed";
            return;
        }
        try
        {
            var info = await Manager.CheckForUpdatesAsync();
            if (info is null)
            {
                Status = $"v{Version} is up to date";
                return;
            }
            await Manager.DownloadUpdatesAsync(info);
            _pending = info;
            Status = $"v{info.TargetFullRelease.Version} downloaded; installs when you close JoyChromium";
        }
        catch (Exception ex)
        {
            Status = $"Update check failed: {ex.Message}";
        }
    }

    /// <summary>Called on shutdown: applies a downloaded update without restarting.</summary>
    public static void ApplyOnExit()
    {
        if (_pending is null)
            return;
        try
        {
            Manager.WaitExitThenApplyUpdates(_pending.TargetFullRelease, silent: true, restart: false);
        }
        catch (Exception)
        {
            // Nothing sensible to do while closing; the next start checks again.
        }
    }
}
