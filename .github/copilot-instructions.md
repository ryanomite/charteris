# Charteris — Copilot Instructions

## Project Overview
Charteris is a web-based personal task management tool — a blend of Trello and Todoist. It runs as a single Docker container serving both the API and the frontend.

## Architecture

### Single Container
- **Server:** Node.js + Express + TypeScript (in `server/`), runs via `tsx`
- **Database:** SQLite via better-sqlite3, stored at `/data/charteris.db`
- **Frontend:** Vue 3 PWA (in `ui/`), built at image time, served as static files
- **Real-time:** WebSocket on the same port
- **AI Integration:** MCP server at `/mcp`
- **Port:** 8080 (API + static + WebSocket + MCP + health)
- **Auth:** Token-based via `?token=` query parameter, injected into the frontend at runtime via `window.__CHARTERIS__`

### Components

#### server/ (Express API + WebSocket + MCP)
- **Stack:** Node.js, Express, TypeScript, better-sqlite3
- **Entry point:** `server/src/index.ts`
- **Database:** `server/src/db/index.ts` — schema, seed, migrations
- **Query layer:** `server/src/queries/` — replaces ORM models
- **Routes:** `server/src/routes/` — RESTful endpoints
- **API spec:** `openapi.yaml` in project root (served at `/api/docs`)

#### ui/ (Vue.js PWA)
- **Stack:** Vue 3 (Composition API), Vite, Pinia, Vue Router, TypeScript
- **Style:** Dark-mode card-based UI using CSS variables (see `planning/UX.md`)
- **Icons:** FontAwesome (single-color only)
- **API communication:** RESTful via Axios; real-time via WebSocket (same origin)

#### agent/ (Planned — External Feed Monitor)
- **Stack:** Python
- **Purpose:** Scheduled monitoring of external sources (email, calendar, notes) for potential new tasks; creates them in the inbox via the API
- **`scripts/` folder:** Utility scripts that run on the host machine

## Project Structure
```
server/            → Express API + WebSocket + MCP server
ui/                → Vue.js PWA client
agent/             → Planned: external feed monitor + scripts/
scripts/           → Utility scripts (Trello import, etc.)
docs/              → Architecture & documentation
planning/          → UX specs & requirements
openapi.yaml       → API specification (OpenAPI 3.0)
Dockerfile         → Single-container build (2-stage)
```

---

## Planning Workflow

- Review functional/feature requirements carefully (usually in `planning/`), and ask any clarifying questions in chat before proceeding with development.
- Create a comprehensive `PLAN.md` file to track all steps (as a checklist) from planning to release.
    - Each step should be designed for an AI agent to complete. If a chat session is lost, the agent should be able to use the application documentation and `PLAN.md` to pick up where development stopped.
    - After each step is complete and verified, mark it as complete in `PLAN.md`.
    - Develop the API first — before the UI or any consumers.
    - Steps can be organized into phases (architectural or feature-based).
    - Development will proceed in one shot without stopping (except for major issues or questions), so do not assign timelines to phases.
- After planning, review the functional requirements and `PLAN.md` for outstanding questions or feature gaps. Stop and ask iterative questions via chat (in small numbered batches), and update both requirements and `PLAN.md` accordingly.

## Pre-Application Work

- **Data schema:** Design complete SQLite schemas. Initialization is handled by `server/src/db/index.ts`.
- **API utility endpoints:** Create RESTful utility endpoints to drop tables, recreate schemas, and reload seed data.
- **API design:** Design the RESTful API to handle ALL data operations, and document in `openapi.yaml`.
- **API build & verify:** Build all RESTful APIs from the OpenAPI spec. After each is built, confirm operations work through cURL calls.
- **README.md:** Update `README.md` iteratively as development progresses.

## Docker Development

- Build and test with `docker build -t charteris .` and `docker run`.
- A single Dockerfile in the project root handles the 2-stage build (Vue frontend → Node server).
- Data persists in a Docker volume mounted at `/data`.
- The container serves everything on port 8080: API (`/api/v1`), static UI (`/`), WebSocket, MCP (`/mcp`), health (`/health`), and Swagger docs (`/api/docs`).

## Development Process

### Versioning
- Each step in `PLAN.md` corresponds to a semantic version: `0.<phase>.<step>`.
    - Example: first step of phase 1 → `0.1.1`; second step of phase 3 → `0.3.2`.
    - Major version stays `0` until first production release after the initial `PLAN.md` is completed.

### Commits
- Commit after each major step (e.g., after API development, after UI development).
- Prefix commit messages with the version number.
- Multiple commits may share a version number if interactive bugs or additional requests must be resolved within a step.

### Build Order
- Build and test ALL APIs before proceeding to UI/application development.

### API ↔ Frontend Data Formatting
- API responses consumed by the Vue.js frontend must return JS-native types:
    - Booleans: return `true`/`false`, not `0`/`1`.
    - Dates: return the format the frontend expects (e.g., `YYYY-MM-DD` not full ISO).
    - Numbers: return as numbers, not strings (`255` not `"255"`).

## Coding Conventions
- Use TypeScript for all UI and API code
- Use Python for the agent component
- Prefer Composition API (`<script setup>`) in Vue components
- Use Pinia for state management in the UI
- Use CSS variables defined in `planning/UX.md` for all styling
- RESTful API endpoints should follow `/api/v1/<resource>` convention
- All API endpoints must have corresponding Swagger documentation
- Write tests alongside features

### Server Patterns
- **Query layer:** All SQL goes in `server/src/queries/*.ts`, never in route handlers. Functions follow `findAll[Resource]()`, `find[Resource]ById()`, `insert[Resource]()`, `update[Resource]()`, `delete[Resource]()` naming.
- **Row mappers:** Each query file has a `to[Resource](row)` function that renames `id` → `_id`, converts INTEGER→boolean, and joins related data.
- **Route handlers:** Validate input → call query → broadcast WebSocket event → return JSON.
- **Error handling:** `express-async-errors` for unhandled promise rejections; centralized `errorHandler` middleware catches `SQLITE_CONSTRAINT` errors.
- **WebSocket broadcasts:** Called synchronously after DB writes, before HTTP response.
- **Card order management:** Use `makeRoom()`, `closeGap()`, and `shiftCardOrders*()` helpers for order integrity.

### UI Patterns
- **Types:** UI types use `I` prefix (`ITask`, `ICard`, etc.) in `ui/src/types/index.ts`.
- **Store:** Single Pinia store (`taskStore`) holds all state. `fetchDashboard()` for initial load; `upsertTask/Card()` and `removeTask/Card()` for incremental updates.
- **Composables:** Stateful logic extracted into `useWebSocket()`, `useSelection()`, `useDragDrop()`, `useKeyboardShortcuts()`, `useHoveredList()`.
- **State flow:** User action → API call → server updates DB + broadcasts WS → store receives update → Vue re-renders. No optimistic updates.

## Technical Reference
For complete database schema, data model relationships, API business rules, WebSocket protocol, MCP tools, and UI architecture details, see `docs/ARCHITECTURE.md`.
