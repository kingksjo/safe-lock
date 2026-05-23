# SafeLock Admin Dashboard — Frontend

This directory contains the desktop-only React administrative dashboard for the **SafeLock Microcontroller-Based Digital Safe Lock System**. It acts as a central telemetry and command center, enabling security administrators to monitor physical access events, view captured user/intruder photos, check live lock status, and queue remote control commands.

---

## 1. Design System & Aesthetics

In compliance with [.design/DESIGN.md](../.design/DESIGN.md), the user interface is built on a **Hardened Technical Minimalist** design aesthetic, emphasizing high data density, functional purity, and immediate clarity.

### Color Tokens & Palette
*   **Base Foundation**: Obsidian-like deep base (`background` and `surface` set at `#111319` / `#0f1117`) to reduce eye strain during prolonged monitoring.
*   **Surface Containers**: Card components and secondary panels utilize a slightly lighter fill (`#161922` / `#1e1f26`) to layer depth tonally without relying on drop shadows.
*   **Primary Accent**: **Electric Blue (`#0ea5e9` / `#89ceff`)** is utilized for active states, key user actions, focus rings, and high-emphasis elements.
*   **Status Indicators**: High-saturation tones used selectively for immediate identification:
    *   *Teal (`#14b8a6` / `#4fdbc8`)*: Represents "Secure" states, healthy telemetry, and successfully verified logs.
    *   *Red (`#ffb4ab` / `#93000a`)*: Represents unauthorized PIN/FP failures, lockouts, and critical errors.
*   **Borders & Outlines**: Containers and dividers utilize subtle `1px` borders (`#1e293b` / `#3e4850`) instead of shadows to delineate layouts.

### Typography
*   **Sans Font Stack**: **Inter** (Google Fonts) is the primary typeface, yielding a clean, technical, and utilitarian layout.
*   **Monospace Font Stack**: A dedicated monospace font family is used exclusively for numeric values, hardware IDs, timestamp strings, IP addresses, and database status metrics. This ensures characters align vertically across multi-row lists and tables.
*   **Scale**: Body font sizes are slightly compact (14px base, 13px labels) to prioritize high information density.

### Spacing & Shapes
*   **Spacing Grid**: Built on a strict **4px base unit**. Internal padding utilizes 8px/12px, while section gutters and margins leverage 24px/32px to organize blocks logically.
*   **Soft Roundedness**: UI components (cards, text fields, buttons) feature a subtle **0.25rem (4px)** corner radius (`rounded` / `rounded-md`).
*   **Geometric Contrast**: **Status Badges** employ a **Pill-shaped (Full Round)** corner radius to break the rigid rectangular lines of the dashboard and draw immediate visual attention.

---

## 2. Page & Component Architecture

The interface is structured for viewport sizes of **1280px and wider**, organized around a persistent navigation architecture:

```
SafeAdmin
├── Sidebar (persistent, 260px wide)
│   ├── Logo & Brand Header
│   ├── Nav Node: Logs (Default Landing)
│   └── Nav Node: Controls
│
├── Logs Page
│   ├── Metrics Panel (Collapsible)
│   │   ├── Statistics Tiles (Total Logs, Successes, Failures, Lockouts)
│   │   ├── Hourly Access Bar Chart (Recharts)
│   │   └── Fail Streak Tracker
│   └── Access Logs Table (High-Density Grid)
│       ├── Search Input & Status Filters
│       ├── CSV Export Action
│       └── Log Telemetry Columns
│
└── Controls Page
    ├── Left Column: Action Cards
    │   ├── Device Status & Heartbeat
    │   ├── Enroll Biometrics Form
    │   ├── Unenroll Biometrics Dropdown
    │   ├── Remote Lockout Override
    │   └── Device Reset (Danger Zone)
    └── Right Column: Command Queue Monitor
        └── Live queue logging command state lifecycles
```

### Key Modules & Views
1.  **Sidebar (`260px`)**: Static left sidebar with custom monochrome icons. Active paths feature a subtle background highlight and a `2px` vertical accent line along the leftmost edge.
2.  **Logs Page**:
    *   *Collapsible Metrics Panel*: Visualizes peak authentication hours using a Recharts bar chart alongside key aggregate KPI cards.
    *   *AccessLogTable*: A high-density data grid separating rows with `1px` horizontal lines. Rows feature a hover-state highlight (`#1e293b`). Access event thumbnails display captured camera frames; clicking loads full high-resolution pictures.
3.  **Controls Page**:
    *   *DeviceStatusCard*: Displays hardware health pills (`Online` / `Offline` / `Locked Out`) coupled with a last-seen Unix timestamp and refresh hook.
    *   *EnrollCard / UnenrollCard*: Facilitates biometrics management. Enrollment triggers a "Waiting for physical scan..." state. Unenrollment provides a target slot dropdown selector (0–127).
    *   *LockoutToggleCard*: Provides remote software lockout overrides. Red signifies locked/disabled, Green indicates active.
    *   *DeviceResetCard*: Danger zone operation styled with warning-red styling. Requires the user to type "RESET" to confirm raw device wiping.
    *   *CommandQueuePanel*: Tracks remote operations as they transit database states: `PENDING` (grey) → `RELAYED` (blue) → `ACKNOWLEDGED` (yellow) → `DONE` (green) / `FAILED` (red).

---

## 3. Technology Stack

*   **Framework**: React 19 (TypeScript strict mode enabled)
*   **Build Tool**: Vite 8 with Hot Module Replacement (HMR)
*   **Styling Engine**: Tailwind CSS
*   **HTTP Client**: Axios (configured to target local Flask API boundaries)
*   **Telemetry Charts**: Recharts
*   **Routing**: React Router

---

## 4. Security & Admin Authentication

To prevent unauthorized remote actions, controls are secured using a lightweight client-side password scheme:
1.  During initial setup, the administrator defines an access password.
2.  The password is encrypted locally using a SHA-256 hashing algorithm and stored in the browser's `localStorage`.
3.  Whenever critical commands (enrollment, overrides, resets) are queued, the interface prompts the user for verification.
4.  The hashed input is validated against the stored value locally. Requests are aborted immediately if verification fails, preventing unauthorized commands from leaving the browser.

---

## 5. Live Telemetry & Polling Strategy

To ensure real-time synchronization with the physical lock without overloading the SQLite backend, the client uses a tiered background polling routine:

| Interface Panel | Polling Frequency | Trigger Mechanism |
| :--- | :--- | :--- |
| **Command Queue** | Every **3 seconds** | Automatic polling loop |
| **Access Logs Table** | Every **10 seconds** | Automatic polling loop |
| **Metrics Panel** | Every **30 seconds** | Automatic polling loop |
| **Device Status** | On-Demand | Manual "Refresh" action button |

---

## 6. Development & Deployment Operations

### Prerequisites & Installation
Ensure you have Node.js installed on your machine. From the `frontend/` directory, install all required vendor dependencies:
```bash
npm install
```

### Local Development Server
Launch the development build server using:
```bash
npm run dev
```
By default, the development server spins up at [http://localhost:5173](http://localhost:5173).

#### API Proxying Configuration
During local development, API requests are proxied from port `5173` to the Flask backend listening on port `5000` to prevent CORS issues. This is configured in `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
```

### Production Bundling
When deploying, compile the optimized, production-ready static assets:
```bash
npm run build
```
This builds and stores production files in `dist/`.

#### Deployment Pipeline
1.  Compile the build artifact using `npm run build`.
2.  Deploy/copy all contents of `dist/` into the Flask server's `static/` directory (`safelock/static/`).
3.  The single-process Flask application will serve `static/index.html` on any client-side routes, passing control to React Router.

### Code Quality Verification
Enforce strict formatting, type-safety, and lint rules across the codebase:
```bash
npm run lint
```

---
*For detailed information on Flask API REST endpoints or microcontroller command structures, refer to the documentation*
