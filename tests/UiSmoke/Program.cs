using System.Diagnostics;
using FlaUI.Core;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using FlaUI.UIA3;

// Drives the real shell through UI Automation: start, open a tab, open settings, close.
// Usage: UiSmoke <path-to-JoyChromium.exe>
// Uses a throwaway JOYCHROMIUM_DATA folder so it never touches the developer's profile.
if (args.Length != 1 || !File.Exists(args[0]))
{
    Console.Error.WriteLine("usage: UiSmoke <path-to-JoyChromium.exe>");
    return 2;
}

var data = Path.Combine(Path.GetTempPath(), "joychromium-uismoke-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(data);
File.WriteAllText(Path.Combine(data, "settings.json"), """{ "onboardingCompleted": true, "startup": "NewTab" }""");

var psi = new ProcessStartInfo(Path.GetFullPath(args[0])) { UseShellExecute = false };
psi.Environment["JOYCHROMIUM_DATA"] = data;
using var app = Application.Launch(psi);
using var automation = new UIA3Automation();
try
{
    var window = Wait(() => app.GetMainWindow(automation, TimeSpan.FromSeconds(30)), w => w is not null && w.Title.Contains("JoyChromium"), "main window")!;
    Check(Wait(() => window.FindFirstDescendant(cf => cf.ByAutomationId("AddressBox")), e => e is not null, "address box") is not null, "address box present");

    int TabCount() => window.FindAllDescendants(cf => cf.ByAutomationId("TabStrip")).FirstOrDefault()
        ?.FindAllChildren().Length ?? 0;
    Check(Wait(TabCount, n => n == 1, "first tab") == 1, "one tab after start");

    window.Focus();
    Keyboard.TypeSimultaneously(VirtualKeyShort.CONTROL, VirtualKeyShort.KEY_T);
    Check(Wait(TabCount, n => n == 2, "second tab") == 2, "Ctrl+T opens a second tab");

    // The title only changes once the new tab's engine is up; Ctrl+, before that would hit a not-yet-created CoreWebView2.
    Check(Wait(() => window.Title, t => t.StartsWith("New tab", StringComparison.Ordinal), "new tab ready", 60).StartsWith("New tab", StringComparison.Ordinal), "new tab page loaded");
    var address = window.FindFirstDescendant(cf => cf.ByAutomationId("AddressBox"))!.AsTextBox();
    Keyboard.TypeSimultaneously(VirtualKeyShort.CONTROL, VirtualKeyShort.OEM_COMMA);
    Check(Wait(() => address.Text, t => t == "joychromium://settings", "settings url") == "joychromium://settings", "Ctrl+, opens settings");
    Keyboard.TypeSimultaneously(VirtualKeyShort.CONTROL, VirtualKeyShort.KEY_W);
    Check(Wait(TabCount, n => n == 1, "tab closed") == 1, "Ctrl+W closes the tab");

    window.Close();
    Check(Wait(() => app.HasExited, x => x, "exit"), "window closes cleanly");
    Check(File.Exists(Path.Combine(data, "session.json")), "session saved on close");
    Console.WriteLine("UI smoke passed.");
    return 0;
}
catch (Exception ex)
{
    Console.Error.WriteLine(ex);
    var log = Directory.Exists(Path.Combine(data, "logs")) ? Directory.GetFiles(Path.Combine(data, "logs")).FirstOrDefault() : null;
    if (log is not null)
        Console.Error.WriteLine(File.ReadAllText(log));
    return 1;
}
finally
{
    if (!app.HasExited)
        app.Kill();
    try { Directory.Delete(data, recursive: true); } catch (IOException) { }
}

static T Wait<T>(Func<T> probe, Func<T, bool> ok, string what, int seconds = 20)
{
    var deadline = DateTime.UtcNow.AddSeconds(seconds);
    T last = default!;
    while (DateTime.UtcNow < deadline)
    {
        try
        {
            last = probe();
            if (ok(last))
                return last;
        }
        catch (Exception) when (DateTime.UtcNow < deadline)
        {
        }
        Thread.Sleep(250);
    }
    throw new TimeoutException($"Timed out waiting for {what} (last: {last})");
}

static void Check(bool condition, string what)
{
    if (!condition)
        throw new InvalidOperationException("FAILED: " + what);
    Console.WriteLine("ok: " + what);
}
