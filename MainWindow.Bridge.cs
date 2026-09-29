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

/// <summary>Messages from the internal pages (settings, onboarding, new tab, error, favorites, history) and text entry into pages.</summary>
public partial class MainWindow
{

    private void Settings_Click(object sender, RoutedEventArgs e) => NavigateActive(Pages.SettingsPage);

    private async Task ApplyAdBlockAsync(BrowserTab tab, bool enabled)
    {
        try
        {
            if (tab.View.CoreWebView2 is { } core)
                _adBlockActive = await AdBlock.ApplyAsync(core.Profile, enabled);
        }
        catch (Exception ex) when (ex is COMException or InvalidOperationException or IOException)
        {
            _adBlockActive = false;
            StatusText.Text = $"ADBLOCK FAILED · {ex.Message}";
        }
        AdBlockText.Text = _adBlockActive ? "ADBLOCK ON" : "ADBLOCK OFF";
        AdBlockText.Foreground = (System.Windows.Media.Brush)FindResource(_adBlockActive ? "AccentBrush" : "TextFaintBrush");
    }

    private async void HandleSettingsMessage(BrowserTab tab, string message)
    {
        var core = tab.View.CoreWebView2;
        if (core is null)
            return;
        SettingsMessage? parsed;
        try
        {
            parsed = JsonSerializer.Deserialize<SettingsMessage>(message, JsonOptions);
        }
        catch (JsonException)
        {
            return;
        }
        var current = SettingsStore.Current;
        switch (parsed?.Type)
        {
            case "ready":
                core.PostWebMessageAsString(JsonSerializer.Serialize(new
                {
                    type = "init",
                    theme = ThemeService.Current,
                    presets = Theme.Presets,
                    searchEngine = current.SearchEngine,
                    searchEngines = SearchEngine.Builtin,
                    adBlockEnabled = current.AdBlockEnabled,
                    adBlockAvailable = AdBlock.IsBundled,
                    path = SettingsStore.SettingsPath,
                    startup = current.Startup.ToString(),
                    favorites = current.Favorites,
                    startupUrl = current.StartupUrl,
                    newTab = current.NewTab.ToString(),
                    newTabUrl = current.NewTabUrl,
                    homeUrl = current.HomeUrl,
                    shortcuts = current.Shortcuts,
                    defaultShortcuts = Shortcut.Default,
                    httpsOnly = current.HttpsOnly,
                    trackingPrevention = current.TrackingPrevention.ToString(),
                    dnsOverHttps = current.DnsOverHttps.ToString(),
                    passwordAutosave = current.PasswordAutosave,
                    autofill = current.Autofill,
                    blockDangerousDownloads = current.BlockDangerousDownloads,
                    sitePermissions = current.SitePermissions,
                    defaultInputMode = current.DefaultInputMode.ToString(),
                    siteInputModes = current.SiteInputModes.ToDictionary(p => p.Key, p => p.Value.ToString()),
                    runtimeVersion = CoreWebView2Environment.GetAvailableBrowserVersionString(),
                    appVersion = AppUpdater.Version,
                    appUpdate = AppUpdater.Status,
                    adBlockVersion = AdBlock.ActiveVersion,
                    adBlockUpdate = AdBlock.Status,
                    policy = PolicyService.Status,
                }, JsonOptions));
                break;
            case "theme-preview" when ParseTheme(parsed.Theme) is { } theme:
                ThemeService.Apply(theme);
                break;
            case "theme-save" when ParseTheme(parsed.Theme) is { } theme:
                ThemeService.Apply(theme);
                SettingsStore.Save(current with { Theme = theme });
                break;
            case "search-save" when SearchEngine.TryParse(parsed.SearchEngine?.Name, parsed.SearchEngine?.Template) is { } engine:
                SettingsStore.Save(current with { SearchEngine = engine });
                break;
            case "adblock-save" when parsed.AdBlockEnabled is { } enabled:
                SettingsStore.Save(current with { AdBlockEnabled = enabled });
                await ApplyAdBlockAsync(tab, enabled);
                break;
            case "onboarding-done":
                SettingsStore.Save(SettingsStore.Current with { OnboardingCompleted = true });
                core.Navigate(Pages.Resolve(SettingsStore.Current.NewTabTarget));
                break;
            case "general-save":
                SaveGeneral(parsed);
                break;
            case "shortcuts-save" when parsed.Shortcuts is not null:
                SettingsStore.Save(current with
                {
                    Shortcuts = parsed.Shortcuts.Select(s => Shortcut.TryParse(s.Name, s.Url)).OfType<Shortcut>().ToList(),
                });
                break;
            case "history-search":
                core.PostWebMessageAsString(JsonSerializer.Serialize(new { type = "history", entries = History.Default.Search(parsed.Query ?? "") }, JsonOptions));
                break;
            case "history-remove" when !string.IsNullOrWhiteSpace(parsed.Url):
                History.Default.Remove(parsed.Url);
                break;
            case "history-clear":
                History.Default.Clear();
                break;
            case "favorite-remove" when !string.IsNullOrWhiteSpace(parsed.Url):
                SettingsStore.Save(current with { Favorites = current.Favorites.Where(f => f.Url != parsed.Url).ToList() });
                UpdateFavoriteButton();
                break;
            case "navigate" when !string.IsNullOrWhiteSpace(parsed.Url):
                if (parsed.AllowHttp == true && SecurityPolicy.HostOf(parsed.Url) is { } httpHost)
                    _httpAllowedHosts.Add(httpHost);
                AddressBox.Text = parsed.Url;
                NavigateFromAddress();
                break;
            case "privacy-save":
                SettingsStore.Save(current with
                {
                    HttpsOnly = parsed.HttpsOnly ?? current.HttpsOnly,
                    TrackingPrevention = Enum.TryParse<TrackingLevel>(parsed.TrackingPrevention, true, out var tracking) ? tracking : current.TrackingPrevention,
                    DnsOverHttps = Enum.TryParse<DohProvider>(parsed.DnsOverHttps, true, out var doh) ? doh : current.DnsOverHttps,
                    PasswordAutosave = parsed.PasswordAutosave ?? current.PasswordAutosave,
                    Autofill = parsed.Autofill ?? current.Autofill,
                    BlockDangerousDownloads = parsed.BlockDangerousDownloads ?? current.BlockDangerousDownloads,
                });
                foreach (var t in Tabs)
                    if (t.View.CoreWebView2 is { } c)
                        HardenCore(c);
                break;
            case "inputmode-default" when Enum.TryParse<InputMode>(parsed.InputMode, true, out var defaultMode):
                SettingsStore.Save(current with { DefaultInputMode = defaultMode });
                RefreshInputMode();
                break;
            case "inputmode-forget" when !string.IsNullOrWhiteSpace(parsed.Host):
                SettingsStore.Save(current.WithoutInputMode(parsed.Host.ToLowerInvariant()));
                RefreshInputMode();
                break;
            case "permission-forget" when !string.IsNullOrWhiteSpace(parsed.Host):
                SettingsStore.Save(current.WithoutPermissions(parsed.Host.ToLowerInvariant()));
                break;
            case "update-check":
                await PolicyService.RefreshAsync(Http);
                await AdBlock.CheckForUpdateAsync(Http, DateTime.UtcNow, force: true);
                await AppUpdater.CheckAndDownloadAsync();
                core.PostWebMessageAsString(JsonSerializer.Serialize(new
                {
                    type = "update-status",
                    appUpdate = AppUpdater.Status,
                    adBlockUpdate = AdBlock.Status,
                    policy = PolicyService.Status,
                }, JsonOptions));
                break;
            case "export-diagnostics":
                try
                {
                    var zip = Log.ExportDiagnostics(
                        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads", "JoyChromium"),
                        [
                            $"JoyChromium {AppUpdater.Version}",
                            $"uBlock Origin {AdBlock.ActiveVersion ?? "none"} · {AdBlock.Status}",
                            $"Policy {PolicyService.Status}",
                            $"App update {AppUpdater.Status}",
                        ]);
                    core.PostWebMessageAsString(JsonSerializer.Serialize(new { type = "diagnostics", path = zip }, JsonOptions));
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    core.PostWebMessageAsString(JsonSerializer.Serialize(new { type = "diagnostics", error = ex.Message }, JsonOptions));
                }
                break;
            case "clear-data":
                await core.Profile.ClearBrowsingDataAsync();
                _httpAllowedHosts.Clear();
                StatusText.Text = "BROWSING DATA CLEARED";
                break;
        }
    }

    private static void SaveGeneral(SettingsMessage parsed)
    {
        var current = SettingsStore.Current;
        SettingsStore.Save(current with
        {
            Startup = Enum.TryParse<StartupMode>(parsed.Startup, true, out var startup) ? startup : current.Startup,
            StartupUrl = Pages.IsWebUrl(parsed.StartupUrl) ? parsed.StartupUrl! : current.StartupUrl,
            NewTab = Enum.TryParse<NewTabMode>(parsed.NewTab, true, out var newTab) ? newTab : current.NewTab,
            NewTabUrl = Pages.IsWebUrl(parsed.NewTabUrl) ? parsed.NewTabUrl! : current.NewTabUrl,
            HomeUrl = Pages.IsWebUrl(parsed.HomeUrl) ? parsed.HomeUrl! : current.HomeUrl,
        });
    }

    private static Theme? ParseTheme(SettingsTheme? t) =>
        t is null ? null : Theme.TryParse(t.Accent, t.Background, t.Surface, t.Text);

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, PropertyNameCaseInsensitive = true };

    private sealed record SettingsMessage(
        string? Type, SettingsTheme? Theme, SettingsSearch? SearchEngine, bool? AdBlockEnabled,
        string? Startup, string? StartupUrl, string? NewTab, string? NewTabUrl, string? HomeUrl,
        List<SettingsShortcut>? Shortcuts, string? Url, bool? AllowHttp,
        bool? HttpsOnly, string? TrackingPrevention, string? DnsOverHttps, bool? PasswordAutosave, bool? Autofill,
        bool? BlockDangerousDownloads, string? Host, string? Query, string? InputMode);
    private sealed record SettingsShortcut(string? Name, string? Url);
    private sealed record SettingsTheme(string? Accent, string? Background, string? Surface, string? Text);
    private sealed record SettingsSearch(string? Name, string? Template);

    private void OpenAddressKeyboard()
    {
        AddressBox.Focus();
        AddressBox.SelectAll();
        _addressEntry = true;
        if (_active is not null)
            _active.InputFrame = null;
        _shift = false;
        KeyboardTitle.Text = "ADDRESS / SEARCH";
        KeyboardPanel.Visibility = Visibility.Visible;
        KeyboardKeys.Children[0].Focus();
    }

    private void HideKeyboard()
    {
        KeyboardPanel.Visibility = Visibility.Collapsed;
        if (_active is not null)
            _active.InputFrame = null;
        _shift = false;
        _active?.View.Focus();
    }

    private async Task InsertTextAsync(string text)
    {
        if (_addressEntry)
        {
            if (text == "")
            {
                if (AddressBox.SelectionLength > 0)
                    AddressBox.SelectedText = string.Empty;
                else if (AddressBox.CaretIndex > 0)
                {
                    var index = AddressBox.CaretIndex;
                    AddressBox.Text = AddressBox.Text.Remove(index - 1, 1);
                    AddressBox.CaretIndex = index - 1;
                }
            }
            else
            {
                var index = AddressBox.CaretIndex;
                AddressBox.SelectedText = text;
                AddressBox.CaretIndex = index + text.Length;
            }
            return;
        }

        if (Core is null)
            return;

        var literal = JsonSerializer.Serialize(text);
        var script = $$"""
            (() => {
              const text = {{literal}};
              const field = document.activeElement;
              if (!field) return;
              if (field.isContentEditable) { document.execCommand(text === '\\b' ? 'delete' : 'insertText', false, text === '\\b' ? undefined : text); return; }
              if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
              const start = typeof field.selectionStart === 'number' ? field.selectionStart : field.value.length;
              const end = typeof field.selectionEnd === 'number' ? field.selectionEnd : start;
              const next = text === '\b' ? field.value.slice(0, Math.max(0, start - 1)) + field.value.slice(end) : field.value.slice(0, start) + text + field.value.slice(end);
              const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
              Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, next);
              const caret = text === '\b' ? Math.max(0, start - 1) : start + text.length;
              if (typeof field.setSelectionRange === 'function') field.setSelectionRange(caret, caret);
              field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: text === '\b' ? 'deleteContentBackward' : 'insertText', data: text === '\b' ? null : text }));
            })()
            """;
        await ExecuteInInputContextAsync(script);
    }

    private async Task SubmitPageInputAsync()
    {
        if (_addressEntry)
        {
            NavigateFromAddress();
            return;
        }
        const string script = "(() => { const field=document.activeElement; if(field && field.form && field.tagName !== 'TEXTAREA') field.form.requestSubmit(); else if(field) field.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); })()";
        await ExecuteInInputContextAsync(script);
    }

    private async Task ExecuteInInputContextAsync(string script)
    {
        if (_active is null)
            return;
        if (_active.InputFrame is not null)
            await _active.InputFrame.ExecuteScriptAsync(script);
        else if (Core is not null)
            await Core.ExecuteScriptAsync(script);
    }
}
