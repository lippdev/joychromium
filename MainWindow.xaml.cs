using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using System.Collections.ObjectModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Shell;
using System.Windows.Threading;

namespace JoyChromium;

public partial class MainWindow : Window
{
    private const string KeyboardMessage = "joychromium:show-keyboard";
    private const string StartPage = "https://www.youtube.com/tv";
    private const int TriggerThreshold = 128;

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
        InitializeComponent();
        BuildKeyboard();
        _gamepadTimer.Tick += PollGamepad;
        _gamepadTimer.Start();
        Closed += (_, _) => _gamepadTimer.Stop();
    }

    public ObservableCollection<BrowserTab> Tabs { get; } = [];

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            var dataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JoyChromium", "WebView2");
            _environment = await CoreWebView2Environment.CreateAsync(userDataFolder: dataFolder);
            await OpenTabAsync(StartPage);
        }
        catch (Exception ex)
        {
            StatusText.Text = "BROWSER START FAILED";
            MessageBox.Show(this, ex.Message, "JoyChromium could not start", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    // ---- Tabs ----

    private async Task<BrowserTab> OpenTabAsync(string url, bool activate = true)
    {
        var view = new WebView2CompositionControl { Visibility = Visibility.Collapsed };
        var tab = new BrowserTab(view) { Url = url };
        BrowserHost.Children.Add(view);
        Tabs.Add(tab);
        if (activate)
            ActivateTab(tab);

        await view.EnsureCoreWebView2Async(_environment);
        var core = view.CoreWebView2;
        core.Settings.UserAgent = TvIdentity.Ensure(core.Settings.UserAgent);
        if (!TvIdentity.IsActive(core.Settings.UserAgent))
            throw new InvalidOperationException("The mandatory TV user-agent marker was not applied.");

        core.Settings.IsStatusBarEnabled = false;
        core.WebMessageReceived += (_, args) => HandleWebMessage(tab, args, null);
        core.FrameCreated += (_, args) =>
            args.Frame.WebMessageReceived += (_, message) => HandleWebMessage(tab, message, args.Frame);
        core.NewWindowRequested += async (_, args) =>
        {
            args.Handled = true;
            if (Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri))
                await OpenTabAsync(uri.ToString());
        };
        core.DocumentTitleChanged += (_, _) =>
        {
            tab.Title = core.DocumentTitle;
            if (tab == _active)
                Title = $"{tab.Title} - JoyChromium";
        };
        core.NavigationStarting += (_, args) =>
        {
            tab.InputFrame = null;
            tab.Url = args.Uri;
            if (tab != _active)
                return;
            KeyboardPanel.Visibility = Visibility.Collapsed;
            AddressBox.Text = args.Uri;
            StatusText.Text = "LOADING · TV IDENTITY ON";
        };
        core.NavigationCompleted += (_, args) =>
        {
            if (tab == _active)
                StatusText.Text = args.IsSuccess ? "READY · TV IDENTITY ON" : $"LOAD ISSUE · {args.WebErrorStatus}";
        };
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

        core.Navigate(url);
        return tab;
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
                await OpenTabAsync(StartPage);
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
        await OpenTabAsync(StartPage);
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
            if (args.TryGetWebMessageAsString() != KeyboardMessage || tab != _active)
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
        var uri = Uri.TryCreate(text, UriKind.Absolute, out var parsed) &&
                  (parsed.Scheme == Uri.UriSchemeHttp || parsed.Scheme == Uri.UriSchemeHttps)
            ? parsed
            : new Uri("https://duckduckgo.com/?q=" + Uri.EscapeDataString(text));
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
    private void Home_Click(object sender, RoutedEventArgs e) => Core?.Navigate(StartPage);
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
            case Key.T: await OpenTabAsync(StartPage); OpenAddressKeyboard(); break;
            case Key.W: if (_active is not null) await CloseTabAsync(_active); break;
            case Key.Tab: SwitchTab((Keyboard.Modifiers & ModifierKeys.Shift) != 0 ? -1 : 1); break;
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
            if (KeyboardPanel.Visibility == Visibility.Visible) HideKeyboard();
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
