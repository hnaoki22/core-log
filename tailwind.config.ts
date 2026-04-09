import type { Config } from "tailwindcss";

// HM brand palette: burgundy primary + navy dark + gold accent.
// Cool-tone Tailwind families (indigo/violet/purple/fuchsia/pink/rose) are aliased
// to the burgundy palette. Blue/sky/cyan are aliased to navy. This way the existing
// utility classes across the app render in the HM corporate color scheme without
// touching every component file.
const burgundy = {
  50: "#FBF2F4",
  100: "#F5E3E7",
  200: "#EBC0C9",
  300: "#DB8A9B",
  400: "#C45468",
  500: "#A8324A",
  600: "#8B1A2B",
  700: "#6F1221",
  800: "#540D18",
  900: "#3A0910",
  950: "#1F0507",
};

const navy = {
  50: "#F2F2F7",
  100: "#E0E0EA",
  200: "#B9B9CC",
  300: "#8585A3",
  400: "#4D4D6D",
  500: "#2C2C4A",
  600: "#1A1A2E",
  700: "#141423",
  800: "#0E0E1A",
  900: "#080810",
  950: "#040408",
};

const gold = {
  50: "#FBF5E9",
  100: "#F5E5BF",
  200: "#EBCB80",
  300: "#DDA845",
  400: "#C17817",
  500: "#A66214",
  600: "#884F0F",
  700: "#6A3D0B",
  800: "#4C2B07",
  900: "#2E1A04",
  950: "#1A0E02",
};

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        burgundy,
        navy,
        gold,
        // Primary = navy (trust, intelligence). Cool-tone & blue families → navy.
        indigo: navy,
        violet: navy,
        purple: navy,
        blue: navy,
        sky: navy,
        cyan: navy,
        slate: navy,
        // Secondary = burgundy (warmth, brand distinction). Warm-red families → burgundy.
        rose: burgundy,
        pink: burgundy,
        fuchsia: burgundy,
        red: burgundy,
        // Tertiary = gold (premium accent).
        amber: gold,
        yellow: gold,
        orange: gold,
      },
    },
  },
  plugins: [],
};
export default config;
