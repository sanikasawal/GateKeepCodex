import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        flashIn: {
          "0%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(255,255,255,0)" },
          "40%": { transform: "scale(1.04)" },
          "100%": { transform: "scale(1)" },
        },
        pulseAmber: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(245,158,11,0.4)" },
          "50%": { boxShadow: "0 0 0 8px rgba(245,158,11,0)" },
        },
        pulseRed: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(239,68,68,0.6)" },
          "50%": { boxShadow: "0 0 0 12px rgba(239,68,68,0)" },
        },
        toastIn: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        flashIn: "flashIn 0.6s ease-out",
        pulseAmber: "pulseAmber 2s infinite",
        pulseRed: "pulseRed 1.2s infinite",
        toastIn: "toastIn 0.4s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
