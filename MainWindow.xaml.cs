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
        _housekeeping.Tick += Housekeeping_Tick;
        _housekeeping.Start();
        Closing += (_, _) => SettingsStore.SaveSession(SessionUrls());
        Closed += (_, _) =>
        {
            _gamepadTimer.Stop();
            _housekeeping.Stop();
            AppUpdater.ApplyOnExit();
        };
    }

    public ObservableCollection<BrowserTab> Tabs { get; } = [];

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            var dataFolder = Path.Combine(SettingsStore.DataFolder, "WebView2");
            var settings = SettingsStore.Current;
            PolicyService.LoadCached();
            var runtime = CoreWebView2Environment.GetAvailableBrowserVersionString();
            if (!SecurityPolicy.RuntimeIsSupported(runtime, PolicyService.Current.EffectiveMinimumRuntime))
            {
                MessageBox.Show(this,
                    $"The installed WebView2 runtime ({runtime}) is older than {PolicyService.Current.EffectiveMinimumRuntime}. " +
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
            _ = RunMaintenanceAsync();
        }
        catch (Exception ex)
        {
            Log.Error("Browser start failed", ex);
            StatusText.Text = "BROWSER START FAILED";
            MessageBox.Show(this, ex.Message, "JoyChromium could not start", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }


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
}
