import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EMPTY_POLICY, parsePolicy, POLICY_SIGNATURE_URL, POLICY_URL, type RemotePolicy, verifyPolicy } from "../shared/policy";

/** Fetches, verifies and caches the remote policy. A remote policy can only tighten the embedded defaults. */
export class PolicyService {
  current: RemotePolicy = EMPTY_POLICY;
  status = "Not checked yet";

  constructor(private readonly dataDir: string, private readonly log: (message: string) => void = () => {}) {}

  get cachePath(): string {
    return join(this.dataDir, "policy.json");
  }

  loadCached(): void {
    try {
      if (!existsSync(this.cachePath) || !existsSync(`${this.cachePath}.sig`)) return;
      const bytes = readFileSync(this.cachePath);
      const signature = readFileSync(`${this.cachePath}.sig`, "utf8");
      const policy = verifyPolicy(bytes, signature) ? parsePolicy(bytes) : undefined;
      if (policy) {
        this.current = policy;
        this.status = `Cached policy v${policy.version}`;
      }
    } catch (error) {
      this.log(`Policy cache unreadable: ${String(error)}`);
    }
  }

  async refresh(fetchImpl: typeof fetch = fetch): Promise<void> {
    try {
      const [policyResponse, signatureResponse] = await Promise.all([fetchImpl(POLICY_URL), fetchImpl(POLICY_SIGNATURE_URL)]);
      if (!policyResponse.ok || !signatureResponse.ok) {
        this.status = `Policy fetch failed: ${policyResponse.status}/${signatureResponse.status}`;
        return;
      }
      const bytes = new Uint8Array(await policyResponse.arrayBuffer());
      const signature = await signatureResponse.text();
      if (!verifyPolicy(bytes, signature)) {
        this.status = "Remote policy rejected: bad signature";
        return;
      }
      const policy = parsePolicy(bytes);
      if (!policy) {
        this.status = "Remote policy rejected: malformed";
        return;
      }
      if (policy.version < this.current.version) {
        this.status = `Remote policy v${policy.version} is older than cached v${this.current.version}; ignored`;
        return;
      }
      this.current = policy;
      mkdirSync(this.dataDir, { recursive: true });
      writeFileSync(this.cachePath, bytes);
      writeFileSync(`${this.cachePath}.sig`, signature);
      this.status = `Policy v${policy.version} (${policy.updatedAt ?? "no date"})`;
    } catch (error) {
      this.status = `Policy check failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
