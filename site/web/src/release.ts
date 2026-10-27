/** The public build the page offers. A new release changes these lines only. */
export const VERSION = "0.1.0-alpha";
export const SHORT = "0.1";
export const REPO = "https://github.com/lippdev/joychromium";
export const RELEASE = `${REPO}/releases/tag/v${VERSION}`;
const file = (suffix: string) => `${REPO}/releases/download/v${VERSION}/JoyChromium-${VERSION}-${suffix}.exe`;

export const DOWNLOADS = [
  { id: "x64", name: "Windows x64", note: "PCs com Intel ou AMD", href: file("win-x64") },
  { id: "arm64", name: "Windows ARM", note: "PCs com Snapdragon", href: file("win-arm64") },
  { id: "any", name: "Instalador único", note: "Serve nos dois; escolhe sozinho", href: file("win") },
];
