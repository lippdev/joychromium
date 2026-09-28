using JoyChromium;

var source = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36";
var tvAgent = TvIdentity.Ensure(source);
if (!TvIdentity.IsActive(tvAgent) || !tvAgent.Contains("(TV; SmartTV)", StringComparison.Ordinal))
    throw new InvalidOperationException("TV marker missing from effective user-agent.");
if (TvIdentity.Ensure(tvAgent) != tvAgent)
    throw new InvalidOperationException("TV marker must be applied exactly once.");
Console.WriteLine("TV user-agent marker is present and idempotent.");
