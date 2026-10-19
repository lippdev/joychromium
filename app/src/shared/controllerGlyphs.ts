/** Which controller is connected decides which letters the hints show. */

export type ControllerFamily = "xbox" | "playstation" | "switch" | "generic";

export function controllerFamily(id: string | undefined): ControllerFamily {
  const name = (id ?? "").toLowerCase();
  if (name.includes("xbox") || name.includes("xinput")) return "xbox";
  if (name.includes("dualsense") || name.includes("dualshock") || name.includes("playstation") || name.includes("054c")) return "playstation";
  if (name.includes("switch") || name.includes("joy-con") || name.includes("pro controller") || name.includes("057e")) return "switch";
  return "generic";
}

const GLYPHS: Record<ControllerFamily, { select: string; back: string; reload: string; keyboard: string }> = {
  xbox: { select: "A", back: "B", reload: "X", keyboard: "Y" },
  playstation: { select: "✕", back: "○", reload: "□", keyboard: "△" },
  switch: { select: "A", back: "B", reload: "Y", keyboard: "X" },
  generic: { select: "A", back: "B", reload: "X", keyboard: "Y" },
};

export function buttonGlyphs(family: ControllerFamily): { select: string; back: string; reload: string; keyboard: string } {
  return GLYPHS[family];
}
