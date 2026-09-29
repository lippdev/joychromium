using System.Windows;
using System.Windows.Media;

namespace JoyChromium;

/// <summary>Pushes a <see cref="Theme"/> into the application brushes that the XAML binds with DynamicResource.</summary>
public static class ThemeService
{
    public static Theme Current { get; private set; } = Theme.Default;

    public static void Apply(Theme theme)
    {
        Current = theme;
        var resources = Application.Current.Resources;
        Set(resources, "BackgroundBrush", theme.Background);
        Set(resources, "SurfaceBrush", theme.Surface);
        Set(resources, "Surface2Brush", theme.Surface2);
        Set(resources, "HoverBrush", theme.Hover);
        Set(resources, "BorderBrush", theme.Border);
        Set(resources, "InputBrush", theme.Input);
        Set(resources, "TextBrush", theme.Text);
        Set(resources, "TextMutedBrush", theme.TextMuted);
        Set(resources, "TextFaintBrush", theme.TextFaint);
        Set(resources, "AccentBrush", theme.Accent);
        Set(resources, "AccentTextBrush", theme.AccentText);
        Set(resources, "AccentDimBrush", theme.AccentDim);
        Set(resources, "AccentBgBrush", theme.AccentBg);
        Set(resources, "AccentBorderBrush", theme.AccentBorder);
        Set(resources, "KeyboardBgBrush", theme.KeyboardBg);
    }

    private static void Set(ResourceDictionary resources, string key, string hex)
    {
        var brush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
        brush.Freeze();
        resources[key] = brush;
    }
}
