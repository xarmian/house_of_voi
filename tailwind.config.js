/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    // Mobile-first breakpoints
    screens: {
      'sm': '640px',
      'md': '768px', 
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px'
    },
    extend: {
      colors: {
        // Theme-aware colors using CSS custom properties
        theme: {
          primary: 'var(--theme-primary, #7c3aed)',
          secondary: 'var(--theme-secondary, #a855f7)',
          lights: 'var(--theme-lights, rgba(168, 85, 247, 0.3))',
          'bg-from': 'var(--theme-bg-from, #0f172a)',
          'bg-via': 'var(--theme-bg-via, #1e293b)',
          'bg-to': 'var(--theme-bg-to, #0f172a)',
          text: 'var(--theme-text, #ffffff)',
        },
        primary: {
          50: '#f0f9ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a'
        },
        voi: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b'
        },
        // Surface colors that adapt to themes
        surface: {
          primary: 'var(--theme-surface-primary, #1e293b)',
          secondary: 'var(--theme-surface-secondary, #334155)',
          tertiary: 'var(--theme-surface-tertiary, #475569)',
          border: 'var(--theme-surface-border, #64748b)',
          hover: 'var(--theme-surface-hover, #475569)',
        }
      },
      textColor: {
        theme: 'var(--theme-text, #ffffff)',
        'theme-text': 'var(--theme-text, #ffffff)',
        'theme-primary': 'var(--theme-primary, #7c3aed)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      // Mobile-optimized spacing
      spacing: {
        'touch': '44px', // Minimum touch target size
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)'
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'bounce-slow': 'bounce 2s infinite',
        'pulse-slow': 'pulse 3s infinite'
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography')
  ]
}