import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        eva: {
          bg: '#0A0A0F',
          surface: '#12121A',
          border: '#1E1E2E',
          accent: '#7C3AED',
          accent2: '#EC4899',
          warm: '#F59E0B',
          cool: '#3B82F6',
          success: '#10B981',
          danger: '#EF4444',
          text: '#E2E8F0',
          muted: '#64748B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      keyframes: {
        orbIdle: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.8' },
          '50%': { transform: 'scale(1.05)', opacity: '1' },
        },
        orbListening: {
          '0%': { transform: 'scale(1)', boxShadow: '0 0 20px rgba(124,58,237,0.3)' },
          '100%': { transform: 'scale(1.08)', boxShadow: '0 0 40px rgba(124,58,237,0.7)' },
        },
        orbSpeaking: {
          '0%': { transform: 'scale(1)', boxShadow: '0 0 30px rgba(236,72,153,0.4)' },
          '100%': { transform: 'scale(1.12)', boxShadow: '0 0 60px rgba(236,72,153,0.8)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { transform: 'translateY(10px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'orb-idle': 'orbIdle 4s ease-in-out infinite',
        'orb-listening': 'orbListening 0.5s ease-in-out infinite alternate',
        'orb-speaking': 'orbSpeaking 0.3s ease-in-out infinite alternate',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config
