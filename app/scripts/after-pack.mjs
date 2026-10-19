// Ad-hoc code signing for macOS builds. The app is not signed with a Developer ID (see ADR-010), but Apple
// Silicon refuses to launch a completely unsigned bundle, so every mac build gets an ad-hoc signature.
// On other platforms this hook does nothing.
import { execFileSync } from "node:child_process";
import { flipFuses, FuseVersion, FuseV1Options } from "@electron/fuses";

/** @param {import("electron-builder").AfterPackContext} context */
export default async function afterPack(context) {
  await flipFuses(executablePath(context), {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });
  if (context.electronPlatformName !== "darwin") return;
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = `${context.appOutDir}/${appName}`;
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], { stdio: "inherit" });
  console.log(`Ad-hoc signed ${appName}`);
}

/** Where the packaged executable sits for each platform. */
function executablePath(context) {
  const name = context.packager.appInfo.productFilename;
  if (context.electronPlatformName === "darwin") return `${context.appOutDir}/${name}.app/Contents/MacOS/${name}`;
  if (context.electronPlatformName === "win32") return `${context.appOutDir}/${name}.exe`;
  return `${context.appOutDir}/${name.toLowerCase()}`;
}
