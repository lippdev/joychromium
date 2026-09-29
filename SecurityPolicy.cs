using System.IO;

namespace JoyChromium;

public enum DohProvider { Off, Cloudflare, Quad9, Google }

public enum TrackingLevel { Basic, Balanced, Strict }

/// <summary>Pure security rules shared by the shell and the tests. No WebView2 types here.</summary>
public static class SecurityPolicy
{
    /// <summary>Oldest WebView2 Evergreen runtime the shell will run on without warning.</summary>
    public const string MinimumRuntimeVersion = "120.0.0.0";

    private static readonly HashSet<string> DangerousExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".exe", ".msi", ".msix", ".appx", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".jse", ".wsf", ".wsh",
        ".scr", ".com", ".pif", ".cpl", ".dll", ".hta", ".jar", ".lnk", ".reg", ".inf", ".iso", ".img", ".vhd",
    };

    /// <summary>Only web pages and our own internal pages may be navigated to.</summary>
    public static bool IsNavigationAllowed(string? url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
            return false;
        if (uri.Scheme == Uri.UriSchemeHttps)
            return true;
        if (uri.Scheme == Uri.UriSchemeHttp)
            return true;
        return uri.Scheme == "about" && uri.OriginalString == "about:blank";
    }

    public static bool IsHttp(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttp;

    /// <summary>The same URL over https, or null when it is not a plain http URL.</summary>
    public static string? UpgradeToHttps(string? url)
    {
        if (!IsHttp(url))
            return null;
        var builder = new UriBuilder(url!) { Scheme = Uri.UriSchemeHttps };
        if (builder.Port == 80)
            builder.Port = -1;
        return builder.Uri.AbsoluteUri;
    }

    public static string? HostOf(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var uri) ? uri.Host.ToLowerInvariant() : null;

    public static bool IsDangerousDownload(string? fileName) =>
        DangerousExtensions.Contains(Path.GetExtension(fileName ?? ""));

    /// <summary>Strips path separators and reserved characters so a server-suggested name cannot escape the folder.</summary>
    public static string SafeFileName(string? suggested)
    {
        var name = Path.GetFileName(suggested ?? "");
        foreach (var c in Path.GetInvalidFileNameChars())
            name = name.Replace(c, '_');
        return string.IsNullOrWhiteSpace(name) ? "download" : name;
    }

    /// <summary>Version strings are dotted numbers; returns true when <paramref name="actual"/> is at least the minimum.</summary>
    public static bool RuntimeIsSupported(string? actual, string minimum = MinimumRuntimeVersion)
    {
        if (!Version.TryParse(actual, out var have) || !Version.TryParse(minimum, out var need))
            return false;
        return have >= need;
    }

    public static string? DohTemplate(DohProvider provider) => provider switch
    {
        DohProvider.Cloudflare => "https://cloudflare-dns.com/dns-query",
        DohProvider.Quad9 => "https://dns.quad9.net/dns-query",
        DohProvider.Google => "https://dns.google/dns-query",
        _ => null,
    };

    /// <summary>Extra Chromium switches for the environment. Empty when nothing needs enabling.</summary>
    public static string BrowserArguments(DohProvider doh)
    {
        var template = DohTemplate(doh);
        return template is null
            ? ""
            : $"--enable-features=DnsOverHttps --dns-over-https-mode=secure --dns-over-https-templates={template}";
    }

    /// <summary>Allows at most <paramref name="limit"/> popups within <paramref name="window"/>; older timestamps are pruned.</summary>
    public static bool AllowPopup(List<DateTime> recent, DateTime now, int limit = 3, TimeSpan? window = null)
    {
        var span = window ?? TimeSpan.FromSeconds(1);
        recent.RemoveAll(t => now - t > span);
        if (recent.Count >= limit)
            return false;
        recent.Add(now);
        return true;
    }
}
