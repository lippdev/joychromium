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

/// <summary>Tab lifecycle: creating, hardening and switching WebView2 surfaces.</summary>
public partial class MainWindow
{

    private async Task<BrowserTab> OpenTabAsync(string url, bool activate = true, bool isPrivate = false)
    {
        var view = new WebView2CompositionControl { Visibility = Visibility.Collapsed };
        var tab = new BrowserTab(view) { Url = url, IsPrivate = isPrivate };
        BrowserHost.Children.Add(view);
        Tabs.Add(tab);
        if (activate)
            ActivateTab(tab);

        var controllerOptions = _environment!.CreateCoreWebView2ControllerOptions();
        controllerOptions.IsInPrivateModeEnabled = isPrivate;
        await view.EnsureCoreWebView2Async(_environment, controllerOptions);
        var core = view.CoreWebView2;
        core.Settings.UserAgent = TvIdentity.Ensure(core.Settings.UserAgent);
        if (!TvIdentity.IsActive(core.Settings.UserAgent))
            throw new InvalidOperationException("The mandatory TV user-agent marker was not applied.");

        HardenCore(core);
        core.SetVirtualHostNameToFolderMapping(Pages.Host, Path.Combine(AppContext.BaseDirectory, "Assets"), CoreWebView2HostResourceAccessKind.Allow);
        core.WebMessageReceived += (_, args) => HandleWebMessage(tab, args, null);
        core.FrameCreated += (_, args) =>
            args.Frame.WebMessageReceived += (_, message) => HandleWebMessage(tab, message, args.Frame);
        core.NewWindowRequested += async (_, args) =>
        {
            args.Handled = true;
            if (!SecurityPolicy.AllowPopup(_recentPopups, DateTime.UtcNow))
            {
                StatusText.Text = "POPUP BLOCKED";
                return;
            }
            if (SecurityPolicy.IsNavigationAllowed(args.Uri))
                await OpenTabAsync(args.Uri, isPrivate: tab.IsPrivate);
        };
        core.DocumentTitleChanged += (_, _) =>
        {
            tab.Title = (tab.IsPrivate ? "🕶 " : "") + core.DocumentTitle;
            if (tab == _active)
                Title = $"{tab.Title} - JoyChromium";
            if (!tab.IsPrivate)
                History.Default.Record(core.Source, core.DocumentTitle, DateTime.UtcNow);
        };
        core.FaviconChanged += async (_, _) =>
        {
            try
            {
                using var stream = await core.GetFaviconAsync(CoreWebView2FaviconImageFormat.Png);
                tab.Favicon = stream is null || stream.Length == 0 ? null : LoadImage(stream);
            }
            catch (Exception ex) when (ex is COMException or InvalidOperationException or NotSupportedException or IOException)
            {
                tab.Favicon = null;
            }
        };
        core.ContainsFullScreenElementChanged += (_, _) =>
        {
            if (tab == _active)
                SetChromeVisible(!core.ContainsFullScreenElement);
        };
        core.IsDocumentPlayingAudioChanged += (_, _) =>
        {
            tab.IsPlayingAudio = core.IsDocumentPlayingAudio;
            UpdateKeepAwake();
        };
        core.IsMutedChanged += (_, _) => tab.IsMuted = core.IsMuted;
        core.NavigationStarting += (_, args) =>
        {
            tab.InputFrame = null;
            if (!SecurityPolicy.IsNavigationAllowed(args.Uri) && !Pages.IsInternal(args.Uri))
            {
                args.Cancel = true;
                StatusText.Text = "BLOCKED · UNSUPPORTED ADDRESS";
                return;
            }
            var host = SecurityPolicy.HostOf(args.Uri);
            if (PolicyService.Current.BlocksHost(host))
            {
                args.Cancel = true;
                StatusText.Text = $"BLOCKED BY POLICY · {host}";
                return;
            }
            if (SettingsStore.Current.HttpsOnly && SecurityPolicy.IsHttp(args.Uri) && host is not null && !_httpAllowedHosts.Contains(host))
            {
                args.Cancel = true;
                tab.PendingHttpsUpgrade = args.Uri;
                core.Navigate(SecurityPolicy.UpgradeToHttps(args.Uri)!);
                return;
            }
            tab.Url = Pages.Alias(args.Uri);
            if (tab != _active)
                return;
            KeyboardPanel.Visibility = Visibility.Collapsed;
            AddressBox.Text = tab.Url;
            RefreshInputMode();
            StatusText.Text = "LOADING · TV IDENTITY ON";
        };
        core.NavigationCompleted += (_, args) =>
        {
            // Two non-errors: our own cancel (OperationCanceled, e.g. the http->https swap) and a navigation superseded by a
            // newer one (ConnectionAborted = ERR_ABORTED). Browsers show nothing for either; keep the pending http URL for the retry.
            if (args.WebErrorStatus is CoreWebView2WebErrorStatus.OperationCanceled or CoreWebView2WebErrorStatus.ConnectionAborted)
                return;
            var pendingHttp = tab.PendingHttpsUpgrade;
            tab.PendingHttpsUpgrade = null;
            if (!args.IsSuccess && !Pages.IsInternal(core.Source))
            {
                core.Navigate(Pages.ErrorPageFor(pendingHttp ?? core.Source, args.WebErrorStatus.ToString(), pendingHttp is not null));
                return;
            }
            if (args.IsSuccess && !tab.IsPrivate)
                History.Default.Record(core.Source, core.DocumentTitle, DateTime.UtcNow);
            if (args.IsSuccess && !_spatialChecked)
            {
                // One-time self-check that the injected navigation script parsed; a syntax error would otherwise fail silently.
                _spatialChecked = true;
                _ = core.ExecuteScriptAsync("typeof window.__joy").ContinueWith(t =>
                    Log.Info(t.IsCompletedSuccessfully ? $"Spatial script present: {t.Result}" : $"Spatial script check failed: {t.Exception?.GetBaseException().Message}"),
                    TaskScheduler.FromCurrentSynchronizationContext());
            }
            if (tab == _active)
            {
                StatusText.Text = args.IsSuccess ? "READY · TV IDENTITY ON" : $"LOAD ISSUE · {args.WebErrorStatus}";
                UpdateFavoriteButton();
            }
        };
        core.ServerCertificateErrorDetected += (_, args) =>
        {
            // Never offer a bypass: a TV-room browser should not teach anyone to click through certificate warnings.
            args.Action = CoreWebView2ServerCertificateErrorAction.Cancel;
            StatusText.Text = "BLOCKED · CERTIFICATE ERROR";
        };
        core.PermissionRequested += (_, args) => HandlePermissionRequest(tab, args);
        core.DownloadStarting += (_, args) => HandleDownload(args);
        core.ProcessFailed += (_, args) => HandleProcessFailed(tab, args);
        await core.AddScriptToExecuteOnDocumentCreatedAsync(SpatialScript);
        await core.AddScriptToExecuteOnDocumentCreatedAsync("""
            (() => {
              document.addEventListener('focusin', event => {
                const field = event.target;
                if (!field || field.disabled || field.readOnly) return;
                const editable = field.isContentEditable || field.tagName === 'TEXTAREA' ||
                  (field.tagName === 'INPUT' && ['text','search','url','email','password','tel','number'].includes((field.type || 'text').toLowerCase()));
                if (editable) { try { window.chrome.webview.postMessage('joychromium:show-keyboard'); } catch (_) {} }
              }, true);
            })();
            """);

        // A request made while the engine was still starting wins over the tab's original target.
        core.Navigate(Pages.Resolve(tab.PendingNavigation ?? url));
        tab.PendingNavigation = null;
        return tab;
    }

    /// <summary>Settings every tab gets, on top of what the user chose.</summary>
    private static void HardenCore(CoreWebView2 core)
    {
        var settings = SettingsStore.Current;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsReputationCheckingRequired = true;
        core.Settings.IsPasswordAutosaveEnabled = settings.PasswordAutosave;
        core.Settings.IsGeneralAutofillEnabled = settings.Autofill;
#if !DEBUG
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.AreDefaultContextMenusEnabled = false;
#endif
        core.Profile.PreferredTrackingPreventionLevel = settings.TrackingPrevention switch
        {
            TrackingLevel.Basic => CoreWebView2TrackingPreventionLevel.Basic,
            TrackingLevel.Strict => CoreWebView2TrackingPreventionLevel.Strict,
            _ => CoreWebView2TrackingPreventionLevel.Balanced,
        };
    }

    // ---- Tab menu, audio and keep-awake ----

    private static BrowserTab? TabOf(object sender) => sender switch
    {
        FrameworkElement { Tag: BrowserTab tab } => tab,
        MenuItem { Parent: ContextMenu { PlacementTarget: FrameworkElement { Tag: BrowserTab tab } } } => tab,
        _ => null,
    };

    private void ToggleMute(BrowserTab? tab)
    {
        if (tab?.View.CoreWebView2 is { } core)
        {
            core.IsMuted = !core.IsMuted;
            StatusText.Text = core.IsMuted ? "TAB MUTED" : "TAB UNMUTED";
            UpdateKeepAwake();
        }
    }

    private void MuteTab_Click(object sender, RoutedEventArgs e) => ToggleMute(TabOf(sender));

    private async void DuplicateTab_Click(object sender, RoutedEventArgs e)
    {
        if (TabOf(sender) is { } tab)
            await OpenTabAsync(tab.Url, isPrivate: tab.IsPrivate);
    }

    private async void CloseOtherTabs_Click(object sender, RoutedEventArgs e)
    {
        if (TabOf(sender) is not { } keep)
            return;
        foreach (var other in Tabs.Where(t => t != keep).ToList())
            await CloseTabAsync(other);
    }

    private async void ReopenTab_Click(object sender, RoutedEventArgs e) => await ReopenClosedTabAsync();

    private void Tab_MouseDown(object sender, MouseButtonEventArgs e)
    {
        // Middle click closes, like every desktop browser.
        if (e.ChangedButton == MouseButton.Middle && TabOf(sender) is { } tab)
        {
            e.Handled = true;
            _ = CloseTabAsync(tab);
        }
    }

    /// <summary>Keeps the display on while any unmuted tab plays audio/video; releases it otherwise.</summary>
    private void UpdateKeepAwake() => NativeInput.KeepDisplayAwake(Tabs.Any(t => t.IsPlayingAudio && !t.IsMuted));
}
