namespace JoyChromium;

/// <summary>One row in the address bar dropdown.</summary>
public sealed record Suggestion(string Title, string Url, string Kind)
{
    /// <summary>Favorites first, then history; one row per URL; empty query yields nothing.</summary>
    public static IReadOnlyList<Suggestion> Build(string query, IEnumerable<Shortcut> favorites, IEnumerable<HistoryEntry> history, int limit = 6)
    {
        var q = query.Trim();
        if (q.Length == 0 || Pages.Resolve(q) != q)
            return [];
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var result = new List<Suggestion>();
        foreach (var f in favorites.Where(f => Matches(q, f.Name, f.Url)))
            if (seen.Add(f.Url))
                result.Add(new Suggestion("★ " + f.Name, f.Url, "favorite"));
        foreach (var h in history.Where(h => Matches(q, h.Title, h.Url)))
            if (seen.Add(h.Url))
                result.Add(new Suggestion(h.Title, h.Url, "history"));
        return result.Take(limit).ToList();
    }

    private static bool Matches(string q, string title, string url) =>
        title.Contains(q, StringComparison.OrdinalIgnoreCase) || url.Contains(q, StringComparison.OrdinalIgnoreCase);
}
