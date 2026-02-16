/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        healthcare: {
          blue: "#1E3A8A",
          teal: "#0F766E",
          success: "#15803D",
          warning: "#D97706",
          error: "#B91C1C",
          bg: "#F1F5F9"
        }
      },
      boxShadow: {
        soft: "0 10px 30px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};

