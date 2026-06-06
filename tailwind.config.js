/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        panel: "#f7f9fc",
        line: "#d9e1ec",
        accent: "#0f766e",
        warning: "#d97706",
        danger: "#dc2626",
      },
      boxShadow: {
        panel: "0 10px 30px rgba(23, 32, 51, 0.08)",
      },
    },
  },
  plugins: [],
};
