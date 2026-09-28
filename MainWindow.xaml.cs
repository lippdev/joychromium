using Microsoft.Web.WebView2.Core;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Threading;

namespace JoyChromium;

public partial class MainWindow : Window
{
    private const string KeyboardMessage = "joychromium:show-keyboard";
    private const string StartPage = "https://www.youtube.com/tv";
    private readonly DispatcherTimer _gamepadTimer = new() { Interval = TimeSpan.FromMilliseconds(50) };
    private CoreWebView2Frame? _inputFrame;
    private bool _addressEntry;
    private bool _shift;
    private bool _controllerConnected;
    private ushort _previousButtons;
    private DateTime _lastDirection = DateTime.MinValue;

    public MainWindow()
    {
        InitializeComponent();
        BuildKeyboard();
        _gamepadTimer.Tick += PollGamepad;
        _gamepadTimer.Start();
        Closed += (_, _) => _gamepadTimer.Stop();
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            await Browser.EnsureCoreWebView2Async();
            var core = Browser.CoreWebView2;
            core.Settings.UserAgent = TvIdentity.Ensure(core.Settings.UserAgent);
            if (!TvIdentity.IsActive(core.Settings.UserAgent))
                throw new InvalidOperationException("The mandatory TV user-agent marker was not applied.");

            core.Settings.IsStatusBarEnabled = false;
            core.WebMessageReceived += (_, args) => HandleWebMessage(args, null);
            core.FrameCreated += (_, args) =>
                args.Frame.WebMessageReceived += (_, message) => HandleWebMessage(message, args.Frame);
            core.NewWindowRequested += (_, args) =>
            {
                args.Handled = true;
                if (Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri))
                    core.Navigate(uri.ToString());
            };
            core.NavigationStarting += (_, args) =>
            {
                _inputFrame = null;
                KeyboardPanel.Visibility = Visibility.Collapsed;
                AddressBox.Text = args.Uri;
                StatusText.Text = "LOADING · TV IDENTITY ON";
            };
            core.NavigationCompleted += (_, args) =>
            {
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

            AddressBox.Text = StartPage;
            core.Navigate(StartPage);
            StatusText.Text = "READY · TV IDENTITY ON";
        }
        catch (Exception ex)
        {
            StatusText.Text = "BROWSER START FAILED";
            MessageBox.Show(this, ex.Message, "JoyChromium could not start", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

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

    private void HandleWebMessage(CoreWebView2WebMessageReceivedEventArgs args, CoreWebView2Frame? frame)
    {
        try
        {
            if (args.TryGetWebMessageAsString() != KeyboardMessage)
                return;
            _inputFrame = frame;
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
        _addressEntry = true;
        _inputFrame = null;
        _shift = false;
        KeyboardTitle.Text = "ADDRESS / SEARCH";
        KeyboardPanel.Visibility = Visibility.Visible;
        KeyboardKeys.Children[0].Focus();
    }

    private void HideKeyboard()
    {
        KeyboardPanel.Visibility = Visibility.Collapsed;
        _inputFrame = null;
        _shift = false;
        Browser.Focus();
    }

    private async Task InsertTextAsync(string text)
    {
        if (_addressEntry)
        {
            if (text == "")
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

        if (Browser.CoreWebView2 is null)
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
        if (_inputFrame is not null)
            await _inputFrame.ExecuteScriptAsync(script);
        else
            await Browser.CoreWebView2.ExecuteScriptAsync(script);
    }

    private async Task SubmitPageInputAsync()
    {
        if (_addressEntry)
        {
            NavigateFromAddress();
            return;
        }
        const string script = "(() => { const field=document.activeElement; if(field && field.form && field.tagName !== 'TEXTAREA') field.form.requestSubmit(); else if(field) field.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); })()";
        if (_inputFrame is not null)
            await _inputFrame.ExecuteScriptAsync(script);
        else if (Browser.CoreWebView2 is not null)
            await Browser.CoreWebView2.ExecuteScriptAsync(script);
    }

    private void NavigateFromAddress()
    {
        var text = AddressBox.Text.Trim();
        if (string.IsNullOrEmpty(text) || Browser.CoreWebView2 is null)
            return;
        HideKeyboard();
        var uri = Uri.TryCreate(text, UriKind.Absolute, out var parsed) &&
                  (parsed.Scheme == Uri.UriSchemeHttp || parsed.Scheme == Uri.UriSchemeHttps)
            ? parsed
            : new Uri("https://duckduckgo.com/?q=" + Uri.EscapeDataString(text));
        Browser.CoreWebView2.Navigate(uri.ToString());
    }

    private void Back_Click(object sender, RoutedEventArgs e)
    {
        if (Browser.CoreWebView2?.CanGoBack == true) Browser.CoreWebView2.GoBack();
    }

    private void Forward_Click(object sender, RoutedEventArgs e)
    {
        if (Browser.CoreWebView2?.CanGoForward == true) Browser.CoreWebView2.GoForward();
    }

    private void Reload_Click(object sender, RoutedEventArgs e) => Browser.CoreWebView2?.Reload();
    private void Home_Click(object sender, RoutedEventArgs e) => Browser.CoreWebView2?.Navigate(StartPage);
    private void Go_Click(object sender, RoutedEventArgs e) => NavigateFromAddress();

    private void AddressBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            NavigateFromAddress();
            e.Handled = true;
        }
    }

    private void Window_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Escape && KeyboardPanel.Visibility == Visibility.Visible)
        {
            HideKeyboard();
            e.Handled = true;
            return;
        }
        if ((Keyboard.Modifiers & ModifierKeys.Control) == 0)
            return;
        if (e.Key == Key.L)
        {
            OpenAddressKeyboard();
            e.Handled = true;
        }
        else if (e.Key == Key.R)
        {
            Browser.CoreWebView2?.Reload();
            e.Handled = true;
        }
    }

    private void Shift_Click(object sender, RoutedEventArgs e)
    {
        _shift = !_shift;
        foreach (var button in KeyboardKeys.Children.OfType<Button>())
            button.Content = _shift ? ((string)button.Tag).ToUpperInvariant() : (string)button.Tag;
    }

    private async void Space_Click(object sender, RoutedEventArgs e) => await InsertTextAsync(" ");
    private async void Backspace_Click(object sender, RoutedEventArgs e) => await InsertTextAsync("");
    private async void Enter_Click(object sender, RoutedEventArgs e) => await SubmitPageInputAsync();
    private void Done_Click(object sender, RoutedEventArgs e) => HideKeyboard();

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
        if ((pressed & (0x8000 | 0x0010)) != 0) OpenAddressKeyboard();              // Y / Start
        if ((pressed & 0x2000) != 0)                                               // B
        {
            if (KeyboardPanel.Visibility == Visibility.Visible) HideKeyboard();
            else Back_Click(this, new RoutedEventArgs());
        }
        if ((pressed & 0x1000) != 0) await ActivateFocusedAsync();                  // A

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

        Browser.Focus();
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
        if (KeyboardPanel.Visibility == Visibility.Visible)
        {
            if (Keyboard.FocusedElement is Button key)
                key.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            return;
        }
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
        Browser.Focus();
        SendVirtualKey(0x0D);
        await Task.CompletedTask;
    }

    private static void SendVirtualKey(ushort key)
    {
        var input = new[]
        {
            new Input { Type = 1, Union = new InputUnion { Keyboard = new KeyboardInput { VirtualKey = key } } },
            new Input { Type = 1, Union = new InputUnion { Keyboard = new KeyboardInput { VirtualKey = key, Flags = 0x0002 } } }
        };
        SendInput((uint)input.Length, input, Marshal.SizeOf<Input>());
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
