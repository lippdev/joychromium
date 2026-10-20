// Widevine VMP signing, the step that makes the CDM verifiable in production on Windows and macOS (ADR-009).
// The service is castLabs EVS and it is free; what it needs is an account, and the account is what decides whether a
// build can be signed. That decision is pure, so it lives here with a unit test, and `after-pack.mjs` only executes it.
//
// Signing order matters and is not symmetric (docs/DRM-EVS.md): on macOS the VMP signature goes on BEFORE the bundle is
// code-signed, on Windows AFTER. `after-pack.mjs` runs before electron-builder signs anything, which is the right place
// for macOS; Windows builds here are not code-signed at all (ADR-010), so it is the right place there too.

/** The environment variables the EVS client reads on its own; nothing is written to disk. */
export const EVS_ACCOUNT_VAR = "EVS_ACCOUNT_NAME";
export const EVS_PASSWD_VAR = "EVS_PASSWD";

/**
 * The account from the environment, or null when either half is missing. An empty workflow secret arrives as an empty
 * string, so blank counts as absent.
 * @param {Record<string, string | undefined>} env
 */
export function evsCredentials(env) {
  const account = (env[EVS_ACCOUNT_VAR] ?? "").trim();
  const passwd = (env[EVS_PASSWD_VAR] ?? "").trim();
  if (!account || !passwd) return null;
  return { account, passwd };
}

/**
 * Whether this build signs its CDM, and why not when it does not.
 * @param {string} platformName electron-builder's platform name
 * @param {Record<string, string | undefined>} env
 */
export function evsPlan(platformName, env) {
  if (platformName !== "darwin" && platformName !== "win32") {
    return { sign: false, reason: "the Linux CDM does not use a VMP signature" };
  }
  const credentials = evsCredentials(env);
  if (!credentials) {
    return {
      sign: false,
      reason:
        `no ${EVS_ACCOUNT_VAR}/${EVS_PASSWD_VAR}, so this build ships a CDM that streaming services will not ` +
        "verify; see docs/DRM-EVS.md for the account and the secrets",
    };
  }
  return { sign: true, account: credentials.account };
}

/** The interpreter that has the EVS client installed: Windows runners ship `python`, the others `python3`. */
export function evsPython(platformName) {
  return platformName === "win32" ? "python" : "python3";
}

/**
 * The exact call that signs a package: `-n` keeps the client from asking anything, and `sign-pkg` walks the directory
 * so the helper process and the app bundle both get covered. The account and the password reach it through the
 * environment, never through the command line, where they would land in the build log.
 * @param {string} platformName
 * @param {string} appOutDir
 */
export function vmpCommand(platformName, appOutDir) {
  return {
    command: evsPython(platformName),
    args: ["-m", "castlabs_evs.vmp", "-n", "sign-pkg", appOutDir],
  };
}
