import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        umbra: {
          bg: "#000000",
          surface: "#0a0a0a",
          border: "#1e1e1e",
          accent: "#00ef9f",
          "accent-dim": "#00c484",
          muted: "#8a8a8a",
          text: "#e8e8e8",
        },
      },
      fontFamily: {
        mono: ["var(--font-ibm-plex-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(0, 239, 159, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
