/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{ts,tsx}', './src/renderer/index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ["Maple Mono NF CN", "Source Han Serif SC", "思源宋体"],
        serif: ["Maple Mono NF CN", "Source Han Serif SC", "思源宋体"],
        mono: ["Maple Mono NF CN"],
      }
    }
  },
  plugins: []
}