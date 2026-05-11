/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./docs/**/*.{md,mdx}"],
  theme: {
    extend: {
      colors: {
        'es-bg': '#0D0D12',
        'es-bg-subtle': '#13131a',
        'es-cyan': '#06d6a0',
        'es-purple': '#8b5cf6',
        'es-magenta': '#ec4899',
        'es-teal': '#19b17b',
        'es-text': '#f0f0f5',
        'es-text-secondary': 'rgba(240, 240, 245, 0.55)',
        'es-text-tertiary': 'rgba(240, 240, 245, 0.35)',
        'es-surface': 'rgba(255, 255, 255, 0.04)',
        'es-border': 'rgba(255, 255, 255, 0.08)',
      },
      borderRadius: {
        'es-sm': '12px',
        'es-md': '16px',
        'es-lg': '24px',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
};
