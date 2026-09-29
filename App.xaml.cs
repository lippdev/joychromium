using System.Windows;
using System.Windows.Threading;

namespace JoyChromium;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        Log.Rotate(DateTime.UtcNow);
        Log.Info($"JoyChromium {AppUpdater.Version} starting");
        DispatcherUnhandledException += OnDispatcherUnhandledException;
        AppDomain.CurrentDomain.UnhandledException += (_, args) => Log.Error("Unhandled exception", args.ExceptionObject as Exception);
        TaskScheduler.UnobservedTaskException += (_, args) =>
        {
            Log.Error("Unobserved task exception", args.Exception);
            args.SetObserved();
        };
    }

    private static void OnDispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        Log.Error("Dispatcher exception", e.Exception);
        // Keep the shell alive for anything that is not a crash of our own state machine.
        e.Handled = e.Exception is not (OutOfMemoryException or StackOverflowException or AccessViolationException);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        Log.Info("JoyChromium exiting");
        base.OnExit(e);
    }
}
