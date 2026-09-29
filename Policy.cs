using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace JoyChromium;

/// <summary>
/// Security rules that can be tightened remotely without shipping a new build.
/// Every field is optional; a remote policy can only add restrictions on top of the embedded defaults, never remove them.
/// </summary>
public sealed record RemotePolicy
{
    public int Version { get; init; }
    public string? UpdatedAt { get; init; }
    public string? MinimumRuntimeVersion { get; init; }
    public IReadOnlyList<string> BlockedHosts { get; init; } = [];
    public IReadOnlyList<string> ExtraDangerousExtensions { get; init; } = [];
    public string? Message { get; init; }

    public static RemotePolicy Empty { get; } = new();

    public bool BlocksHost(string? host)
    {
        if (host is null)
            return false;
        foreach (var blocked in BlockedHosts)
        {
            if (host.Equals(blocked, StringComparison.OrdinalIgnoreCase) ||
                host.EndsWith("." + blocked, StringComparison.OrdinalIgnoreCase))
                return true;
        }
        return false;
    }

    /// <summary>The stricter of the embedded minimum and the remote one.</summary>
    public string EffectiveMinimumRuntime =>
        System.Version.TryParse(MinimumRuntimeVersion, out var remote) && System.Version.TryParse(SecurityPolicy.MinimumRuntimeVersion, out var local) && remote > local
            ? MinimumRuntimeVersion!
            : SecurityPolicy.MinimumRuntimeVersion;
}

/// <summary>Fetches, verifies and caches the remote policy. Verification uses the maintainer's ECDSA P-256 key embedded below.</summary>
public static class PolicyService
{
    public const string PolicyUrl = "https://raw.githubusercontent.com/lippdev/joychromium/main/policy/policy.json";
    public const string SignatureUrl = PolicyUrl + ".sig";

    // SubjectPublicKeyInfo, base64. The private key never leaves the maintainer's machine (tools/PolicySigner).
    public const string PublicKey = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE688oKNR0DZE1Nz6kr3x35Ebd+CkNp5YK/FuYO9+Q33IQE8nLC+/NRnCzQ+9rwPUuCztcReMP51ges5UUKUT1Zg==";

    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static string CachePath { get; } = Path.Combine(SettingsStore.DataFolder, "policy.json");

    public static RemotePolicy Current { get; private set; } = RemotePolicy.Empty;

    public static string Status { get; private set; } = "Not checked yet";

    /// <summary>True when <paramref name="signature"/> (base64 DER) signs <paramref name="policy"/> with the embedded key.</summary>
    public static bool Verify(byte[] policy, string signature, string publicKey = PublicKey)
    {
        try
        {
            using var key = ECDsa.Create();
            key.ImportSubjectPublicKeyInfo(Convert.FromBase64String(publicKey), out _);
            return key.VerifyData(policy, Convert.FromBase64String(signature.Trim()), HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence);
        }
        catch (Exception ex) when (ex is FormatException or CryptographicException)
        {
            return false;
        }
    }

    public static RemotePolicy? Parse(byte[] policy)
    {
        try
        {
            return JsonSerializer.Deserialize<RemotePolicy>(policy, Options);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>Loads the verified cached copy, if any. Called before the first navigation.</summary>
    public static void LoadCached()
    {
        try
        {
            if (!File.Exists(CachePath) || !File.Exists(CachePath + ".sig"))
                return;
            var bytes = File.ReadAllBytes(CachePath);
            if (Verify(bytes, File.ReadAllText(CachePath + ".sig")) && Parse(bytes) is { } policy)
            {
                Current = policy;
                Status = $"Cached policy v{policy.Version}";
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // A missing cache just means embedded defaults.
        }
    }

    /// <summary>Downloads the latest policy; keeps the current one unless the new one verifies and is not older.</summary>
    public static async Task RefreshAsync(HttpClient http)
    {
        try
        {
            var bytes = await http.GetByteArrayAsync(PolicyUrl);
            var signature = await http.GetStringAsync(SignatureUrl);
            if (!Verify(bytes, signature))
            {
                Status = "Remote policy rejected: bad signature";
                return;
            }
            if (Parse(bytes) is not { } policy)
            {
                Status = "Remote policy rejected: malformed";
                return;
            }
            if (policy.Version < Current.Version)
            {
                Status = $"Remote policy v{policy.Version} is older than cached v{Current.Version}; ignored";
                return;
            }
            Current = policy;
            Directory.CreateDirectory(SettingsStore.DataFolder);
            await File.WriteAllBytesAsync(CachePath, bytes);
            await File.WriteAllTextAsync(CachePath + ".sig", signature);
            Status = $"Policy v{policy.Version} ({policy.UpdatedAt ?? "no date"})";
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or IOException or UnauthorizedAccessException)
        {
            Status = $"Policy check failed: {ex.Message}";
        }
    }
}
