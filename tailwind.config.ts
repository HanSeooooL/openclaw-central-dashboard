import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        rausch: "#ff385c",
        "rausch-deep": "#e00b41",
        nearblack: "#222222",
        secondary: "#6a6a6a",
        surface: "#f2f2f2",
        "border-light": "#e8e8e8",
      },
      boxShadow: {
        card: "rgba(0,0,0,0.02) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 6px, rgba(0,0,0,0.1) 0px 4px 8px",
        "card-hover": "rgba(0,0,0,0.08) 0px 4px 12px",
      },
      borderRadius: {
        card: "20px",
        badge: "14px",
        large: "32px",
      },
      fontFamily: {
        sans: ['"Airbnb Cereal VF"', "Circular", "-apple-system", "system-ui", "Roboto", '"Helvetica Neue"', "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
