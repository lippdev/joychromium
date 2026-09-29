using System.IO;
using System.Text.Json;

namespace JoyChromium;

public sealed record HistoryEntry(DateTime VisitedUtc, string Url, string Title);

/// <summary>
/// Append-only visit log (history.jsonl) with an in-memory index for suggestions.
/// Private tabs and internal pages are never recorded. The file is compacted when it grows past <see cref="MaxEntries"/>.
/// </summary>
public sealed class History
{
    public const int MaxEntries = 5000;
    private static readonly JsonSerializerOptions Options = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, PropertyNameCaseInsensitive = true };

    private readonly string _path;
    private readonly List<HistoryEntry> _entries = [];
    private readonly object _gate = new();

    public History(string path)
    {
        _path = path;
        Load();
    }

    public static History Default { get; } = new(Path.Combine(SettingsStore.DataFolder, "history.jsonl"));

    public int Count { get { lock (_gate) return _entries.Count; } }

    /// <summary>Whether a URL should be recorded at all.</summary>
    public static bool IsRecordable(string? url) => Pages.IsWebUrl(url) && !Pages.IsInternal(url!);

    public void Record(string url, string title, DateTime nowUtc)
    {
        if (!IsRecordable(url))
            return;
        var entry = new HistoryEntry(nowUtc, url, string.IsNullOrWhiteSpace(title) ? url : title.Trim());
        lock (_gate)
        {
            // Collapse reloads and title updates of the page just visited into one row.
            if (_entries.Count > 0 && _entries[^1].Url == url)
                _entries[^1] = entry;
            else
                _entries.Add(entry);
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
                if (_entries.Count > MaxEntries)
                {
                    _entries.RemoveRange(0, _entries.Count - MaxEntries);
                    Rewrite();
                }
                else
                {
                    File.AppendAllText(_path, JsonSerializer.Serialize(entry, Options) + Environment.NewLine);
                }
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                Log.Warn($"History write failed: {ex.Message}");
            }
        }
    }

    /// <summary>Most recent first, one row per URL.</summary>
    public IReadOnlyList<HistoryEntry> Recent(int limit = 200)
    {
        lock (_gate)
            return Distinct(Enumerable.Reverse(_entries)).Take(limit).ToList();
    }

    /// <summary>Case-insensitive match on URL or title, most recent first, one row per URL.</summary>
    public IReadOnlyList<HistoryEntry> Search(string query, int limit = 50)
    {
        var q = query.Trim();
        lock (_gate)
        {
            var source = Enumerable.Reverse(_entries);
            if (q.Length > 0)
                source = source.Where(e => e.Url.Contains(q, StringComparison.OrdinalIgnoreCase) || e.Title.Contains(q, StringComparison.OrdinalIgnoreCase));
            return Distinct(source).Take(limit).ToList();
        }
    }

    public void Remove(string url)
    {
        lock (_gate)
        {
            if (_entries.RemoveAll(e => e.Url == url) > 0)
                Rewrite();
        }
    }

    public void Clear()
    {
        lock (_gate)
        {
            _entries.Clear();
            Rewrite();
        }
    }

    private static IEnumerable<HistoryEntry> Distinct(IEnumerable<HistoryEntry> source)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var entry in source)
            if (seen.Add(entry.Url))
                yield return entry;
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path))
                return;
            foreach (var line in File.ReadLines(_path))
            {
                if (line.Length == 0)
                    continue;
                try
                {
                    if (JsonSerializer.Deserialize<HistoryEntry>(line, Options) is not { } entry || !IsRecordable(entry.Url))
                        continue;
                    // Record() appends title updates of the same page as new lines; collapse them like it does in memory.
                    if (_entries.Count > 0 && _entries[^1].Url == entry.Url)
                        _entries[^1] = entry;
                    else
                        _entries.Add(entry);
                }
                catch (JsonException)
                {
                    // A torn last line after a crash is dropped.
                }
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            Log.Warn($"History load failed: {ex.Message}");
        }
    }

    private void Rewrite()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            File.WriteAllLines(_path, _entries.Select(e => JsonSerializer.Serialize(e, Options)));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            Log.Warn($"History rewrite failed: {ex.Message}");
        }
    }
}
