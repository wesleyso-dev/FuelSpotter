// tailwind.config.js
module.exports = {
  content: ['./App.tsx', './components/**/*.{ts,tsx}', './screens/**/*.{ts,tsx}', './context/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: { extend: {} },
  plugins: [],
};