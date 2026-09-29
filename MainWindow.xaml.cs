using System.Collections.ObjectModel;
using System.IO;
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

public partial class MainWindow : Window
{
    private const string KeyboardMessage = "joychromium:show-keyboard";
    private const int TriggerThreshold = 128;
    private bool _adBlockActive;

    private readonly DispatcherTimer _gamepadTimer = new() { Interval = TimeSpan.FromMilliseconds(50) };
    private CoreWebView2Environment? _environment;
    private BrowserTab? _active;
    private bool _addressEntry;
    private bool _shift;
    private bool _controllerConnected;
    private ushort _previousButtons;
    private bool _leftTriggerHeld;
    private bool _rightTriggerHeld;
    private DateTime _lastDirection = DateTime.MinValue;

    public MainWindow()
    {
        ThemeService.Apply(SettingsStore.Load().Theme);
        InitializeComponent();
        BuildKeyboard();
        _gamepadTimer.Tick += PollGamepad;
        _gamepadTimer.Start();
        Closing += (_, _) => SettingsStore.SaveSession(Tabs.Where(t => !t.IsPrivate).Select(t => t.Url)
            .Where(u => u != Pages.WelcomeScheme && u != Pages.SettingsScheme && !u.StartsWith(Pages.ErrorPage, StringComparison.Ordinal)));
        Closed += (_, _) => _gamepadTimer.Stop();
    }

    public ObservableCollection<BrowserTab> Tabs { get; } = [];

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            var dataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JoyChromium", "WebView2");
            var settings = SettingsStore.Current;
            var runtime = CoreWebView2Environment.GetAvailableBrowserVersionString();
            if (!SecurityPolicy.RuntimeIsSupported(runtime))
            {
                MessageBox.Show(this,
                    $"The installed WebView2 runtime ({runtime}) is older than {SecurityPolicy.MinimumRuntimeVersion}. " +
                    "Update it from Windows Update or https://developer.microsoft.com/microsoft-edge/webview2/ to stay protected.",
                    "Browser engine out of date", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
            var options = new CoreWebView2EnvironmentOptions
            {
                AreBrowserExtensionsEnabled = true,
                AdditionalBrowserArguments = SecurityPolicy.BrowserArguments(settings.DnsOverHttps),
            };
            _environment = await CoreWebView2Environment.CreateAsync(userDataFolder: dataFolder, options: options);
            var targets = settings.OnboardingCompleted
                ? settings.StartupTargets(SettingsStore.LoadSession())
                : [Pages.OnboardingPage];
            var tab = await OpenTabAsync(targets[0]);
            foreach (var url in targets.Skip(1))
                await OpenTabAsync(url, activate: false);
            await ApplyAdBlockAsync(tab, settings.AdBlockEnabled);
        }
        catch (Exception ex)
        {
            StatusText.Text = "BROWSER START FAILED";
            MessageBox.Show(this, ex.Message, "JoyChromium could not start", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    // ---- Tabs ----

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
        };
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
            StatusText.Text = "LOADING · TV IDENTITY ON";
        };
        core.NavigationCompleted += (_, args) =>
        {
            var pendingHttp = tab.PendingHttpsUpgrade;
            tab.PendingHttpsUpgrade = null;
            if (!args.IsSuccess && args.WebErrorStatus != CoreWebView2WebErrorStatus.OperationCanceled && !Pages.IsInternal(core.Source))
            {
                core.Navigate(Pages.ErrorPageFor(pendingHttp ?? core.Source, args.WebErrorStatus.ToString(), pendingHttp is not null));
                return;
            }
            if (tab == _active)
                StatusText.Text = args.IsSuccess ? "READY · TV IDENTITY ON" : $"LOAD ISSUE · {args.WebErrorStatus}";
        };
        core.ServerCertificateErrorDetected += (_, args) =>
        {
            // Never offer a bypass: a TV-room browser should not teach anyone to click through certificate warnings.
            args.Action = CoreWebView2ServerCertificateErrorAction.Cancel;
            StatusText.Text = "BLOCKED · CERTIFICATE ERROR";
        };
        core.PermissionRequested += (_, args) => HandlePermissionRequest(tab, args);
        core.DownloadStarting += (_, args) => HandleDownload(args);
        core.ProcessFailed += (_, args) => StatusText.Text = $"PAGE CRASHED · {args.ProcessFailedKind}";
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

        core.Navigate(Pages.Resolve(url));
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

    // ---- Permissions, downloads ----

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
        if (SettingsStore.Current.BlockDangerousDownloads && SecurityPolicy.IsDangerousDownload(name))
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
        tab.View.Visibility = Visibility.Visible;
        AddressBox.Text = tab.Url;
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
    }

    private void SwitchTab(int offset)
    {
        if (_active is null || Tabs.Count < 2)
            return;
        var index = (Tabs.IndexOf(_active) + offset + Tabs.Count) % Tabs.Count;
        ActivateTab(Tabs[index]);
    }

    private void Tab_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as Button)?.Tag is BrowserTab tab)
            ActivateTab(tab);
    }

    private async void CloseTab_Click(object sender, RoutedEventArgs e)
    {
        e.Handled = true;
        if ((sender as Button)?.Tag is BrowserTab tab)
            await CloseTabAsync(tab);
    }

    private async void NewTab_Click(object sender, RoutedEventArgs e)
    {
        var target = SettingsStore.Current.NewTabTarget;
        await OpenTabAsync(target);
        // The new tab page has its own search box; other targets get the address keyboard.
        if (target != Pages.NewTabScheme)
            OpenAddressKeyboard();
    }

    // ---- Window chrome ----

    private void Minimize_Click(object sender, RoutedEventArgs e) => SystemCommands.MinimizeWindow(this);
    private void Close_Click(object sender, RoutedEventArgs e) => SystemCommands.CloseWindow(this);

    private void Maximize_Click(object sender, RoutedEventArgs e)
    {
        if (WindowState == WindowState.Maximized)
            SystemCommands.RestoreWindow(this);
        else
            SystemCommands.MaximizeWindow(this);
    }

    private void Window_StateChanged(object sender, EventArgs e)
    {
        // With a custom chrome a maximized window overflows the screen by the resize border; pad it back in.
        var maximized = WindowState == WindowState.Maximized;
        Root.BorderThickness = maximized ? new Thickness(7) : new Thickness(0);
        MaximizeButton.Content = maximized ? "" : "";
        MaximizeButton.ToolTip = maximized ? "Restore" : "Maximize";
    }

    // ---- Keyboard ----

    private void BuildKeyboard()
    {
        foreach (var row in new[] { "1234567890", "qwertyuiop", "asdfghjkl.", "zxcvbnm-_/" })
        {
            foreach (var character in row)
            {
                var key = character.ToString();
                var button = new Button
                {
                    Content = key,
                    Tag = key,
                    Style = (Style)FindResource("KeyButton"),
                    FontWeight = FontWeights.SemiBold
                };
                button.Click += async (_, _) => await InsertTextAsync(_shift ? key.ToUpperInvariant() : key);
                KeyboardKeys.Children.Add(button);
            }
        }
    }

    private void HandleWebMessage(BrowserTab tab, CoreWebView2WebMessageReceivedEventArgs args, CoreWebView2Frame? frame)
    {
        try
        {
            var message = args.TryGetWebMessageAsString();
            if (frame is null && Pages.IsInternal(args.Source))
            {
                HandleSettingsMessage(tab, message);
                return;
            }
            if (message != KeyboardMessage || tab != _active)
                return;
            tab.InputFrame = frame;
            _addressEntry = false;
            KeyboardTitle.Text = "PAGE TEXT ENTRY";
            KeyboardPanel.Visibility = Visibility.Visible;
            KeyboardKeys.Children[0].Focus();
        }
        catch (InvalidOperationException)
        {
            // Ignore non-string page messages; the host bridge accepts only the fixed focus signal.
        }
    }

    // ---- Settings page ----

    private void Settings_Click(object sender, RoutedEventArgs e) => Core?.Navigate(Pages.SettingsPage);

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
                    runtimeVersion = CoreWebView2Environment.GetAvailableBrowserVersionString(),
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
            case "permission-forget" when !string.IsNullOrWhiteSpace(parsed.Host):
                SettingsStore.Save(current.WithoutPermissions(parsed.Host.ToLowerInvariant()));
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
        bool? BlockDangerousDownloads, string? Host);
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

    // ---- Navigation ----

    private CoreWebView2? Core => _active?.View.CoreWebView2;

    private void NavigateFromAddress()
    {
        var text = AddressBox.Text.Trim();
        if (string.IsNullOrEmpty(text) || Core is null)
            return;
        HideKeyboard();
        var resolved = Pages.Resolve(text);
        if (resolved != text)
        {
            Core.Navigate(resolved);
            return;
        }
        // Anything that is not a plain web address (javascript:, file:, edge:, ...) is treated as a search.
        var uri = Pages.IsWebUrl(text) ? new Uri(text) : SettingsStore.Current.SearchEngine.BuildQuery(text);
        Core.Navigate(uri.ToString());
    }

    private void Back_Click(object sender, RoutedEventArgs e)
    {
        if (Core?.CanGoBack == true) Core.GoBack();
    }

    private void Forward_Click(object sender, RoutedEventArgs e)
    {
        if (Core?.CanGoForward == true) Core.GoForward();
    }

    private void Reload_Click(object sender, RoutedEventArgs e) => Core?.Reload();
    private void Home_Click(object sender, RoutedEventArgs e) => Core?.Navigate(SettingsStore.Current.HomeUrl);
    private void Go_Click(object sender, RoutedEventArgs e) => NavigateFromAddress();

    private void AddressBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            NavigateFromAddress();
            e.Handled = true;
        }
    }

    private async void Window_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Escape && KeyboardPanel.Visibility == Visibility.Visible)
        {
            HideKeyboard();
            e.Handled = true;
            return;
        }
        if ((Keyboard.Modifiers & ModifierKeys.Control) == 0)
            return;
        e.Handled = true;
        switch (e.Key)
        {
            case Key.L: OpenAddressKeyboard(); break;
            case Key.R: Core?.Reload(); break;
            case Key.T: NewTab_Click(this, new RoutedEventArgs()); break;
            case Key.N when (Keyboard.Modifiers & ModifierKeys.Shift) != 0: await OpenTabAsync(Pages.NewTabScheme, isPrivate: true); break;
            case Key.W: if (_active is not null) await CloseTabAsync(_active); break;
            case Key.Tab: SwitchTab((Keyboard.Modifiers & ModifierKeys.Shift) != 0 ? -1 : 1); break;
            case Key.OemComma: Core?.Navigate(Pages.SettingsPage); break;
            default: e.Handled = false; break;
        }
    }

    private void Shift_Click(object sender, RoutedEventArgs e)
    {
        _shift = !_shift;
        foreach (var button in KeyboardKeys.Children.OfType<Button>())
            button.Content = _shift ? ((string)button.Tag).ToUpperInvariant() : (string)button.Tag;
    }

    private async void Space_Click(object sender, RoutedEventArgs e) => await InsertTextAsync(" ");
    private async void Backspace_Click(object sender, RoutedEventArgs e) => await InsertTextAsync("");
    private async void Enter_Click(object sender, RoutedEventArgs e) => await SubmitPageInputAsync();
    private void Done_Click(object sender, RoutedEventArgs e) => HideKeyboard();

    // ---- Controller ----

    private async void PollGamepad(object? sender, EventArgs e)
    {
        var found = false;
        XInputState state = default;
        for (uint index = 0; index < 4; index++)
        {
            if (XInputGetState(index, out state) == 0)
            {
                found = true;
                break;
            }
        }
        if (!found)
        {
            if (_controllerConnected)
            {
                _controllerConnected = false;
                ControllerText.Text = "XINPUT · DISCONNECTED";
                ControllerText.Foreground = System.Windows.Media.Brushes.LightGray;
            }
            _previousButtons = 0;
            _leftTriggerHeld = _rightTriggerHeld = false;
            return;
        }
        if (!_controllerConnected)
        {
            _controllerConnected = true;
            ControllerText.Text = "XINPUT · READY";
            ControllerText.Foreground = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(100, 221, 181));
        }

        var buttons = state.Gamepad.Buttons;
        var pressed = (ushort)(buttons & ~_previousButtons);
        _previousButtons = buttons;
        if ((pressed & 0x0100) != 0) Back_Click(this, new RoutedEventArgs());       // LB
        if ((pressed & 0x0200) != 0) Forward_Click(this, new RoutedEventArgs());    // RB
        if ((pressed & 0x4000) != 0) Reload_Click(this, new RoutedEventArgs());      // X
        if ((pressed & 0x8000) != 0) OpenAddressKeyboard();                          // Y
        if ((pressed & 0x0010) != 0) NewTab_Click(this, new RoutedEventArgs());      // Start
        if ((pressed & 0x0020) != 0 && _active is not null) await CloseTabAsync(_active); // Back (view)
        if ((pressed & 0x2000) != 0)                                               // B
        {
            if (PermissionPanel.Visibility == Visibility.Visible) ResolvePermission(false, false);
            else if (KeyboardPanel.Visibility == Visibility.Visible) HideKeyboard();
            else Back_Click(this, new RoutedEventArgs());
        }
        if ((pressed & 0x1000) != 0) await ActivateFocusedAsync();                  // A

        var left = state.Gamepad.LeftTrigger > TriggerThreshold;
        var right = state.Gamepad.RightTrigger > TriggerThreshold;
        if (left && !_leftTriggerHeld) SwitchTab(-1);
        if (right && !_rightTriggerHeld) SwitchTab(1);
        _leftTriggerHeld = left;
        _rightTriggerHeld = right;

        var direction = GetDirection(buttons, state.Gamepad);
        if (direction != FocusNavigationDirection.Next && DateTime.UtcNow - _lastDirection >= TimeSpan.FromMilliseconds(180))
        {
            MoveOrScroll(direction);
            _lastDirection = DateTime.UtcNow;
        }
    }

    private static FocusNavigationDirection GetDirection(ushort buttons, XInputGamepad gamepad)
    {
        if ((buttons & 0x0001) != 0 || gamepad.ThumbLY > 16000) return FocusNavigationDirection.Up;
        if ((buttons & 0x0002) != 0 || gamepad.ThumbLY < -16000) return FocusNavigationDirection.Down;
        if ((buttons & 0x0004) != 0 || gamepad.ThumbLX < -16000) return FocusNavigationDirection.Left;
        if ((buttons & 0x0008) != 0 || gamepad.ThumbLX > 16000) return FocusNavigationDirection.Right;
        return FocusNavigationDirection.Next;
    }

    private void MoveOrScroll(FocusNavigationDirection direction)
    {
        if (PermissionPanel.Visibility == Visibility.Visible)
        {
            var focused = Keyboard.FocusedElement as UIElement ?? PermissionDeny;
            focused.MoveFocus(new TraversalRequest(direction));
            return;
        }
        if (KeyboardPanel.Visibility == Visibility.Visible)
        {
            var focused = Keyboard.FocusedElement as UIElement ?? KeyboardKeys.Children[0] as UIElement;
            focused?.MoveFocus(new TraversalRequest(direction));
            return;
        }

        _active?.View.Focus();
        var key = direction switch
        {
            FocusNavigationDirection.Up => (ushort)0x26,
            FocusNavigationDirection.Down => (ushort)0x28,
            FocusNavigationDirection.Left => (ushort)0x25,
            FocusNavigationDirection.Right => (ushort)0x27,
            _ => (ushort)0
        };
        if (key != 0) SendVirtualKey(key);
    }

    private async Task ActivateFocusedAsync()
    {
        if (Keyboard.FocusedElement is Button button)
        {
            button.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            return;
        }
        if (AddressBox.IsKeyboardFocusWithin)
        {
            NavigateFromAddress();
            return;
        }
        _active?.View.Focus();
        SendVirtualKey(0x0D);
        await Task.CompletedTask;
    }

    private static bool SendVirtualKey(ushort key)
    {
        var input = new[]
        {
            new Input { Type = 1, Union = new InputUnion { Keyboard = new KeyboardInput { VirtualKey = key } } },
            new Input { Type = 1, Union = new InputUnion { Keyboard = new KeyboardInput { VirtualKey = key, Flags = 0x0002 } } }
        };
        return SendInput((uint)input.Length, input, Marshal.SizeOf<Input>()) == input.Length;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct XInputGamepad
    {
        public ushort Buttons;
        public byte LeftTrigger;
        public byte RightTrigger;
        public short ThumbLX;
        public short ThumbLY;
        public short ThumbRX;
        public short ThumbRY;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct XInputState
    {
        public uint PacketNumber;
        public XInputGamepad Gamepad;
    }

    [DllImport("xinput1_4.dll", EntryPoint = "XInputGetState")]
    private static extern uint XInputGetState(uint userIndex, out XInputState state);

    [StructLayout(LayoutKind.Sequential)]
    private struct Input
    {
        public uint Type;
        public InputUnion Union;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public KeyboardInput Keyboard;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KeyboardInput
    {
        public ushort VirtualKey;
        public ushort ScanCode;
        public uint Flags;
        public uint Time;
        public IntPtr ExtraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint count, Input[] inputs, int size);
}
