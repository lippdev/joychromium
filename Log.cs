using System.IO;
using System.IO.Compression;
using System.Text;

namespace JoyChromium;

/// <summary>Append-only daily log files in %LocalAppData%\JoyChromium\logs, kept for a week. Never throws.</summary>
public static class Log
{
    private const int KeepDays = 7;
    private static readonly object Gate = new();

    public static string Folder { get; } = Path.Combine(SettingsStore.DataFolder, "logs");

    public static string CurrentFile => Path.Combine(Folder, $"app-{DateTime.UtcNow:yyyyMMdd}.log");

    public static void Info(string message) => Write("INFO", message);
    public static void Warn(string message) => Write("WARN", message);
    public static void Error(string message, Exception? ex = null) => Write("ERROR", ex is null ? message : $"{message}: {ex}");

    private static void Write(string level, string message)
    {
        try
        {
            lock (Gate)
            {
                Directory.CreateDirectory(Folder);
                File.AppendAllText(CurrentFile, $"{DateTime.UtcNow:O} [{level}] {message}{Environment.NewLine}", Encoding.UTF8);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Logging must never take the app down.
        }
    }

    /// <summary>Deletes log files older than a week.</summary>
    public static void Rotate(DateTime nowUtc)
    {
        try
        {
            if (!Directory.Exists(Folder))
                return;
            foreach (var file in Directory.GetFiles(Folder, "app-*.log"))
            {
                if (nowUtc - File.GetLastWriteTimeUtc(file) > TimeSpan.FromDays(KeepDays))
                    File.Delete(file);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
        }
    }

    /// <summary>Zips logs plus settings (site permissions stripped) for a bug report. Returns the zip path.</summary>
    public static string ExportDiagnostics(string targetFolder, IEnumerable<string> environmentLines)
    {
        Directory.CreateDirectory(targetFolder);
        var zipPath = Path.Combine(targetFolder, $"joychromium-diagnostics-{DateTime.UtcNow:yyyyMMdd-HHmmss}.zip");
        using var zip = ZipFile.Open(zipPath, ZipArchiveMode.Create);
        if (Directory.Exists(Folder))
        {
            foreach (var file in Directory.GetFiles(Folder, "app-*.log"))
                zip.CreateEntryFromFile(file, "logs/" + Path.GetFileName(file));
        }
        var settings = SettingsStore.Current with { SitePermissions = new Dictionary<string, IReadOnlyDictionary<string, bool>>() };
        var entry = zip.CreateEntry("settings.json");
        using (var writer = new StreamWriter(entry.Open()))
            writer.Write(SettingsStore.Serialize(settings));
        var info = zip.CreateEntry("environment.txt");
        using (var writer = new StreamWriter(info.Open()))
        {
            writer.WriteLine($"OS {Environment.OSVersion} x64={Environment.Is64BitOperatingSystem}");
            writer.WriteLine($".NET {Environment.Version}");
            foreach (var line in environmentLines)
                writer.WriteLine(line);
        }
        return zipPath;
    }
}
