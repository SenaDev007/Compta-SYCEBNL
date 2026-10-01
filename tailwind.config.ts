import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        forest: {
          50: "#eef6f1",
          100: "#d8ebe0",
          500: "#258264",
          600: "#176b52",
          700: "#145843",
          900: "#142522",
        },
        paper: "#f5f6f2",
        copper: "#b9823b",
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
      boxShadow: { soft: "0 10px 30px rgba(20, 37, 34, .055)" },
    },
  },
  plugins: [],
};

export default config;
