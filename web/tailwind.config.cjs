/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f5f7fb",
        ink: "#142033",
        brand: {
          50: "#eefbf5",
          100: "#d6f5e6",
          500: "#159a63",
          600: "#0d7c4f",
          700: "#0b633f"
        },
        gain: "#12824c",
        loss: "#c23b3b"
      },
      boxShadow: {
        panel: "0 18px 45px -28px rgba(20, 32, 51, 0.35)"
      }
    }
  },
  plugins: []
};

