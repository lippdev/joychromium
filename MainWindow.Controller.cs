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
using static JoyChromium.NativeInput;
namespace JoyChromium;

/// <summary>XInput polling and the three input modes (spatial focus, virtual cursor, raw arrows).</summary>
public partial class MainWindow
{

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
        if ((pressed & 0x8000) != 0)                                                // Y (LB held: favorite)
        {
            if ((buttons & 0x0100) != 0) ToggleFavorite();
            else OpenAddressKeyboard();
        }
        if ((pressed & 0x0010) != 0) NewTab_Click(this, new RoutedEventArgs());      // Start
        if ((pressed & 0x0020) != 0 && _active is not null) await CloseTabAsync(_active); // Back (view)
        if ((pressed & 0x2000) != 0)                                               // B
        {
            if (PermissionPanel.Visibility == Visibility.Visible) ResolvePermission(false, false);
            else if (KeyboardPanel.Visibility == Visibility.Visible) HideKeyboard();
            else Back_Click(this, new RoutedEventArgs());
        }
        if ((pressed & 0x1000) != 0) await ActivateFocusedAsync();                  // A
        if ((pressed & 0x0080) != 0) CycleInputMode();                              // Right stick click

        var overlayOpen = PermissionPanel.Visibility == Visibility.Visible || KeyboardPanel.Visibility == Visibility.Visible;
        if (_inputMode == InputMode.Cursor && !overlayOpen)
            CursorTick(state.Gamepad);

        var left = state.Gamepad.LeftTrigger > TriggerThreshold;
        var right = state.Gamepad.RightTrigger > TriggerThreshold;
        if (left && !_leftTriggerHeld) SwitchTab(-1);
        if (right && !_rightTriggerHeld) SwitchTab(1);
        _leftTriggerHeld = left;
        _rightTriggerHeld = right;

        // In Cursor mode the stick is continuous movement, so only the D-pad produces discrete steps.
        var direction = _inputMode == InputMode.Cursor && !overlayOpen
            ? GetDirection(buttons, default)
            : GetDirection(buttons, state.Gamepad);
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

    // ---- Input modes: spatial focus, virtual cursor, raw arrows ----

    private static readonly string SpatialScript = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Assets", "spatial.js"));
    private InputMode _inputMode = InputMode.Spatial;
    private Point _cursor = new(200, 200);
    private bool _cursorPlaced;
    private bool _spatialChecked;

    private string? ActiveHost => _active is null ? null : SecurityPolicy.HostOf(Pages.Resolve(_active.Url));

    /// <summary>Called whenever the active tab or its URL changes: picks the remembered/default mode for the host.</summary>
    private void RefreshInputMode()
    {
        var host = ActiveHost;
        var mode = _active is null || Pages.IsInternal(Pages.Resolve(_active.Url)) ? InputMode.Spatial : SettingsStore.Current.InputModeFor(host);
        ApplyInputMode(mode, announce: false);
    }

    private void ApplyInputMode(InputMode mode, bool announce)
    {
        _inputMode = mode;
        CursorLayer.Visibility = mode == InputMode.Cursor ? Visibility.Visible : Visibility.Collapsed;
        if (mode == InputMode.Cursor)
            PlaceCursor(_cursorPlaced ? _cursor : new Point(BrowserHost.ActualWidth / 2, BrowserHost.ActualHeight / 2));
        if (announce)
            StatusText.Text = $"INPUT · {mode.ToString().ToUpperInvariant()}";
    }

    private void CycleInputMode()
    {
        var next = ControllerInput.Next(_inputMode);
        if (ActiveHost is { } host && !Pages.IsInternal(Pages.Resolve(_active!.Url)))
            SettingsStore.Save(SettingsStore.Current.WithInputMode(host, next));
        ApplyInputMode(next, announce: true);
    }

    private void PlaceCursor(Point p)
    {
        _cursor = new Point(Math.Clamp(p.X, 0, Math.Max(0, BrowserHost.ActualWidth - 1)), Math.Clamp(p.Y, 0, Math.Max(0, BrowserHost.ActualHeight - 1)));
        _cursorPlaced = true;
        Canvas.SetLeft(VirtualCursor, _cursor.X);
        Canvas.SetTop(VirtualCursor, _cursor.Y);
    }

    /// <summary>Moves the real mouse to the virtual cursor so hover states and the click land where the overlay shows.</summary>
    private void SyncRealMouse()
    {
        var screen = BrowserHost.PointToScreen(_cursor);
        var source = PresentationSource.FromVisual(this);
        var scale = source?.CompositionTarget?.TransformToDevice.M11 ?? 1.0;
        // PointToScreen already returns device pixels; SendInput wants 0..65535 across the virtual screen.
        var vx = (int)(screen.X * 65535 / SystemParameters.PrimaryScreenWidth / scale);
        var vy = (int)(screen.Y * 65535 / SystemParameters.PrimaryScreenHeight / scale);
        SendMouse(0x8001, vx, vy, 0); // MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE
    }

    private void CursorTick(XInputGamepad pad)
    {
        var (dx, dy) = ControllerInput.StickToVelocity(pad.ThumbLX, pad.ThumbLY);
        if (dx != 0 || dy != 0)
        {
            PlaceCursor(new Point(_cursor.X + dx, _cursor.Y + dy));
            SyncRealMouse();
        }
        var notches = ControllerInput.StickToScroll(pad.ThumbRY);
        if (notches != 0)
            SendMouse(0x0800, 0, 0, notches * 120); // MOUSEEVENTF_WHEEL
    }

    private void CursorClick()
    {
        SyncRealMouse();
        SendMouse(0x0002, 0, 0, 0); // LEFTDOWN
        SendMouse(0x0004, 0, 0, 0); // LEFTUP
    }

    private async Task SpatialMoveAsync(FocusNavigationDirection direction)
    {
        if (Core is null)
            return;
        var dir = direction switch
        {
            FocusNavigationDirection.Up => "up",
            FocusNavigationDirection.Down => "down",
            FocusNavigationDirection.Left => "left",
            _ => "right",
        };
        await Core.ExecuteScriptAsync($"window.__joy && window.__joy.move('{dir}')");
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
        if (_inputMode == InputMode.Spatial)
        {
            _ = SpatialMoveAsync(direction);
            return;
        }
        if (_inputMode == InputMode.Cursor)
        {
            // D-pad nudges the cursor by a fixed step; the stick handles continuous movement in CursorTick.
            var step = 24;
            PlaceCursor(direction switch
            {
                FocusNavigationDirection.Up => new Point(_cursor.X, _cursor.Y - step),
                FocusNavigationDirection.Down => new Point(_cursor.X, _cursor.Y + step),
                FocusNavigationDirection.Left => new Point(_cursor.X - step, _cursor.Y),
                _ => new Point(_cursor.X + step, _cursor.Y),
            });
            SyncRealMouse();
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
        switch (_inputMode)
        {
            case InputMode.Cursor:
                CursorClick();
                break;
            case InputMode.Spatial when Core is not null:
                await Core.ExecuteScriptAsync("window.__joy && window.__joy.activate()");
                break;
            default:
                SendVirtualKey(0x0D);
                break;
        }
    }
}
