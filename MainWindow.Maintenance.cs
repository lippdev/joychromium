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

/// <summary>Background maintenance (policy, uBO, app updates), housekeeping timer and crash recovery.</summary>
public partial class MainWindow
{

    private static readonly HttpClient Http = CreateHttp();

    private static HttpClient CreateHttp()
    {
        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        http.DefaultRequestHeaders.UserAgent.ParseAdd($"JoyChromium/{AppUpdater.Version} (+{AppUpdater.RepoUrl})");
        return http;
    }

    private async Task RunMaintenanceAsync()
    {
        await PolicyService.RefreshAsync(Http);
        await AdBlock.CheckForUpdateAsync(Http, DateTime.UtcNow);
        await AppUpdater.CheckAndDownloadAsync();
        Log.Info($"Maintenance: policy='{PolicyService.Status}' ublock='{AdBlock.Status}' app='{AppUpdater.Status}'");
        if (!string.IsNullOrWhiteSpace(PolicyService.Current.Message))
            StatusText.Text = PolicyService.Current.Message!.ToUpperInvariant();
    }

    // ---- Housekeeping: periodic session save and tab sleeping ----

    private static readonly TimeSpan SleepAfter = TimeSpan.FromMinutes(10);
    private readonly DispatcherTimer _housekeeping = new() { Interval = TimeSpan.FromSeconds(30) };
    private string _lastSavedSession = "";

    private IEnumerable<string> SessionUrls() => Tabs.Where(t => !t.IsPrivate).Select(t => t.Url)
        .Where(u => u != Pages.WelcomeScheme && u != Pages.SettingsScheme && !u.StartsWith(Pages.ErrorPage, StringComparison.Ordinal));

    private void SaveSessionIfChanged()
    {
        var urls = SessionUrls().ToList();
        var key = string.Join("\n", urls);
        if (key == _lastSavedSession)
            return;
        SettingsStore.SaveSession(urls);
        _lastSavedSession = key;
    }

    private async void Housekeeping_Tick(object? sender, EventArgs e)
    {
        SaveSessionIfChanged();
        var now = DateTime.UtcNow;
        // Snapshot: tabs can open/close while a suspension is awaited.
        foreach (var tab in Tabs.Where(t => t != _active && now - t.LastActiveUtc > SleepAfter).ToList())
        {
            if (!Tabs.Contains(tab))
                continue;
            var core = tab.View.CoreWebView2;
            if (core is null || core.IsSuspended || core.IsDocumentPlayingAudio)
                continue;
            try
            {
                if (await core.TrySuspendAsync())
                    Log.Info($"Suspended tab {tab.Url}");
            }
            catch (Exception ex) when (ex is COMException or InvalidOperationException)
            {
                // Suspension is best-effort; a page mid-navigation just stays awake.
            }
        }
    }

    // ---- Crash recovery ----

    private bool _recoveringEngine;

    private async void HandleProcessFailed(BrowserTab tab, CoreWebView2ProcessFailedEventArgs args)
    {
        Log.Error($"Process failed: {args.ProcessFailedKind} reason={args.Reason} exit={args.ExitCode} url={tab.Url}");
        switch (args.ProcessFailedKind)
        {
            case CoreWebView2ProcessFailedKind.BrowserProcessExited:
                // Every tab reports this once; only the first report rebuilds. The engine is gone, so every control is dead.
                if (_recoveringEngine)
                    return;
                _recoveringEngine = true;
                StatusText.Text = "BROWSER ENGINE CRASHED · RECOVERING";
                var urls = Tabs.Select(t => (t.Url, t.IsPrivate)).ToList();
                var activeIndex = _active is null ? 0 : Tabs.IndexOf(_active);
                foreach (var t in Tabs.ToList())
                {
                    BrowserHost.Children.Remove(t.View);
                    t.View.Dispose();
                }
                Tabs.Clear();
                _active = null;
                try
                {
                    for (var i = 0; i < urls.Count; i++)
                        await OpenTabAsync(urls[i].Url, activate: i == activeIndex, isPrivate: urls[i].IsPrivate);
                }
                finally
                {
                    _recoveringEngine = false;
                }
                break;
            case CoreWebView2ProcessFailedKind.RenderProcessExited:
            case CoreWebView2ProcessFailedKind.FrameRenderProcessExited:
                StatusText.Text = "PAGE CRASHED · RELOADING";
                tab.View.CoreWebView2?.Reload();
                break;
            case CoreWebView2ProcessFailedKind.RenderProcessUnresponsive:
                StatusText.Text = "PAGE NOT RESPONDING · B TO GO BACK, X TO RELOAD";
                break;
            default:
                // GPU, utility and sandbox helpers restart on their own.
                StatusText.Text = $"HELPER PROCESS RESTARTED · {args.ProcessFailedKind}";
                break;
        }
    }
}
