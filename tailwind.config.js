/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{ts,tsx}', './src/renderer/index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        maple: ['"Maple Mono"', 'monospace'], // 新增自定义字体类
        // 如果你希望覆盖默认的等宽字体，可以取消下面这行的注释：
        mono: ['"Maple Mono"', 'monospace'],
      }
    }
  },
  plugins: []
}