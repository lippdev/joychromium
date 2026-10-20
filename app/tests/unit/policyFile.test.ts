import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePolicy, verifyPolicy } from "../../src/shared/policy";

// The policy the app ships has to carry a signature from the key it trusts, or the app silently ignores it: a policy
// edited without `scripts/policy-sign.mjs sign` looks fine in review and does nothing at runtime.
const policyPath = fileURLToPath(new URL("../../../policy/policy.json", import.meta.url));
const signaturePath = fileURLToPath(new URL("../../../policy/policy.json.sig", import.meta.url));

describe("shipped policy", () => {
  const bytes = readFileSync(policyPath);
  const signature = readFileSync(signaturePath, "utf8").trim();

  it("is signed by the key the app trusts", () => {
    expect(verifyPolicy(bytes, signature)).toBe(true);
  });

  it("reads the field name the published policy uses", () => {
    // The file ships `minimumRuntimeVersion`; before the parser accepted it, that rule was silently dropped.
    expect(JSON.parse(bytes.toString("utf8"))).toHaveProperty("minimumRuntimeVersion");
    expect(parsePolicy(bytes)?.minimumChromiumVersion).toBe(JSON.parse(bytes.toString("utf8")).minimumRuntimeVersion);
  });

  it("parses into a policy the app can apply", () => {
    const policy = parsePolicy(bytes);
    expect(policy.version).toBeGreaterThanOrEqual(1);
    expect(policy.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The published file calls it `minimumRuntimeVersion`; the parser has to read that name or the rule is ignored.
    expect(policy.minimumChromiumVersion).toMatch(/^\d+(\.\d+){1,3}$/);
    expect(Array.isArray(policy.blockedHosts)).toBe(true);
  });
});
