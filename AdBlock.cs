using System.IO;
using Microsoft.Web.WebView2.Core;

namespace JoyChromium;

/// <summary>Installs the bundled uBlock Origin into the WebView2 profile and toggles it.</summary>
public static class AdBlock
{
    public const string ExtensionName = "uBlock Origin";

    public static string ExtensionFolder { get; } =
        Path.Combine(AppContext.BaseDirectory, "Assets", "extensions", "uBlock0.chromium");

    public static bool IsBundled => File.Exists(Path.Combine(ExtensionFolder, "manifest.json"));

    /// <summary>Makes the profile match <paramref name="enabled"/>: installs on first use, then enables/disables in place.</summary>
    public static async Task<bool> ApplyAsync(CoreWebView2Profile profile, bool enabled)
    {
        var installed = (await profile.GetBrowserExtensionsAsync())
            .FirstOrDefault(extension => extension.Name == ExtensionName);
        if (installed is null)
        {
            if (!enabled || !IsBundled)
                return false;
            installed = await profile.AddBrowserExtensionAsync(ExtensionFolder);
        }
        if (installed.IsEnabled != enabled)
            await installed.EnableAsync(enabled);
        return enabled;
    }
}
