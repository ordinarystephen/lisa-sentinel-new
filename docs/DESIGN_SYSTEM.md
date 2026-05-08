# Design System

Conservative, bank-built look. JPMorgan / Goldman Sachs vibes. Restrained
typography, small accent palette, square-ish corners. Implemented in
`app/static/css/tokens.css` (variables) plus the rest of the CSS files.

## Color palette

| Token | Hex | Use |
| --- | --- | --- |
| `--color-bg` | `#ffffff` | Page background. |
| `--color-bg-subtle` | `#f7f7f5` | Sidebars, panels, table headers. |
| `--color-bg-muted` | `#eeece7` | Hover row backgrounds, dividers. |
| `--color-ink` | `#1a1a1a` | Primary text. |
| `--color-ink-muted` | `#5a5a5a` | Secondary text. |
| `--color-ink-subtle` | `#8a8a8a` | Captions, hints. |
| `--color-navy` | `#0a2540` | Primary accent (buttons, links, active). |
| `--color-navy-deep` | `#061a2e` | Hover / pressed. |
| `--color-charcoal` | `#2c2c2c` | Header bars / table-head text. |
| `--color-rule` | `#d8d4cc` | 1px borders. |
| `--color-success` | `#1f5d3a` | Muted forest green. |
| `--color-warn` | `#8a5a00` | Muted amber. |
| `--color-error` | `#7a1f1f` | Muted oxblood. |

No bright colors, no neon, no pastels, no gradients.

## Typography

- **Body (docs / answers):** serif stack — `Georgia, "Times New Roman",
  serif`.
- **UI:** sans stack — `Inter, "Helvetica Neue", Arial, sans-serif`.
- **Headings:** sans, weight 600, slightly negative tracking.
- **Mono:** `ui-monospace, "SF Mono", "Cascadia Code", monospace` — for
  paths, code, IDs.

| Token | Size |
| --- | --- |
| `--fs-caption` | 12px |
| `--fs-body` | 14px |
| `--fs-default` | 16px |
| `--fs-h3` | 18px |
| `--fs-h2` | 22px |
| `--fs-h1` | 28px |

Line heights: 1.5 body, 1.25 headings.

## Layout

- Max content width: 1440px.
- Sidebar: fixed 320px, full height, `--color-bg-subtle`.
- Tab bar: horizontal, under top header, 1px bottom border in `--color-rule`.
- Main panel padding: 32px.
- 8px base spacing unit. All spacing snaps to multiples (`--space-1` …
  `--space-7`).

## Components

- **Buttons.** Square-ish (max 2px radius). Navy primary, ghost secondary,
  no shadows. Hover = navy-deep. Active = inset 1px white border.
- **Inputs.** 1px `--color-rule` border, 4px radius max, white background,
  navy focus ring (no glow — just a 2px solid inset border).
- **Tables.** 1px rules between rows, no zebra. Hover row uses
  `--color-bg-muted`. Header row in `--color-charcoal` text on
  `--color-bg-subtle`.
- **Cards / panels.** 1px `--color-rule` border, no shadow, 4px radius
  max.
- **Tabs.** Underline-active. No pill shapes, no background fills on
  inactive tabs.
- **Status badges.** Subtle text-only badges with thin borders. Risk
  badges colour their border by level (red / amber / green) but never
  fill.
- **Empty states.** Centred single-column block with bold-weight headline,
  muted subhead, and a clear next-action button.

## Things we do NOT do

- No colored gradients.
- No glassmorphism / frosted glass.
- No oversized pill buttons.
- No chunky drop shadows.
- No emoji icons. Use simple line-icon SVGs if needed.
- No "fun" microcopy ("Whoops!", "Yay!"). Neutral professional language.
- No animated illustrations.

## Why this style

The audience for this app is internal credit analysts and risk managers.
The visual language signals seriousness and verification — not
playfulness. Every visual decision should look defensible in front of the
risk committee.
