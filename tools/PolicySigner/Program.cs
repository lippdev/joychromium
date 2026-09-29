using System.Security.Cryptography;

// Signs policy/policy.json with the maintainer's ECDSA P-256 key so the app can trust remote policy updates.
//   PolicySigner keygen <keyfile>            creates a key (PKCS#8, base64) and prints the public key to embed
//   PolicySigner sign <keyfile> <policy.json> writes <policy.json>.sig (base64 DER signature over the exact bytes)
//   PolicySigner verify <pubkey-base64> <policy.json>
if (args.Length < 2)
{
    Console.Error.WriteLine("usage: keygen <keyfile> | sign <keyfile> <policy.json> | verify <pubkey> <policy.json>");
    return 2;
}

switch (args[0])
{
    case "keygen":
    {
        if (File.Exists(args[1]))
        {
            Console.Error.WriteLine($"{args[1]} already exists; refusing to overwrite a signing key.");
            return 1;
        }
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(args[1]))!);
        File.WriteAllText(args[1], Convert.ToBase64String(key.ExportPkcs8PrivateKey()));
        Console.WriteLine(Convert.ToBase64String(key.ExportSubjectPublicKeyInfo()));
        return 0;
    }
    case "sign" when args.Length == 3:
    {
        using var key = ECDsa.Create();
        key.ImportPkcs8PrivateKey(Convert.FromBase64String(File.ReadAllText(args[1]).Trim()), out _);
        var signature = key.SignData(File.ReadAllBytes(args[2]), HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence);
        File.WriteAllText(args[2] + ".sig", Convert.ToBase64String(signature));
        Console.WriteLine($"wrote {args[2]}.sig");
        return 0;
    }
    case "verify" when args.Length == 3:
    {
        using var key = ECDsa.Create();
        key.ImportSubjectPublicKeyInfo(Convert.FromBase64String(args[1]), out _);
        var ok = key.VerifyData(File.ReadAllBytes(args[2]), Convert.FromBase64String(File.ReadAllText(args[2] + ".sig").Trim()),
            HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence);
        Console.WriteLine(ok ? "valid" : "INVALID");
        return ok ? 0 : 1;
    }
    default:
        Console.Error.WriteLine("unknown command");
        return 2;
}
