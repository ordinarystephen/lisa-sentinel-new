/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,html,css}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        "bg-subtle": "var(--color-bg-subtle)",
        "bg-muted": "var(--color-bg-muted)",
        "bg-hover": "var(--color-bg-hover)",
        ink: "var(--color-ink)",
        "ink-muted": "var(--color-ink-muted)",
        "ink-subtle": "var(--color-ink-subtle)",
        accent: "var(--color-accent)",
        "accent-hover": "var(--color-accent-hover)",
        rule: "var(--color-rule)",
        "rule-strong": "var(--color-rule-strong)",
        success: "var(--color-success)",
        warn: "var(--color-warn)",
        error: "var(--color-error)",
        "focus-ring": "var(--color-focus-ring)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        display: ["var(--font-display)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        12: ["12px", { lineHeight: "1.5" }],
        14: ["14px", { lineHeight: "1.5" }],
        15: ["15px", { lineHeight: "1.5" }],
        16: ["16px", { lineHeight: "1.5" }],
        18: ["18px", { lineHeight: "1.4" }],
        20: ["20px", { lineHeight: "1.3" }],
        24: ["24px", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
        32: ["32px", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
      },
      spacing: {
        // why: snap to the 8px base + commonly used multiples; Tailwind's
        // default 4-based scale isn't quite our 8-based system.
        18: "72px",
        22: "88px",
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(0, 0, 0, 0.04)",
        md: "0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)",
      },
      maxWidth: {
        canvas: "960px",
      },
    },
  },
  plugins: [],
};
