using JoyChromium;
using Xunit;

namespace JoyChromium.Tests;

public class SecurityPolicyTests
{
    [Theory]
    [InlineData("https://x.example", true)]
    [InlineData("http://x.example", true)]
    [InlineData("about:blank", true)]
    [InlineData("file:///C:/x", false)]
    [InlineData("javascript:alert(1)", false)]
    [InlineData("edge://settings", false)]
    [InlineData(null, false)]
    public void IsNavigationAllowed_allow_lists_web_schemes(string? url, bool expected) =>
        Assert.Equal(expected, SecurityPolicy.IsNavigationAllowed(url));

    [Fact]
    public void UpgradeToHttps_rewrites_only_plain_http()
    {
        Assert.Equal("https://x.example/a?b=1", SecurityPolicy.UpgradeToHttps("http://x.example:80/a?b=1"));
        Assert.Null(SecurityPolicy.UpgradeToHttps("https://x.example"));
    }

    [Theory]
    [InlineData("setup.EXE", true)]
    [InlineData("photo.jpg", false)]
    [InlineData("script.ps1", true)]
    public void IsDangerousDownload_matches_extensions(string name, bool expected) =>
        Assert.Equal(expected, SecurityPolicy.IsDangerousDownload(name));

    [Fact]
    public void SafeFileName_strips_paths() => Assert.Equal("evil.txt", SecurityPolicy.SafeFileName("../../evil.txt"));

    [Theory]
    [InlineData("154.0.4258.37", true)]
    [InlineData("99.0.1.1", false)]
    [InlineData(null, false)]
    public void RuntimeIsSupported_compares_versions(string? version, bool expected) =>
        Assert.Equal(expected, SecurityPolicy.RuntimeIsSupported(version));

    [Fact]
    public void BrowserArguments_enable_doh_only_when_chosen()
    {
        Assert.Equal("", SecurityPolicy.BrowserArguments(DohProvider.Off));
        Assert.Contains("dns.quad9.net", SecurityPolicy.BrowserArguments(DohProvider.Quad9), StringComparison.Ordinal);
    }

    [Fact]
    public void AllowPopup_limits_bursts()
    {
        var recent = new List<DateTime>();
        var t0 = DateTime.UtcNow;
        Assert.True(SecurityPolicy.AllowPopup(recent, t0));
        Assert.True(SecurityPolicy.AllowPopup(recent, t0));
        Assert.True(SecurityPolicy.AllowPopup(recent, t0));
        Assert.False(SecurityPolicy.AllowPopup(recent, t0));
        Assert.True(SecurityPolicy.AllowPopup(recent, t0.AddSeconds(2)));
    }
}

public class RemotePolicyTests
{
    private static byte[] ShippedPolicy => File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "policy.json"));
    private static string ShippedSignature => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "policy.json.sig"));

    [Fact]
    public void Shipped_policy_verifies_with_embedded_key() => Assert.True(PolicyService.Verify(ShippedPolicy, ShippedSignature));

    [Fact]
    public void Tampered_signature_or_bytes_are_rejected()
    {
        Assert.False(PolicyService.Verify(ShippedPolicy, ShippedSignature[..^4] + "AAAA"));
        Assert.False(PolicyService.Verify([.. ShippedPolicy, 0x20], ShippedSignature));
    }

    [Fact]
    public void Shipped_policy_matches_embedded_defaults()
    {
        var shipped = PolicyService.Parse(ShippedPolicy);
        Assert.NotNull(shipped);
        Assert.True(shipped.Version >= 1);
        Assert.Equal(SecurityPolicy.MinimumRuntimeVersion, shipped.EffectiveMinimumRuntime);
    }

    [Fact]
    public void Remote_policy_can_only_tighten()
    {
        var strict = new RemotePolicy { MinimumRuntimeVersion = "999.0.0.0", BlockedHosts = ["evil.example"] };
        Assert.Equal("999.0.0.0", strict.EffectiveMinimumRuntime);
        Assert.True(strict.BlocksHost("cdn.evil.example"));
        Assert.False(strict.BlocksHost("notevil.example"));
        Assert.Equal(SecurityPolicy.MinimumRuntimeVersion, new RemotePolicy { MinimumRuntimeVersion = "1.0.0.0" }.EffectiveMinimumRuntime);
    }
}
