# SafeLock Agent Instructions

SafeLock is a **microcontroller-based digital safe lock system** combining Arduino Uno firmware, ESP32-CAM integration, a Flask backend, and a React admin dashboard.

**Status:** Pre-build / Planning (v1.1 — May 2026)

---

## Architecture Overview

The system has **three independent layers**:

| Layer | Tech | Role | Status |
|---|---|---|---|
| **Firmware** | Arduino C++ | Physical auth, peripherals, state machine | Not started |
| **Backend** | Python Flask + SQLite | REST API, command queue, file serving | Not started |
| **Frontend** | React 19 + Vite + Tailwind | Admin dashboard (logs, controls) | Scaffolded |

See [spec.md](spec.md) for complete technical specification, including state machine, API routes, and data models.

---

## Development Setup

### Frontend

```bash
cd frontend
npm install          # Install dependencies
npm run dev          # Start dev server (Vite) → http://localhost:5173
npm run build        # Build for production (outputs to dist/)
npm run lint         # Check code quality
```

### Backend (Python)
Will use Flask, SQLite, and command queue pattern. See spec.md §4 for API design.

### Firmware (Arduino)
Arduino Uno with state machine, keypad driver, fingerprint auth, relay control. **Note: Device firmware developments is not handled by you.**
---

## Key Concepts

### State Machine
The Uno runs an **event-driven state machine** (IDLE → PIN_ENTRY → FINGERPRINT → GRANTED → LOCKOUT). The exact transitions are critical for security and UX.

### Device Communication
- **Uno ↔ ESP32-CAM**: UART (Uno sends relay commands; ESP32 sends acknowledgments)
- **ESP32-CAM ↔ Flask**: HTTP POST/GET (image upload, log submission, poll for pending commands)
- **Browser ↔ Flask**: REST API (`GET /api/logs`, `POST /api/commands/*`, etc.)

### Authentication Flow
1. User enters PIN (keypad) → Uno validates against stored value
2. On PIN success → Trigger fingerprint scan (AS608 sensor)
3. On fingerprint match → Fire relay (solenoid unlocks for 5 seconds)
4. On any failure → Increment attempt counter; lockout after 3 attempts for 30 seconds

### Database Schema
SQLite with tables: `logs`, `images`, `commands`, `users` (planned). See spec.md §5.

---

## File & Folder Structure

```
.design/              # UI design tokens (colors, typography) — see DESIGN.md
spec.md               # Complete technical specification (READ FIRST)
README.md             # Project overview
AGENTS.md             # This file

frontend/             # React admin dashboard (Vite scaffolding complete)


routes/               # — Flask API routes go here
static/               # — Built frontend files go here (npm run build output)
images/               # — Uploaded lock camera images

.design/
  DESIGN.md           # Design guide/instructions (dark mode minimalist)
  controls-screen/    # UI mockups
  logs-dashboard-screen/
```

---

## Conventions & Patterns

### Code Style
- **Frontend:** React hooks, TypeScript strict mode, ESLint configured
- **Backend:** Python 3.8+, PEP 8, Flask request/response patterns
- **Firmware:** Arduino C++, modular driver architecture. **Note: Device firmware developments is not handled by you.**

### API Conventions
- REST endpoints: `/api/*` prefix
- Success: `200 OK` with `{data: {...}}` or `{status: "ok"}`
- Errors: `4xx/5xx` with `{error: "message"}`
- Poll frequency (ESP32-CAM): Every 2 seconds for pending commands

### Component Design
- **Drivers:** Modular abstractions for hardware (keypad, fingerprint, relay, buzzer, display)
- **State Machine:** Centralized, unambiguous transitions with timeout handling
- **Event Loop:** Uno runs event-driven (not polling) to minimize latency

### Secrets & Configuration
- PIN is stored in EEPROM (not hardcoded)
- Database connection string from environment variables (Flask)
- API base URL from frontend env config (Vite)

---

## Common Tasks & Commands

### Add a new API endpoint
1. Define route in `routes/` (Flask blueprint)
2. Add database query in `models/`
3. Document in spec.md §4 (API reference)
4. Frontend: Add fetch call in appropriate React component

### Modify the state machine
1. Update state diagram in spec.md §3.2
2. Modify Uno firmware transitions
3. Test all edge cases: timeouts, invalid inputs, concurrent attempts

### Build & deploy frontend
```bash
cd frontend && npm run build
# dist/ contains static files → copy to Flask static/
```

### Device firmware
**Note: Device firmware developments is not handled by you.** 

---

## Important Considerations

1. **Security:** PIN and fingerprint data is sensitive. Use EEPROM on Uno; hash PINs in database.
2. **State Integrity:** State machine must never enter invalid states. Timeout all operations.
3. **Network Reliability:** ESP32-CAM polling is lossy — design for dropped commands/logs.
4. **UI Clarity:** Admin dashboard must show exact lock state, recent logs, and manual override controls.
5. **Physical Testing:** Before deployment, test all failure modes on actual hardware.

---

## Related Resources

- **Technical Specification:** [spec.md](spec.md) — Architecture, API routes, firmware modules, database schema
- **Design System:** [.design/DESIGN.md](.design/DESIGN.md) — Colors, typography, component design tokens
- **Frontend Setup:** [frontend/README.md](frontend/README.md)

---

## Questions or Gaps?

If working on a task and need context:
- **Architecture question?** → See spec.md
- **UI/design question?** → See .design/DESIGN.md
- **Frontend code question?** → Check frontend/src/App.tsx and README
- **Backend/firmware not started?** → Refer to spec.md §4 (Backend) and §3 (Firmware)
