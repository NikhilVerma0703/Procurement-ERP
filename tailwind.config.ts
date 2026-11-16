import type { Config } from "tailwindcss";

// The Main ERP's palette (Pacific-ERP tailwind.config.ts, main @ e4d9eacf),
// copied as it is so the Purchase screens already read as part of that ERP
// and need no colour changes when the module is merged into it.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#0f4c5c",
          dark: "#0a3540",
          light: "#5f8c97",
          50: "#eef5f7",
          100: "#d7e8ec",
          200: "#b0d1d9",
          300: "#7fb3bf",
          400: "#4b8fa0",
          500: "#1f6d80",
          600: "#0f4c5c",
          700: "#0d4150",
          800: "#0a3540",
          900: "#07262e",
        },
        pacific: {
          dark: "#112732",
          mid: "#9AA8B6",
          light: "#DAE1E8",
        },
      },
      borderRadius: {
        card: "0.625rem",
      },
    },
  },
  plugins: [],
};

export default config;
