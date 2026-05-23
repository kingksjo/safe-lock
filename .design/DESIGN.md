---
name: Hardened Technical Minimalist
colors:
  surface: '#111319'
  surface-dim: '#111319'
  surface-bright: '#373940'
  surface-container-lowest: '#0c0e14'
  surface-container-low: '#191b22'
  surface-container: '#1e1f26'
  surface-container-high: '#282a30'
  surface-container-highest: '#33343b'
  on-surface: '#e2e2eb'
  on-surface-variant: '#bec8d2'
  inverse-surface: '#e2e2eb'
  inverse-on-surface: '#2e3037'
  outline: '#88929b'
  outline-variant: '#3e4850'
  surface-tint: '#89ceff'
  primary: '#89ceff'
  on-primary: '#00344d'
  primary-container: '#0ea5e9'
  on-primary-container: '#003751'
  inverse-primary: '#006591'
  secondary: '#4fdbc8'
  on-secondary: '#003731'
  secondary-container: '#04b4a2'
  on-secondary-container: '#003f38'
  tertiary: '#c0c1ff'
  on-tertiary: '#1000a9'
  tertiary-container: '#8d90ff'
  on-tertiary-container: '#1407ad'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#c9e6ff'
  primary-fixed-dim: '#89ceff'
  on-primary-fixed: '#001e2f'
  on-primary-fixed-variant: '#004c6e'
  secondary-fixed: '#71f8e4'
  secondary-fixed-dim: '#4fdbc8'
  on-secondary-fixed: '#00201c'
  on-secondary-fixed-variant: '#005048'
  tertiary-fixed: '#e1e0ff'
  tertiary-fixed-dim: '#c0c1ff'
  on-tertiary-fixed: '#07006c'
  on-tertiary-fixed-variant: '#2f2ebe'
  background: '#111319'
  on-background: '#e2e2eb'
  surface-variant: '#33343b'
typography:
  display:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  h1:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  h2:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
  mono:
    fontFamily: monospace
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.4'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  sidebar-width: 260px
  container-max: 1440px
  gutter: 16px
---

## Brand & Style

The brand personality is rooted in absolute reliability, security, and technical precision. The design system prioritizes functional density over decorative elements, evoking the feeling of a high-performance instrument or a command center. It is designed for expert users who require immediate access to complex hardware telemetry and security states.

The visual style is **Minimalist** with a **High-Contrast Technical** edge. It utilizes a restrained color palette and strict alignment to create a "hardened" aesthetic. By stripping away unnecessary ornamentation and relying on purposeful borders and typography, the UI builds trust through clarity and institutional stability.

## Colors

The color strategy for the design system is centered on a deep, obsidian-like foundation to reduce eye strain during prolonged monitoring. The background (#0f1117) provides a stable stage for high-energy accents.

**Primary Electric Blue (#0ea5e9)** is used for active states, primary actions, and critical focus areas. **Teal (#14b8a6)** serves as the "Secure" indicator, used for healthy hardware states and verified logs. Typography relies on a high-contrast scale, using **Zinc/Slate whites** for readability and **Muted Blue-Greys** for secondary metadata. Success, Warning, and Danger states are handled with high-saturation tones but used sparingly to maintain the minimalist intent.

## Typography

The typography system uses **Inter** to achieve a utilitarian, corporate feel. The hierarchy is designed for data density; body sizes are slightly smaller than consumer standards (14px base) to allow more information to be displayed on screen simultaneously.

A dedicated **Monospace** stack is reserved for hardware IDs, IP addresses, and cryptographic keys to ensure character distinction. Headlines use a tighter letter-spacing for a modern, "Linear-style" appearance, while small labels use increased tracking and uppercase styling to provide clear categorization without overwhelming the visual field.

## Layout & Spacing

The design system employs a **Fluid Grid** with a fixed sidebar layout. The sidebar is anchored to the left, acting as the primary navigation hub with a width of 260px. This allows the main content area to expand and contract based on the viewport, essential for complex data visualizations and tables.

Spacing follows a strict **4px base unit**. Component internals generally use 8px or 12px padding, while page margins and section gaps utilize larger steps (24px to 32px) to create breathing room between dense data blocks. Information density is prioritized, but logical grouping is maintained through consistent margin application.

## Elevation & Depth

In line with the technical and minimalist requirements, the design system avoids heavy drop shadows. Depth is communicated through **Tonal Layering** and **Low-Contrast Outlines**.

1.  **Background:** The base layer (#0f1117).
2.  **Surface:** Cards and containers use a slightly lighter fill (#161922) to sit "above" the background.
3.  **Borders:** Each card or section is defined by a subtle 1px border (#1e293b). For active or hover states, the border color shifts to a more luminous tone or the primary blue.
4.  **Glass Effects:** Modals and dropdowns may use a 10px backdrop blur with a semi-transparent dark fill to maintain context without visual clutter.

## Shapes

The design system uses a **Soft (0.25rem)** roundedness for the majority of UI elements, including cards, input fields, and buttons. This creates a modern, refined appearance that still feels "engineered" and sharp.

However, a specific exception is made for **Status Badges**, which utilize a **Pill-shaped (Full Round)** radius. This geometric contrast allows status indicators to stand out instantly from the structural, rectangular grid of the dashboard.

## Components

### Buttons
Primary buttons use a solid Electric Blue (#0ea5e9) fill with high-contrast white text. Secondary buttons are "Ghost" style—defined by a subtle border and transparent background—transitioning to a light grey fill on hover.

### Pill Badges
Used for hardware status (e.g., "Online", "Encrypted"). These feature a low-opacity background fill (10-15%) of the status color (Teal, Blue, or Red) with a high-contrast label. 

### Cards
Cards are the primary data container. They feature 1px subtle borders (#1e293b), no shadows, and a consistent 16px internal padding. Card headers should use the `label-sm` typographic style for a technical, metadata-first feel.

### Input Fields
Inputs are dark-themed with a subtle border. On focus, the border transitions to Electric Blue with a very soft outer glow (0px 0px 0px 2px) to signify the active state.

### Sidebar Navigation
The sidebar uses a technical, vertical list style. Icons should be monochrome line-art. Active states are indicated by a subtle background highlight and a vertical 2px line on the far left of the item.

### Data Tables
Tables are high-density. Rows are separated by 1px horizontal lines only. On hover, rows highlight with a tonal shift to #1e293b. Monospace font is used for numeric values to ensure vertical alignment across rows.