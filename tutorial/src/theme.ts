// One palette and one type scale for every Tracekit visual:
// the tutorial video, the README PNGs and the README SVGs.

export const palette = {
  bg: "#0B0F14",
  panel: "#121923",
  panelHi: "#18222F",
  line: "#243345",
  text: "#E6EDF3",
  muted: "#8B9BB0",
  accent: "#3DDC97", // inferred / generated
  blue: "#5AA9FF", // requests
  amber: "#F5B94A", // parameters, templating
  red: "#FF6B6B", // secrets, redaction
} as const;

// Type scale (px at 1920x1080). SVGs use the same steps scaled to their viewBox.
export const type = {
  xs: 18,
  sm: 24,
  md: 32,
  lg: 44,
  xl: 64,
  display: 104,
} as const;

// Video and PNGs load these through @remotion/google-fonts.
export const fonts = {
  sans: "Inter",
  mono: "JetBrains Mono",
} as const;

// SVGs are rendered by GitHub without web fonts, so they use system stacks.
export const svgFonts = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif",
  mono: "ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, monospace",
} as const;
