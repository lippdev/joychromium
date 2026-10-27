// Ad-hoc code signing for macOS builds. The app is not signed with a Developer ID (see ADR-010), but Apple
// Silicon refuses to launch a completely unsigned bundle, so every mac build gets an ad-hoc signature.
// On other platforms this hook does nothing.
import { execFileSync } from "node:child_process";
import { flipFuses, FuseVersion, FuseV1Options } from "@electron/fuses";
import { evsPlan, vmpCommand } from "./evs.mjs";

/** @param {import("electron-builder").AfterPackContext} context */
export default async function afterPack(context) {
  // The free EVS signs only this exact fuse wire (castLabs FAQ, "Can I use @electron/fuses"); any other set, including
  // a subset, is refused with "Binary signature denied". Fuses outside it stay at their defaults.
  await flipFuses(executablePath(context), {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: true,
  });
  vmpSign(context);
  if (context.electronPlatformName !== "darwin") return;
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = `${context.appOutDir}/${appName}`;
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], { stdio: "inherit" });
  console.log(`Ad-hoc signed ${appName}`);
}

/**
 * Sign the CDM through castLabs EVS, when this platform needs it and an account is present. A refusal from EVS does not
 * stop the build: the app ships with an unverifiable CDM, as it does without an account, so DRM services decline to
 * play while everything else works. The log says so, and the docs do not promise paid streaming until it is signed.
 * @param {import("electron-builder").AfterPackContext} context
 */
function vmpSign(context) {
  const { electronPlatformName, appOutDir } = context;
  const plan = evsPlan(electronPlatformName, process.env);
  if (!plan.sign) {
    console.log(`VMP signing skipped: ${plan.reason}`);
    return;
  }
  const { command, args } = vmpCommand(electronPlatformName, appOutDir);
  try {
    execFileSync(command, args, { stdio: "inherit" });
    console.log(`VMP signed ${appOutDir} with the EVS account ${plan.account}`);
  } catch (error) {
    console.log(`::warning::VMP signing refused for the EVS account ${plan.account}; this build ships an unsigned CDM (${error.message})`);
  }
}

/** Where the packaged executable sits for each platform. */
function executablePath(context) {
  const name = context.packager.appInfo.productFilename;
  if (context.electronPlatformName === "darwin") return `${context.appOutDir}/${name}.app/Contents/MacOS/${name}`;
  if (context.electronPlatformName === "win32") return `${context.appOutDir}/${name}.exe`;
  return `${context.appOutDir}/${name.toLowerCase()}`;
}
