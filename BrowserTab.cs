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
    private bool _isPlayingAudio;
    private bool _isMuted;

    public bool IsPlayingAudio
    {
        get => _isPlayingAudio;
        set => Set(ref _isPlayingAudio, value);
    }

    public bool IsMuted
    {
        get => _isMuted;
        set => Set(ref _isMuted, value);
    }
    private System.Windows.Media.ImageSource? _favicon;

    public System.Windows.Media.ImageSource? Favicon
    {
        get => _favicon;
        set => Set(ref _favicon, value);
    }

    public BrowserTab(WebView2CompositionControl view) => View = view;

    public WebView2CompositionControl View { get; }

    /// <summary>Frame that owns the focused text field, when the page keyboard was opened from an iframe.</summary>
    public CoreWebView2Frame? InputFrame { get; set; }

    public bool IsPrivate { get; init; }

    /// <summary>Last time this tab was the active one; drives tab sleeping.</summary>
    public DateTime LastActiveUtc { get; set; } = DateTime.UtcNow;

    /// <summary>URL requested before CoreWebView2 existed; applied once initialization completes.</summary>
    public string? PendingNavigation { get; set; }

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
