namespace JoyChromium;

public static class TvIdentity
{
    public const string Marker = "JoyChromiumTV/0.1 (TV; SmartTV)";

    public static string Ensure(string userAgent)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(userAgent);
        if (userAgent.Contains(Marker, StringComparison.OrdinalIgnoreCase))
            return userAgent;
        if (userAgent.Contains("JoyChromiumTV/", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("A malformed JoyChromium TV marker is already present.");
        return $"{userAgent} {Marker}";
    }

    public static bool IsActive(string userAgent) =>
        userAgent.Contains(Marker, StringComparison.OrdinalIgnoreCase);
}
