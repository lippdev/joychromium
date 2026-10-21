/** Which controller is connected decides which letters the hints show. */

export type ControllerFamily = "xbox" | "playstation" | "switch" | "generic";

export function controllerFamily(id: string | undefined): ControllerFamily {
  const name = (id ?? "").toLowerCase();
  if (name.includes("xbox") || name.includes("xinput")) return "xbox";
  if (name.includes("dualsense") || name.includes("dualshock") || name.includes("playstation") || name.includes("054c")) return "playstation";
  if (name.includes("switch") || name.includes("joy-con") || name.includes("pro controller") || name.includes("057e")) return "switch";
  return "generic";
}

export interface ControllerGlyphs {
  select: string;
  back: string;
  reload: string;
  keyboard: string;
  /** Clicking the right stick: the only way into Cursor mode, where the same stick moves a pointer. */
  stick: string;
  /** The controller keyboard's shortcuts, as on Xbox: the left trigger shifts, the menu button confirms, the left stick's click changes the key layer. */
  shift: string;
  menu: string;
  layer: string;
}

const GLYPHS: Record<ControllerFamily, ControllerGlyphs> = {
  xbox: { select: "A", back: "B", reload: "X", keyboard: "Y", stick: "R3", shift: "LT", menu: "≡", layer: "LS" },
  playstation: { select: "✕", back: "○", reload: "□", keyboard: "△", stick: "R3", shift: "L2", menu: "≡", layer: "L3" },
  switch: { select: "A", back: "B", reload: "Y", keyboard: "X", stick: "R3", shift: "ZL", menu: "+", layer: "LS" },
  generic: { select: "A", back: "B", reload: "X", keyboard: "Y", stick: "R3", shift: "LT", menu: "≡", layer: "LS" },
};

export function buttonGlyphs(family: ControllerFamily): ControllerGlyphs {
  return GLYPHS[family];
}
