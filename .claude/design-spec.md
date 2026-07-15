# AURA RENTAL — Design Specification v10

## Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--primary` | `#DAF0FE` | Background chính (xanh nhạt) |
| `--primary-dark` | `#BAE6FD` | Accent gradient |
| `--gold` | `#C9A86C` | Primary accent (buttons, active states) |
| `--gold-light` | `#F5ECD7` | Gold tint |
| `--gold-dark` | `#A68B5B` | Gold hover |
| `--text` | `#1E3A5F` | Primary text (dark blue) |
| `--text-secondary` | `#5B7A99` | Secondary text |
| `--text-tertiary` | `#94A3B8` | Muted text |

## Typography

- Font: Inter (Google Fonts)
- Weights: 400 (regular), 500 (medium), 600 (semibold), 700 (bold), 800 (extrabold)
- Sizes: 11px (xs), 13px (sm), 15px (base), 17px (lg), 20px (xl), 24px (2xl)

## Border Radius

- `--radius-sm`: 10px
- `--radius-md`: 14px
- `--radius-lg`: 18px
- `--radius-xl`: 24px
- `--radius-full`: pill shape

## Shadows

- `--shadow-sm`: Subtle cards
- `--shadow-md`: Raised elements
- `--shadow-lg`: Modals, FAB

## Calendar Stats (CRITICAL)

Element: `#cal-stats`
- Class: `.cal-month-stats-mini`
- Min-height: 72px (MUST have explicit height)
- Contains: `.cal-stat-mini.lay` and `.cal-stat-mini.tra`
- Stats rendered by `renderMonth()` in app.js line 474

## Component States

### Buttons
- Primary: Gold gradient, white text
- Ghost: White bg, border
- Danger: Red gradient

### Cards
- Background: `var(--bg-card)` (rgba white with backdrop-filter)
- Border: 1px solid rgba white 50%
- Shadow: `--shadow-md`
- Hover: translateY(-2px)

### Navigation
- Fixed bottom
- Glass morphism: `backdrop-filter: blur(20px)`
- Active: Gold color
