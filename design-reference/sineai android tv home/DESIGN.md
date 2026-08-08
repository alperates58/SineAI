---
name: SineAI
colors:
  surface: '#111415'
  surface-dim: '#111415'
  surface-bright: '#37393b'
  surface-container-lowest: '#0c0e10'
  surface-container-low: '#1a1c1d'
  surface-container: '#1e2021'
  surface-container-high: '#282a2c'
  surface-container-highest: '#333537'
  on-surface: '#e2e2e4'
  on-surface-variant: '#c7c6cb'
  inverse-surface: '#e2e2e4'
  inverse-on-surface: '#2f3132'
  outline: '#909095'
  outline-variant: '#46464b'
  surface-tint: '#c7c6ca'
  primary: '#c7c6ca'
  on-primary: '#2f3034'
  primary-container: '#07080b'
  on-primary-container: '#78787c'
  inverse-primary: '#5e5e62'
  secondary: '#d2bbff'
  on-secondary: '#3f008e'
  secondary-container: '#6001d1'
  on-secondary-container: '#c9aeff'
  tertiary: '#d0bcff'
  on-tertiary: '#3b0091'
  tertiary-container: '#0c002a'
  on-tertiary-container: '#875de9'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e3e2e6'
  primary-fixed-dim: '#c7c6ca'
  on-primary-fixed: '#1a1b1f'
  on-primary-fixed-variant: '#46464a'
  secondary-fixed: '#eaddff'
  secondary-fixed-dim: '#d2bbff'
  on-secondary-fixed: '#25005a'
  on-secondary-fixed-variant: '#5a00c6'
  tertiary-fixed: '#e9ddff'
  tertiary-fixed-dim: '#d0bcff'
  on-tertiary-fixed: '#23005c'
  on-tertiary-fixed-variant: '#5321b4'
  background: '#111415'
  on-background: '#e2e2e4'
  surface-variant: '#333537'
typography:
  display-hero:
    fontFamily: Inter
    fontSize: 72px
    fontWeight: '800'
    lineHeight: 80px
    letterSpacing: -0.04em
  display-hero-mobile:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  metadata-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '800'
    lineHeight: 12px
    letterSpacing: 0.08em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  grid-margin-desktop: 80px
  grid-margin-mobile: 20px
  gutter: 24px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 48px
---

## Brand & Style
The design system is built for a premium, cinematic experience where content is the interface. It follows a **Minimalist-Cinematic** movement, prioritizing high-fidelity artwork over decorative UI chrome. The aesthetic is "Intelligent Darkness"—an environment that recedes to let the vibrant colors of film and television take center stage.

The emotional response is one of immersion and sophistication. By utilizing deep, near-black tones and sharp, purposeful typography, the interface feels like a high-end theater lounge. AI interactions are treated as "magical" utility, signified by focused violet accents rather than overwhelming gradients.

## Colors
The palette is rooted in the "void" of a cinema. The primary base (#07080B) is deep enough to make OLED screens disappear into the room. 

- **Base Layer:** Use the Primary color for the main background.
- **Surface Layers:** Use `surface_hex` for global navigation or persistent sidebars, and `surface_soft_hex` for interactive elements like input fields or focused rail items.
- **AI Accent:** The violet-to-purple spectrum is reserved exclusively for AI-driven discovery, recommendations, and intelligence-led focus states.
- **Contrast:** High-contrast white is used for critical information and primary buttons to ensure legibility against dark backdrops.

## Typography
This design system utilizes **Inter** for its systematic clarity and modern weight distribution. 

- **Cinematic Hierarchy:** Use `display-hero` for movie titles within the hero section to establish an editorial feel.
- **Metadata:** Use `metadata-sm` for year, rating, and duration. It should be high-density but legible.
- **Captions:** Use `label-caps` for category headers above content rails (e.g., "AI RECOMMENDATIONS FOR YOU").
- **Optical Sizing:** In mobile environments, prioritize `display-hero-mobile` to maintain impact without breaking the layout.

## Layout & Spacing
The layout uses a **Fluid Grid** model with generous outer margins to simulate a wide-screen cinematic aspect ratio.

- **Desktop:** 12-column grid with 80px side margins. 
- **Mobile:** 4-column grid with 20px side margins.
- **Content Rails:** Horizontal rows should bleed off the right edge of the screen to signal more content.
- **Safe Zones:** Content on Hero sections must be left-aligned and restricted to the first 5 columns on desktop to avoid clashing with the focal point of the background artwork.

## Elevation & Depth
The design system avoids traditional shadows in favor of **Tonal Layering** and **Gradient Occlusion**.

- **Depth through Gradients:** Use linear black gradients (0% to 100% opacity) from bottom-to-top and left-to-right on hero sections to ensure text legibility over diverse artwork.
- **Focused State:** On TV or 10-foot interfaces, elevation is achieved via a `scale(1.05)` transform and a 2px solid white or violet border.
- **Backdrops:** No background blurs are allowed. Use solid `surface_hex` for modals or overlays to maintain a "clean-cut" aesthetic.

## Shapes
The shape language is sharp and precise, reflecting a professional editing suite. 

- **Poster Cards:** Use `rounded-sm` (0.25rem) to slightly soften the edges of movie posters without making them feel bubbly.
- **Pill Shapes:** Buttons and badges should use `rounded-xl` or full pill-shaping to distinguish interactive elements from static content blocks.
- **Avoid:** Large-scale rounded corners. The interface should feel architectural and structured.

## Components
- **Poster Cards:** 2:3 aspect ratio. Typography (Title/Year) should only appear on hover or remain very small and tucked into the bottom-left. No borders unless focused.
- **Primary Buttons:** High-contrast white background with `#07080B` text. Pill-shaped.
- **AI Buttons:** Semi-transparent violet border (#7C3AED) with a subtle 10% violet inner glow. 
- **Navigation:** Transparent background when at the top of the page, transitioning to `primary_color_hex` on scroll. Text-only links in `text_secondary`.
- **AI Discovery Module:** A dedicated container with a thin, 1px violet-to-transparent gradient border. Inside, use a more spacious layout for natural language search or "AI Persona" toggles.
- **Focus States (10-foot UI):** Elements must scale to 1.05 and receive a high-contrast border. For AI-recommended items, the border is `#9B72FF`; for standard items, it is `white`.
- **Content Rails:** Title of the rail in `label-caps` followed by a horizontally scrolling list. Use an 8px gap between posters.