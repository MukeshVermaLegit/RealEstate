import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Surfaces ──────────────────────────────────────────────────────
        base:      "rgb(var(--c-base) / <alpha-value>)",       // page background
        surface:   "rgb(var(--c-surface) / <alpha-value>)",    // cards
        elevated:  "rgb(var(--c-elevated) / <alpha-value>)",   // hover / nested
        overlay:   "rgb(var(--c-overlay) / <alpha-value>)",    // modals

        // ── Lines ─────────────────────────────────────────────────────────
        hairline:  "rgb(var(--c-hairline) / <alpha-value>)",
        edge:      "rgb(var(--c-edge) / <alpha-value>)",       // stronger border

        // ── Text ──────────────────────────────────────────────────────────
        ink:       "rgb(var(--c-ink) / <alpha-value>)",        // primary
        muted:     "rgb(var(--c-muted) / <alpha-value>)",      // secondary
        faint:     "rgb(var(--c-faint) / <alpha-value>)",      // tertiary / labels

        // ── Accent ────────────────────────────────────────────────────────
        accent: {
          DEFAULT: "rgb(var(--c-accent) / <alpha-value>)",
          hover:   "rgb(var(--c-accent-hover) / <alpha-value>)",
          soft:    "rgb(var(--c-accent-soft) / <alpha-value>)",
          ink:     "rgb(var(--c-accent-ink) / <alpha-value>)", // text ON accent
        },

        // ── Semantic ──────────────────────────────────────────────────────
        positive: "rgb(var(--c-positive) / <alpha-value>)",
        info:     "rgb(var(--c-info) / <alpha-value>)",
        warn:     "rgb(var(--c-warn) / <alpha-value>)",
        negative: "rgb(var(--c-negative) / <alpha-value>)",
      },
      fontFamily: {
        sans:    ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-sora)", "var(--font-inter)", "ui-sans-serif", "sans-serif"],
        mono:    ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        card:   "0 1px 2px 0 rgb(0 0 0 / 0.40), 0 0 0 1px rgb(255 255 255 / 0.03) inset",
        lift:   "0 12px 32px -8px rgb(0 0 0 / 0.65), 0 0 0 1px rgb(255 255 255 / 0.05) inset",
        glow:   "0 0 0 1px rgb(var(--c-accent) / 0.35), 0 8px 32px -8px rgb(var(--c-accent) / 0.30)",
      },
      backgroundImage: {
        "mesh": `radial-gradient(60rem 40rem at 12% -10%, rgb(var(--c-accent) / 0.16), transparent 60%),
                 radial-gradient(45rem 32rem at 88% 8%, rgb(56 189 248 / 0.10), transparent 62%),
                 radial-gradient(40rem 30rem at 50% 110%, rgb(var(--c-accent) / 0.07), transparent 60%)`,
        "grid": `linear-gradient(to right, rgb(var(--c-hairline) / 0.55) 1px, transparent 1px),
                 linear-gradient(to bottom, rgb(var(--c-hairline) / 0.55) 1px, transparent 1px)`,
        "accent-sheen": `linear-gradient(135deg, rgb(var(--c-accent)) 0%, rgb(var(--c-accent-hover)) 100%)`,
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 0.3s ease-out both",
        shimmer:   "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};
export default config;
