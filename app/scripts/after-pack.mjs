// Ad-hoc code signing for macOS builds. The app is not signed with a Developer ID (see ADR-010), but Apple
// Silicon refuses to launch a completely unsigned bundle, so every mac build gets an ad-hoc signature.
// On other platforms this hook does nothing.
import { execFileSync } from "node:child_process";

/** @param {import("electron-builder").AfterPackContext} context */
export default async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = `${context.appOutDir}/${appName}`;
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], { stdio: "inherit" });
  console.log(`Ad-hoc signed ${appName}`);
}
