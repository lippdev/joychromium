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

/// <summary>The on-screen controller keyboard and the page focus bridge.</summary>
public partial class MainWindow
{

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
}
