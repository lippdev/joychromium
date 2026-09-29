using System.ComponentModel;
using System.Runtime.CompilerServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace JoyChromium;

/// <summary>One browser tab: its WebView2 surface plus the state the shell shows for it.</summary>
public sealed class BrowserTab : INotifyPropertyChanged
{
    private string _title = "New tab";
    private string _url = "";
    private bool _isActive;

    public BrowserTab(WebView2CompositionControl view) => View = view;

    public WebView2CompositionControl View { get; }

    /// <summary>Frame that owns the focused text field, when the page keyboard was opened from an iframe.</summary>
    public CoreWebView2Frame? InputFrame { get; set; }

    public bool IsPrivate { get; init; }

    /// <summary>Original http URL while an automatic https upgrade is in flight, so a failure can offer the fallback.</summary>
    public string? PendingHttpsUpgrade { get; set; }

    public string Title
    {
        get => _title;
        set => Set(ref _title, string.IsNullOrWhiteSpace(value) ? "New tab" : value);
    }

    public string Url
    {
        get => _url;
        set => Set(ref _url, value);
    }

    public bool IsActive
    {
        get => _isActive;
        set => Set(ref _isActive, value);
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void Set<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value))
            return;
        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}
