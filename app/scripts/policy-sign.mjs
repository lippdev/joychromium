#!/usr/bin/env node
// Signs policy/policy.json with the maintainer's ECDSA P-256 key so the app can trust remote policy updates.
//   node scripts/policy-sign.mjs keygen <keyfile>          creates a key (PKCS#8, base64) and prints the public key to embed
//   node scripts/policy-sign.mjs sign <keyfile> <policy>   writes <policy>.sig (base64 DER signature over the exact bytes)
//   node scripts/policy-sign.mjs verify <pubkey> <policy>
// Same format the C# PolicySigner produced, so existing keys and signatures keep working.
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const [command, a, b] = process.argv.slice(2);

function fail(message) {
  console.error(message);
  process.exit(2);
}

switch (command) {
  case "keygen": {
    if (!a) fail("usage: keygen <keyfile>");
    if (existsSync(a)) fail(`${a} already exists; refusing to overwrite a signing key.`);
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    mkdirSync(dirname(a), { recursive: true });
    writeFileSync(a, privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"));
    console.log(publicKey.export({ type: "spki", format: "der" }).toString("base64"));
    break;
  }
  case "sign": {
    if (!a || !b) fail("usage: sign <keyfile> <policy.json>");
    const key = createPrivateKey({ key: Buffer.from(readFileSync(a, "utf8").trim(), "base64"), format: "der", type: "pkcs8" });
    const signature = sign("sha256", readFileSync(b), { key, dsaEncoding: "der" });
    writeFileSync(`${b}.sig`, signature.toString("base64"));
    console.log(`wrote ${b}.sig`);
    break;
  }
  case "verify": {
    if (!a || !b) fail("usage: verify <pubkey-base64> <policy.json>");
    const key = createPublicKey({ key: Buffer.from(a, "base64"), format: "der", type: "spki" });
    const ok = verify("sha256", readFileSync(b), { key, dsaEncoding: "der" }, Buffer.from(readFileSync(`${b}.sig`, "utf8").trim(), "base64"));
    console.log(ok ? "valid" : "INVALID");
    process.exit(ok ? 0 : 1);
    break;
  }
  default:
    fail("usage: keygen <keyfile> | sign <keyfile> <policy.json> | verify <pubkey> <policy.json>");
}
