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

/// <summary>Address bar navigation, toolbar buttons and keyboard shortcuts.</summary>
public partial class MainWindow
{

    private CoreWebView2? Core => _active?.View.CoreWebView2;

    private void NavigateFromAddress()
    {
        var text = AddressBox.Text.Trim();
        if (string.IsNullOrEmpty(text) || _active is null)
            return;
        HideKeyboard();
        var resolved = Pages.Resolve(text);
        if (resolved != text)
        {
            NavigateActive(resolved);
            return;
        }
        // Anything that is not a plain web address (javascript:, file:, edge:, ...) is treated as a search.
        var uri = Pages.IsWebUrl(text) ? new Uri(text) : SettingsStore.Current.SearchEngine.BuildQuery(text);
        NavigateActive(uri.ToString());
    }

    /// <summary>Navigates the active tab now, or as soon as its engine finishes initializing.</summary>
    private void NavigateActive(string url)
    {
        if (_active is null)
            return;
        if (_active.View.CoreWebView2 is { } core)
            core.Navigate(Pages.Resolve(url));
        else
            _active.PendingNavigation = url;
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
    private void Home_Click(object sender, RoutedEventArgs e) => NavigateActive(SettingsStore.Current.HomeUrl);
    private void Go_Click(object sender, RoutedEventArgs e) => NavigateFromAddress();

    private void AddressBox_KeyDown(object sender, KeyEventArgs e)
    {
        switch (e.Key)
        {
            case Key.Enter:
                SuggestionsPopup.IsOpen = false;
                NavigateFromAddress();
                e.Handled = true;
                break;
            case Key.Down when SuggestionsPopup.IsOpen && SuggestionsList.Items.Count > 0:
                SuggestionsList.SelectedIndex = 0;
                (SuggestionsList.ItemContainerGenerator.ContainerFromIndex(0) as ListBoxItem)?.Focus();
                e.Handled = true;
                break;
            case Key.Escape:
                SuggestionsPopup.IsOpen = false;
                break;
        }
    }

    private async void Window_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Escape)
        {
            if (KeyboardPanel.Visibility == Visibility.Visible) { HideKeyboard(); e.Handled = true; return; }
            if (FindPanel.Visibility == Visibility.Visible) { CloseFind(); e.Handled = true; return; }
            if (Core?.ContainsFullScreenElement == true) { await ExitPageFullscreenAsync(); e.Handled = true; return; }
        }
        if (e.Key == Key.F11)
        {
            SetChromeVisible(TitleBar.Visibility != Visibility.Visible);
            e.Handled = true;
            return;
        }
        if ((Keyboard.Modifiers & ModifierKeys.Control) == 0)
            return;
        var shift = (Keyboard.Modifiers & ModifierKeys.Shift) != 0;
        e.Handled = true;
        switch (e.Key)
        {
            case Key.L: OpenAddressKeyboard(); break;
            case Key.R: Core?.Reload(); break;
            case Key.T when shift: await ReopenClosedTabAsync(); break;
            case Key.T: NewTab_Click(this, new RoutedEventArgs()); break;
            case Key.N when shift: await OpenTabAsync(Pages.NewTabScheme, isPrivate: true); break;
            case Key.W: if (_active is not null) await CloseTabAsync(_active); break;
            case Key.Tab: SwitchTab(shift ? -1 : 1); break;
            case Key.OemComma: NavigateActive(Pages.SettingsPage); break;
            case Key.D: ToggleFavorite(); break;
            case Key.M: ToggleMute(_active); break;
            case Key.F: OpenFind(); break;
            case Key.H: NavigateActive(Pages.HistoryPage); break;
            case Key.B: NavigateActive(Pages.FavoritesPage); break;
            case Key.OemPlus or Key.Add: SetZoom((_active?.View.ZoomFactor ?? 1) + 0.1); break;
            case Key.OemMinus or Key.Subtract: SetZoom((_active?.View.ZoomFactor ?? 1) - 0.1); break;
            case Key.D0 or Key.NumPad0: SetZoom(1); break;
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
}
