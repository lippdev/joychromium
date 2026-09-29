using Velopack;

namespace JoyChromium;

public static class Program
{
    [STAThread]
    public static void Main()
    {
        // Must run first: handles install/uninstall/update hooks and exits early when invoked by the installer.
        VelopackApp.Build().Run();
        var app = new App();
        app.InitializeComponent();
        app.Run();
    }
}
