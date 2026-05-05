export const SHOT_COLORS: Record<string, string> = {
  Clear:   "#89c2d9",
  Drive:   "#f4a261",
  Drop:    "#a8dadc",
  Lob:     "#e9c46a",
  Net:     "#b7e4c7",
  Smash:   "#e63946",
  Unknown: "#6c757d",
};

export function shotColor(type: string): string {
  return SHOT_COLORS[type] ?? SHOT_COLORS.Unknown;
}
