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

/// <summary>Favorites, find in page, zoom, fullscreen, reopen closed tab, address suggestions and new tab.</summary>
public partial class MainWindow
{

    private readonly Stack<(string Url, bool IsPrivate)> _closedTabs = new();

    private void UpdateFavoriteButton()
    {
        var isFavorite = _active is not null && SettingsStore.Current.IsFavorite(_active.Url);
        FavoriteButton.Content = isFavorite ? "" : "";
        FavoriteButton.ToolTip = isFavorite ? "Remove from favorites · Ctrl+D · LB+Y" : "Add to favorites · Ctrl+D · LB+Y";
        FavoriteButton.Foreground = (System.Windows.Media.Brush)FindResource(isFavorite ? "AccentBrush" : "TextBrush");
    }

    private void Favorite_Click(object sender, RoutedEventArgs e) => ToggleFavorite();

    private void ToggleFavorite()
    {
        if (_active is null || !Pages.IsWebUrl(_active.Url))
            return;
        var name = _active.Title.Replace("🕶 ", "", StringComparison.Ordinal).Trim();
        var (settings, isFavorite) = SettingsStore.Current.ToggleFavorite(_active.Url, name);
        SettingsStore.Save(settings);
        UpdateFavoriteButton();
        StatusText.Text = isFavorite ? "ADDED TO FAVORITES" : "REMOVED FROM FAVORITES";
    }

    private async Task ReopenClosedTabAsync()
    {
        if (_closedTabs.TryPop(out var closed))
            await OpenTabAsync(closed.Url, isPrivate: closed.IsPrivate);
    }

    private void SetChromeVisible(bool visible)
    {
        var visibility = visible ? Visibility.Visible : Visibility.Collapsed;
        TitleBar.Visibility = visibility;
        Toolbar.Visibility = visibility;
        StatusBar.Visibility = visibility;
        if (!visible && WindowState != WindowState.Maximized)
            SystemCommands.MaximizeWindow(this);
    }

    private async Task ExitPageFullscreenAsync()
    {
        if (Core is { ContainsFullScreenElement: true } core)
            await core.ExecuteScriptAsync("document.exitFullscreen && document.exitFullscreen()");
    }

    private void SetZoom(double factor)
    {
        if (_active is null)
            return;
        _active.View.ZoomFactor = Math.Clamp(factor, 0.5, 3.0);
        StatusText.Text = $"ZOOM {Math.Round(_active.View.ZoomFactor * 100)}%";
    }

    private void OpenFind()
    {
        FindPanel.Visibility = Visibility.Visible;
        FindBox.Focus();
        FindBox.SelectAll();
    }

    private void CloseFind()
    {
        FindPanel.Visibility = Visibility.Collapsed;
        _active?.View.Focus();
    }

    private async Task FindAsync(bool backwards)
    {
        var text = FindBox.Text;
        if (Core is null || text.Length == 0)
            return;
        var literal = JsonSerializer.Serialize(text);
        // window.find is the one primitive every Chromium exposes without an extra API surface; it wraps and highlights.
        var found = await Core.ExecuteScriptAsync($"window.find({literal}, false, {(backwards ? "true" : "false")}, true, false, true, false)");
        StatusText.Text = found == "true" ? $"FOUND · {text}" : $"NOT FOUND · {text}";
    }

    private async void FindBox_KeyDown(object sender, KeyEventArgs e)
    {
        switch (e.Key)
        {
            case Key.Enter: e.Handled = true; await FindAsync((Keyboard.Modifiers & ModifierKeys.Shift) != 0); break;
            case Key.Escape: e.Handled = true; CloseFind(); break;
        }
    }

    private async void FindBox_TextChanged(object sender, TextChangedEventArgs e) => await FindAsync(false);
    private async void FindNext_Click(object sender, RoutedEventArgs e) => await FindAsync(false);
    private async void FindPrev_Click(object sender, RoutedEventArgs e) => await FindAsync(true);
    private void FindClose_Click(object sender, RoutedEventArgs e) => CloseFind();

    // ---- Address suggestions ----

    private void AddressBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (!AddressBox.IsKeyboardFocusWithin && KeyboardPanel.Visibility != Visibility.Visible)
            return;
        var items = Suggestion.Build(AddressBox.Text, SettingsStore.Current.Favorites, History.Default.Recent(500));
        SuggestionsList.ItemsSource = items;
        SuggestionsPopup.IsOpen = items.Count > 0 && AddressBox.Text != _active?.Url;
    }

    private void AcceptSuggestion()
    {
        if (SuggestionsList.SelectedItem is Suggestion s)
        {
            AddressBox.Text = s.Url;
            SuggestionsPopup.IsOpen = false;
            NavigateFromAddress();
        }
    }

    private void Suggestion_Click(object sender, MouseButtonEventArgs e) => AcceptSuggestion();

    private void Suggestions_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter) { e.Handled = true; AcceptSuggestion(); }
        else if (e.Key == Key.Escape) { e.Handled = true; SuggestionsPopup.IsOpen = false; AddressBox.Focus(); }
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
}
