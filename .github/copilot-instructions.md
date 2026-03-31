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

## Development Workflow

Features and fixes are requested one at a time. There is no PLAN.md. When given a request:
1. Ask any essential clarifying questions before starting (keep it brief — only blockers).
2. Implement the change. For features touching both server and UI, build the API first.
3. Commit and push when done (see Commits below).

## Docker Development

- Build and test with `docker build -t charteris .` and `docker run`.
- A single Dockerfile in the project root handles the 2-stage build (Vue frontend → Node server).
- Data persists in a Docker volume mounted at `/data`.
- The container serves everything on port 8080: API (`/api/v1`), static UI (`/`), WebSocket, MCP (`/mcp`), health (`/health`), and Swagger docs (`/api/docs`).

## Development Process

### Versioning
- Determine the current version by running `git describe --tags --abbrev=0` (or inspect recent commit messages if no tags exist).
- Increment the **patch** number (`x.x.PATCH`) for bug fixes and small tweaks.
- Increment the **minor** number (`x.MINOR.0`) for new features or meaningful additions.
- **Never** increment the **major** version unless the user explicitly says to.

### Commits
- **Commit and push after every change** — GitHub webhooks trigger a CapRover deploy on push, so nothing is testable until committed.
- Commit freely without asking for confirmation. Do not use `--force` or amend published commits.
- Always prefix the commit message with the version number, e.g.: `1.0.3 Fix label color not saving`
- Use a single foreground terminal for all git operations (not background). Run `git add -A && git commit -m "..." && git push` as one command.

### Terminal Usage
- Prefer a single, persistent foreground terminal session over background terminals.
- Chain related commands with `&&` in one `run_in_terminal` call rather than opening multiple terminals.
- Only use background terminals for long-running processes that must stay alive (e.g., a dev server).

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
