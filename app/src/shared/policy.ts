import { createPublicKey, verify } from "node:crypto";
import { versionAtLeast } from "./security";

/**
 * Security rules that can be tightened remotely without shipping a new build.
 * Every field is optional; a remote policy can only add restrictions on top of the embedded defaults.
 */
export interface RemotePolicy {
  version: number;
  updatedAt?: string;
  /** Oldest Chromium the shell should run on; the app warns (and, when installed, updates) below it. */
  minimumChromiumVersion?: string;
  blockedHosts: string[];
  extraDangerousExtensions: string[];
  /** App versions known to be broken; the updater skips them. */
  blockedAppVersions: string[];
  message?: string;
}

export const EMPTY_POLICY: RemotePolicy = { version: 0, blockedHosts: [], extraDangerousExtensions: [], blockedAppVersions: [] };

// SubjectPublicKeyInfo, base64. Same key the C# shell used; the private key lives only on the maintainer's machine.
export const POLICY_PUBLIC_KEY =
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE688oKNR0DZE1Nz6kr3x35Ebd+CkNp5YK/FuYO9+Q33IQE8nLC+/NRnCzQ+9rwPUuCztcReMP51ges5UUKUT1Zg==";

export const POLICY_URL = "https://raw.githubusercontent.com/lippdev/joychromium/main/policy/policy.json";
export const POLICY_SIGNATURE_URL = `${POLICY_URL}.sig`;

/** True when `signatureBase64` (DER ECDSA-SHA256) signs `policyBytes` with the embedded key. */
export function verifyPolicy(policyBytes: Uint8Array, signatureBase64: string, publicKeyBase64 = POLICY_PUBLIC_KEY): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(publicKeyBase64, "base64"), format: "der", type: "spki" });
    return verify("sha256", policyBytes, { key, dsaEncoding: "der" }, Buffer.from(signatureBase64.trim(), "base64"));
  } catch {
    return false;
  }
}

export function parsePolicy(policyBytes: Uint8Array): RemotePolicy | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(policyBytes).toString("utf8"));
  } catch {
    return undefined;
  }
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []);
  return {
    version: typeof r.version === "number" && Number.isFinite(r.version) ? r.version : 0,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : undefined,
    minimumChromiumVersion: typeof r.minimumChromiumVersion === "string" ? r.minimumChromiumVersion : undefined,
    blockedHosts: strings(r.blockedHosts).map((h) => h.toLowerCase()),
    extraDangerousExtensions: strings(r.extraDangerousExtensions),
    blockedAppVersions: strings(r.blockedAppVersions),
    message: typeof r.message === "string" && r.message.trim() ? r.message : undefined,
  };
}

export function policyBlocksHost(policy: RemotePolicy, host: string | undefined): boolean {
  if (!host) return false;
  return policy.blockedHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

/** The stricter of the embedded minimum and the remote one. */
export function effectiveMinimumChromium(policy: RemotePolicy, embeddedMinimum: string): string {
  const remote = policy.minimumChromiumVersion;
  return remote && versionAtLeast(remote, embeddedMinimum) && remote !== embeddedMinimum ? remote : embeddedMinimum;
}
