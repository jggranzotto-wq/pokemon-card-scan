import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0b1020",
          card: "#151b2e",
          raised: "#1c243b",
          line: "#2a3454",
        },
        paper: {
          DEFAULT: "#f4f6fb",
          mute: "#9aa3b8",
        },
        bolt: "#ffcb05",
        sky: "#3d8bfd",
        mint: "#34d399",
        coral: "#fb7185",
      },
      boxShadow: {
        pad: "0 12px 40px rgba(0, 0, 0, 0.35)",
      },
      maxWidth: {
        phone: "28rem",
      },
    },
  },
  plugins: [],
};

export default config;
