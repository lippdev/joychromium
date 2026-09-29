using System.Collections.ObjectModel;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Shell;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace JoyChromium;

/// <summary>Permission prompts, downloads and popup limiting.</summary>
public partial class MainWindow
{

    private readonly List<DateTime> _recentPopups = [];
    private readonly HashSet<string> _httpAllowedHosts = new(StringComparer.OrdinalIgnoreCase);
    private CoreWebView2Deferral? _permissionDeferral;
    private CoreWebView2PermissionRequestedEventArgs? _permissionArgs;
    private string? _permissionHost;

    private void HandlePermissionRequest(BrowserTab tab, CoreWebView2PermissionRequestedEventArgs args)
    {
        var host = SecurityPolicy.HostOf(args.Uri);
        var kind = args.PermissionKind.ToString();
        if (host is null || Pages.IsInternal(args.Uri))
        {
            args.State = CoreWebView2PermissionState.Deny;
            return;
        }
        if (SettingsStore.Current.SitePermissions.TryGetValue(host, out var site) && site.TryGetValue(kind, out var allowed))
        {
            args.State = allowed ? CoreWebView2PermissionState.Allow : CoreWebView2PermissionState.Deny;
            return;
        }
        // Only one prompt at a time; anything that piles up behind it is denied for this request.
        if (_permissionDeferral is not null || tab != _active)
        {
            args.State = CoreWebView2PermissionState.Deny;
            return;
        }
        _permissionDeferral = args.GetDeferral();
        _permissionArgs = args;
        _permissionHost = host;
        PermissionText.Text = $"{host} wants to use: {Describe(args.PermissionKind)}";
        PermissionPanel.Visibility = Visibility.Visible;
        PermissionDeny.Focus();
    }

    private static string Describe(CoreWebView2PermissionKind kind) => kind switch
    {
        CoreWebView2PermissionKind.Microphone => "your microphone",
        CoreWebView2PermissionKind.Camera => "your camera",
        CoreWebView2PermissionKind.Geolocation => "your location",
        CoreWebView2PermissionKind.Notifications => "notifications",
        CoreWebView2PermissionKind.ClipboardRead => "reading the clipboard",
        CoreWebView2PermissionKind.Autoplay => "autoplay with sound",
        CoreWebView2PermissionKind.LocalFonts => "your installed fonts",
        CoreWebView2PermissionKind.MidiSystemExclusiveMessages => "MIDI devices",
        CoreWebView2PermissionKind.OtherSensors => "device sensors",
        _ => kind.ToString(),
    };

    private void ResolvePermission(bool allow, bool remember)
    {
        if (_permissionArgs is null || _permissionDeferral is null || _permissionHost is null)
            return;
        _permissionArgs.State = allow ? CoreWebView2PermissionState.Allow : CoreWebView2PermissionState.Deny;
        if (remember)
            SettingsStore.Save(SettingsStore.Current.WithPermission(_permissionHost, _permissionArgs.PermissionKind.ToString(), allow));
        _permissionDeferral.Complete();
        _permissionDeferral = null;
        _permissionArgs = null;
        _permissionHost = null;
        PermissionPanel.Visibility = Visibility.Collapsed;
        _active?.View.Focus();
    }

    private void PermissionAllow_Click(object sender, RoutedEventArgs e) => ResolvePermission(true, false);
    private void PermissionAllowAlways_Click(object sender, RoutedEventArgs e) => ResolvePermission(true, true);
    private void PermissionDeny_Click(object sender, RoutedEventArgs e) => ResolvePermission(false, false);
    private void PermissionDenyAlways_Click(object sender, RoutedEventArgs e) => ResolvePermission(false, true);

    private void HandleDownload(CoreWebView2DownloadStartingEventArgs args)
    {
        var name = SecurityPolicy.SafeFileName(Path.GetFileName(args.ResultFilePath));
        if (SettingsStore.Current.BlockDangerousDownloads &&
            (SecurityPolicy.IsDangerousDownload(name) || PolicyService.Current.ExtraDangerousExtensions.Contains(Path.GetExtension(name), StringComparer.OrdinalIgnoreCase)))
        {
            args.Cancel = true;
            args.Handled = true;
            StatusText.Text = $"DOWNLOAD BLOCKED · {name}";
            return;
        }
        var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads", "JoyChromium");
        Directory.CreateDirectory(folder);
        var target = Path.Combine(folder, name);
        for (var i = 1; File.Exists(target); i++)
            target = Path.Combine(folder, $"{Path.GetFileNameWithoutExtension(name)} ({i}){Path.GetExtension(name)}");
        args.ResultFilePath = target;
        args.Handled = true;
        var download = args.DownloadOperation;
        download.BytesReceivedChanged += (_, _) =>
        {
            var total = download.TotalBytesToReceive;
            StatusText.Text = total is > 0
                ? $"DOWNLOADING · {name} · {(ulong)download.BytesReceived * 100 / total.Value}%"
                : $"DOWNLOADING · {name}";
        };
        download.StateChanged += (_, _) => StatusText.Text = download.State switch
        {
            CoreWebView2DownloadState.Completed => $"DOWNLOADED · {name}",
            CoreWebView2DownloadState.Interrupted => $"DOWNLOAD FAILED · {download.InterruptReason}",
            _ => StatusText.Text,
        };
    }

    private void ActivateTab(BrowserTab tab)
    {
        if (_active == tab)
            return;
        if (_active is not null)
        {
            _active.IsActive = false;
            _active.View.Visibility = Visibility.Collapsed;
        }
        _active = tab;
        tab.IsActive = true;
        tab.LastActiveUtc = DateTime.UtcNow;
        tab.View.Visibility = Visibility.Visible;
        if (tab.View.CoreWebView2?.IsSuspended == true)
            tab.View.CoreWebView2.Resume();
        AddressBox.Text = tab.Url;
        SuggestionsPopup.IsOpen = false;
        UpdateFavoriteButton();
        SetChromeVisible(tab.View.CoreWebView2?.ContainsFullScreenElement != true);
        RefreshInputMode();
        Title = $"{tab.Title} - JoyChromium";
        KeyboardPanel.Visibility = Visibility.Collapsed;
        tab.View.Focus();
    }

    private async Task CloseTabAsync(BrowserTab tab)
    {
        var index = Tabs.IndexOf(tab);
        if (index < 0)
            return;
        Tabs.RemoveAt(index);
        if (Pages.IsWebUrl(tab.Url))
            _closedTabs.Push((tab.Url, tab.IsPrivate));
        BrowserHost.Children.Remove(tab.View);
        if (_active == tab)
        {
            _active = null;
            if (Tabs.Count == 0)
                await OpenTabAsync(SettingsStore.Current.NewTabTarget);
            else
                ActivateTab(Tabs[Math.Min(index, Tabs.Count - 1)]);
        }
        tab.View.Dispose();
        UpdateKeepAwake();
    }

    private static System.Windows.Media.Imaging.BitmapImage LoadImage(Stream stream)
    {
        var image = new System.Windows.Media.Imaging.BitmapImage();
        image.BeginInit();
        image.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
        image.StreamSource = stream;
        image.EndInit();
        image.Freeze();
        return image;
    }
}
