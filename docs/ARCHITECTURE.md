# Charteris — Architecture & Technical Reference

This document is the authoritative technical reference for the Charteris codebase. It covers the database schema, data model, API behavior, WebSocket protocol, MCP tools, UI architecture, and coding patterns. An AI agent should be able to read this document alongside `copilot-instructions.md` and continue feature development.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Database Schema](#database-schema)
3. [Data Model & Relationships](#data-model--relationships)
4. [API Behavior & Business Rules](#api-behavior--business-rules)
5. [WebSocket Protocol](#websocket-protocol)
6. [MCP Tools](#mcp-tools)
7. [UI Architecture](#ui-architecture)
8. [Coding Patterns](#coding-patterns)
9. [Configuration](#configuration)
10. [Build & Docker](#build--docker)

---

## System Overview

Charteris runs as a single Node.js process in a Docker container, serving:

| Endpoint | Auth | Description |
|----------|------|-------------|
| `/health` | None | Health check |
| `/api/docs` | None | Interactive Swagger UI |
| `/api/v1/*` | Token | REST API |
| `/mcp` | Token | MCP server (Streamable HTTP) |
| `ws://` | Token | WebSocket (real-time sync) |
| `/*` | None | Vue.js SPA (static files) |

**Entry point:** `server/src/index.ts`

**Runtime:** `tsx` (TypeScript executed directly via `npx tsx src/index.ts`)

**Auth model:** Single shared token passed as `?token=<value>` query parameter. If `CHARTERIS_API_TOKEN` is empty/unset, auth is disabled (all requests pass through).

---

## Database Schema

**Engine:** SQLite via `better-sqlite3`  
**File:** `/data/charteris.db` (configurable via `DB_PATH` env var)  
**Pragmas:** WAL mode (concurrent reads during writes), foreign keys ON, busy timeout 5000ms  
**IDs:** 24-character hex strings generated via `crypto.getRandomValues`  
**Dates:** Stored as ISO 8601 text strings (`datetime('now')` default)  
**Booleans:** Stored as `INTEGER` (0/1), mapped to `true`/`false` in API responses

### Tables

#### sections
Fixed rows — created on first startup, never modified by the API.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | 24-char hex |
| name | TEXT | NOT NULL | Display name |
| slug | TEXT | NOT NULL UNIQUE | `inbox`, `planning`, `board` |
| icon | TEXT | NOT NULL | FontAwesome class (e.g. `fa-inbox`) |
| order | INTEGER | NOT NULL | Display order (0, 1, 2) |
| createdAt | TEXT | DEFAULT datetime('now') | |
| updatedAt | TEXT | DEFAULT datetime('now') | |

**Seed data:** Inbox (order 0), Planning (order 1), Board (order 2)

#### lists
Fixed lists are created on first startup. Users can create/delete lists only in the Board section.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | 24-char hex |
| name | TEXT | NOT NULL | Display name |
| sectionId | TEXT | NOT NULL FK → sections(id) | Parent section |
| order | INTEGER | NOT NULL DEFAULT 0 | Position within section |
| isFixed | INTEGER | NOT NULL DEFAULT 0 | 1 = cannot be renamed/deleted |
| createdAt | TEXT | DEFAULT datetime('now') | |
| updatedAt | TEXT | DEFAULT datetime('now') | |

**Index:** `idx_lists_section_order` on (sectionId, order)  
**Seed data:** Draft (Inbox, fixed), Today (Planning, fixed), Next (Planning, fixed)

#### tasks
The primary unit of work. Tasks are standalone; cards are visual instances of tasks in lists.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | 24-char hex |
| title | TEXT | NOT NULL | Display title |
| description | TEXT | NOT NULL DEFAULT '' | Rich text description |
| priority | INTEGER | CHECK 1-4 or NULL | 1=highest (red), 2=orange, 3=yellow, 4=blue |
| dueDate | TEXT | nullable | ISO date string (YYYY-MM-DD) |
| recurrence | TEXT | NOT NULL DEFAULT '' | e.g. `mon,wed,fri` |
| completed | INTEGER | NOT NULL DEFAULT 0 | Instance-specific status |
| archived | INTEGER | NOT NULL DEFAULT 0 | Instance-specific status |
| master | INTEGER | NOT NULL DEFAULT 0 | 1 = template for recurring series |
| parentId | TEXT | nullable FK → tasks(id) | Points to master task (master points to itself) |
| createdAt | TEXT | DEFAULT datetime('now') | |
| updatedAt | TEXT | DEFAULT datetime('now') | |

**Indexes:** `idx_tasks_archived`, `idx_tasks_completed`, `idx_tasks_parentId`, `idx_tasks_master` (master, recurrence, archived), `idx_tasks_dueDate`

#### subtasks
Simple checklist items attached to a task. Not separate task records.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | 24-char hex |
| taskId | TEXT | NOT NULL FK → tasks(id) ON DELETE CASCADE | Parent task |
| title | TEXT | NOT NULL | Checklist item text |
| completed | INTEGER | NOT NULL DEFAULT 0 | |
| order | INTEGER | NOT NULL DEFAULT 0 | Display order |

**Index:** `idx_subtasks_taskId`

#### labels
Plain text tags for categorization. No color.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | 24-char hex |
| name | TEXT | NOT NULL UNIQUE COLLATE NOCASE | Case-insensitive unique name |
| createdAt | TEXT | DEFAULT datetime('now') | |
| updatedAt | TEXT | DEFAULT datetime('now') | |

#### task_labels
Many-to-many join table between tasks and labels.

| Column | Type | Constraints |
|--------|------|-------------|
| taskId | TEXT | FK → tasks(id) ON DELETE CASCADE |
| labelId | TEXT | FK → labels(id) ON DELETE CASCADE |

**Primary key:** (taskId, labelId)  
**Indexes:** `idx_task_labels_taskId`, `idx_task_labels_labelId`

#### cards
Visual instances of tasks within lists. A task can have cards in multiple lists across different sections.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | 24-char hex |
| taskId | TEXT | NOT NULL FK → tasks(id) | The underlying task |
| listId | TEXT | NOT NULL FK → lists(id) | Which list this card appears in |
| order | INTEGER | NOT NULL DEFAULT 0 | Position within list |
| createdAt | TEXT | DEFAULT datetime('now') | |
| updatedAt | TEXT | DEFAULT datetime('now') | |

**Indexes:** `idx_cards_list_order` (listId, order), `idx_cards_taskId`

---

## Data Model & Relationships

### Task vs. Card

This is the most important distinction in the system:

- A **task** is the canonical record: title, description, priority, due date, completion status, etc.
- A **card** is a visual placement of a task within a specific list. One task can have multiple cards across different sections.
- **Editing** (complete, archive, change priority) operates on the underlying **task**.
- **Moving, reordering, drag-and-drop** operates on the **card**.
- **Selection** in the UI targets specific cards (not tasks), since the same task may appear in multiple places.

### Task Lifecycle

```
Created via API (POST /tasks) → no card yet
  ↓
Card created (POST /cards) → task appears in a list
  ↓
Card moved to other lists → task visible in multiple sections
  ↓
Task completed (PATCH /tasks/:id/complete) → card shows completion indicator
  ↓
Task archived (PATCH /tasks/:id/archive) → card hidden from dashboard
  ↓
Task deleted (DELETE /tasks/:id) → task + all cards + subtasks + label associations removed
```

**Key rule:** Creating a task does NOT automatically create a card. The caller must create both (the import endpoint does this; the UI quick-add flow does this). MCP tools expose both operations separately.

### Cross-Section Card Movement Rules

When a card is moved via `PATCH /cards/:id/move`:

```
SAME SECTION move:
  → Card is moved (listId updated, order adjusted)

CROSS-SECTION move:
  → Check: does the task already have a card in the target section?
    YES → Delete the source card, return the existing card
    NO  → Create a new card in the target list (task now in both sections)
         → If source section is Inbox: also delete the source card (one-way out)
```

The Inbox section is **one-way out**: moving a card from Inbox to another section always removes it from Inbox. The frontend also prevents drag-drop INTO the Draft list, but the API allows creating Draft cards programmatically (e.g., agent, import).

### Recurring Task Model

Recurrence is stored as a comma-separated day string: `mon,tue,wed,thu,fri,sat,sun`.

- A **master task** has `master=true` and `parentId` pointing to itself.
- A **generated instance** has `master=false` and `parentId` pointing to the master.
- An external agent (planned, Phase 2) runs nightly to create instances for today's matching days.
- Generating instances is NOT built into the server — it requires the agent.

### Task Update Propagation

When editing a task that has a `parentId` (i.e., part of a recurring series):

- **Propagated fields** (sync across series): `title`, `description`, `priority`, `labels`, `dueDate`, `recurrence`, `subtasks`
- **Instance-specific fields** (NOT propagated): `completed`, `archived`

Propagation updates the parent task and all sibling tasks (same `parentId`) except the one being edited.

### Cascade Delete Rules

| Action | Cascades to |
|--------|-------------|
| Delete task | All cards for that task (explicit query), subtasks (FK CASCADE), task_labels (FK CASCADE) |
| Delete label | task_labels entries (FK CASCADE) |
| Delete task series | All tasks with same parentId + their cards/subtasks/labels |
| Delete list | Cards must be handled before list deletion (no FK CASCADE on cards→lists) |

---

## API Behavior & Business Rules

### Authentication

All `/api/v1/*` routes require `?token=<value>`. Token is compared against `CHARTERIS_API_TOKEN` env var. If the env var is empty, auth is disabled.

Swagger docs (`/api/docs`) and health (`/health`) are never authenticated.

### Response Format

- **Success:** JSON object or array (the resource itself)
- **Error:** `{ "error": "message" }` with appropriate HTTP status
- **IDs:** All resources use `_id` field (not `id`) in API responses
- **Booleans:** Always `true`/`false` (not 0/1)
- **Dates:** ISO string format

### Error Handling

| Code | When |
|------|------|
| 400 | Missing required fields, validation failure, SQLite constraint violation |
| 401 | Missing or invalid token |
| 404 | Resource not found |
| 500 | Unhandled server error |

SQLite `SQLITE_CONSTRAINT` errors (e.g., duplicate label name) are caught by the error handler middleware and returned as 400.

### Key API Endpoints

Full specification is in `openapi.yaml`. Business rules not captured in the OpenAPI spec:

**POST /api/v1/tasks** — Creates a task only. Does NOT create a card. Caller must also call POST /cards.

**PUT /api/v1/tasks/:id** — Full update. Propagates `title`, `description`, `priority`, `labels`, `dueDate`, `recurrence`, `subtasks` to parent and siblings if `parentId` is set. Does NOT propagate `completed` or `archived`.

**PATCH /api/v1/tasks/:id/complete** — Toggles `completed` boolean. No propagation.

**PATCH /api/v1/tasks/:id/archive** — Toggles `archived` boolean. No propagation.

**DELETE /api/v1/tasks/:id/series** — Deletes all tasks sharing the same `parentId`. Returns 400 if the task has no parent.

**PATCH /api/v1/cards/:id/move** — Cross-section movement logic described in [Cross-Section Card Movement Rules](#cross-section-card-movement-rules).

**PATCH /api/v1/cards/:id/reorder** — Reorders a card within its current list. Shifts sibling card orders as needed.

**POST /api/v1/admin/reset** — Drops all data, recreates sections and fixed lists. Used for testing.

**POST /api/v1/admin/drop** — Drops all data. Empty database.

**POST /api/v1/import/trello** — Imports a Trello JSON export. Creates lists in the Board section, tasks, and cards. Skips archived Trello cards.

**GET /api/v1/dashboard** — Returns `{ sections, lists, tasks, cards, labels }` — the full app state. Tasks are filtered to `archived=false`. Used by the frontend on initial load.

### Filter Parameters (GET /tasks)

| Parameter | Type | Description |
|-----------|------|-------------|
| completed | boolean | Filter by completion status |
| archived | boolean | Filter by archive status |
| master | boolean | Filter for master/template tasks |
| parentId | string | Filter by parent task ID |
| label | string | Filter by label ID |
| dueDate | string | Filter by due date (exact match) |

All filters combine with AND logic.

---

## WebSocket Protocol

### Connection

```
ws://host:8080?token=<api-token>
```

Token is validated on upgrade. Invalid/missing token results in `401 Unauthorized` and socket destruction.

### Message Format (Server → Client)

All messages are JSON:

```json
{
  "event": "<resource>:<action>",
  "data": { /* resource object or { _id } for deletes */ }
}
```

### Event Types

| Event | Data | When |
|-------|------|------|
| `task:created` | Full Task object | POST /tasks |
| `task:updated` | Full Task object | PUT /tasks/:id, PATCH complete/archive |
| `task:deleted` | `{ _id }` | DELETE /tasks/:id, DELETE /tasks/:id/series |
| `card:created` | Full Card object | POST /cards, cross-section move (new card) |
| `card:updated` | Full Card object | PUT /cards/:id |
| `card:deleted` | `{ _id }` | DELETE /cards/:id, cross-section move (source removed) |
| `card:moved` | Full Card object | PATCH /cards/:id/move (same-section) |
| `card:reordered` | Full Card object | PATCH /cards/:id/reorder |
| `list:created` | Full List object | POST /lists |
| `list:updated` | Full List object | PUT /lists/:id |
| `list:deleted` | `{ _id }` | DELETE /lists/:id |
| `list:reordered` | Full List object | PATCH /lists/:id/reorder |
| `label:created` | Full Label object | POST /labels |
| `label:updated` | Full Label object | PUT /labels/:id |
| `label:deleted` | `{ _id }` | DELETE /labels/:id |

### Client Behavior

- No client→server messages (one-way broadcast only)
- Reconnects after 3 seconds on disconnect (linear, infinite retries)
- On reconnect: refetches full dashboard state from API
- Client processes events by upserting/removing from Pinia store

### Broadcast Timing

Events are broadcast synchronously after the DB write, before the HTTP response is sent. All connected clients (including the one that made the API call) receive the event.

---

## MCP Tools

The MCP server is available at `POST /mcp` using Streamable HTTP transport. Sessions are tracked server-side.

### Tool Reference

| Tool | Parameters | Description |
|------|------------|-------------|
| `get_dashboard` | none | Full state: sections, lists, tasks (non-archived), cards, labels |
| `list_tasks` | `completed?`, `archived?`, `label?` | Query tasks with optional filters |
| `get_task` | `taskId` | Single task by ID |
| `create_task` | `title`, `description?`, `priority?` (1-4), `labels?` (ID array), `dueDate?`, `recurrence?` | Creates task only (no card) |
| `update_task` | `taskId`, `title?`, `description?`, `priority?` (1-4), `labels?`, `dueDate?` (nullable), `recurrence?` | Partial update |
| `complete_task` | `taskId` | Toggle completion |
| `archive_task` | `taskId` | Toggle archive |
| `delete_task` | `taskId` | Delete task + cards + subtasks |
| `list_cards` | `listId?`, `taskId?` | Query cards |
| `create_card` | `taskId`, `listId` | Place a task in a list |
| `move_card` | `cardId`, `targetListId`, `order?` | Move card (simple — does not apply cross-section rules) |
| `delete_card` | `cardId` | Remove a card |
| `list_labels` | `q?` | Search/list labels |
| `create_label` | `name` | Create a label |
| `list_lists` | `sectionId?` | List all lists or filter by section |
| `create_list` | `name`, `sectionId` | Create a list (Board section only) |

**Note:** The MCP `move_card` tool performs a simple move (update listId + order), unlike the API's `PATCH /cards/:id/move` which has cross-section duplication logic. MCP tools also do not broadcast WebSocket events.

### Common MCP Workflow

To create a task visible in the UI:
1. `create_task` → get task ID
2. `create_card` with taskId + target listId → task appears in the list

---

## UI Architecture

### Tech Stack
- Vue 3 with Composition API (`<script setup>`)
- Pinia for state management
- Vue Router (single route: DashboardPage)
- Axios for API calls
- CSS variables for theming (see `planning/UX.md`)
- FontAwesome icons (single-color only)

### Component Tree

```
App.vue
└── DashboardPage.vue
    ├── SectionPanel.vue (× 3: Inbox, Planning, Board)
    │   └── VerticalList.vue (× N per section)
    │       └── TaskCard.vue (× N per list)
    ├── TaskEditModal.vue (opened on card click)
    └── MobileNav.vue (mobile section navigation)
```

### Pinia Store (`taskStore`)

**State:**
- `sections: ISection[]` — the 3 sections
- `lists: IList[]` — all lists
- `tasks: ITask[]` — all non-archived tasks
- `cards: ICard[]` — all cards
- `labels: ILabel[]` — all labels

**Key getters:**
- `sortedSections` — sections sorted by order
- `listsForSection(sectionId)` — lists filtered and sorted
- `cardsForList(listId)` — cards filtered and sorted by order
- `taskById(taskId)` — lookup task by ID

**Key actions:**
- `fetchDashboard()` — GET /dashboard, populates all state
- `upsertTask(task)` — insert or update a task in the array
- `removeTask(taskId)` — remove task and its cards from arrays
- `upsertCard(card)` — insert or update a card
- `removeCard(cardId)` — remove a card from the array

### Composables

| Composable | Purpose |
|------------|---------|
| `useWebSocket()` | Manages WS connection, auto-reconnect, dispatches events to store |
| `useSelection()` | Multi-select model: `selectedCards`, `focusedCardId`, `navigate()`, `clearSelection()` |
| `useDragDrop()` | Drag-and-drop state and handlers for cards between lists |
| `useKeyboardShortcuts(openCard)` | Keyboard bindings (Q, Enter, Backspace, Delete, arrows) |
| `useHoveredList()` | Tracks which list is being hovered (single ref) |

### State Flow

```
User interaction (click, drag, keyboard)
  → Component calls API (via Axios)
  → Server updates SQLite + broadcasts WebSocket event
  → useWebSocket receives event → updates Pinia store
  → Vue reactivity re-renders affected components
```

The UI does NOT optimistically update — it waits for the WebSocket event or API response before reflecting changes. The API response is typically used for the initiating client; WebSocket ensures other tabs/clients stay in sync.

### Runtime Token Injection

At serve time, the Express server reads `index.html` and injects:
```html
<script>window.__CHARTERIS__={token:"<CHARTERIS_API_TOKEN>"}</script>
```

Both `api.ts` and `useWebSocket.ts` read from `window.__CHARTERIS__.token` first, falling back to `import.meta.env.VITE_API_TOKEN` (build-time, for local dev).

---

## Coding Patterns

### Server Query Layer

All database operations go through `server/src/queries/*.ts`. No raw SQL in route handlers.

```typescript
// Pattern for each resource:
function findAll[Resource](filter?): Resource[]
function find[Resource]ById(id): Resource | null
function insert[Resource](data): Resource
function update[Resource](id, data): Resource | null
function delete[Resource](id): void
```

Each query file has a `to[Resource](row)` mapper that converts SQLite rows to API-shape objects:
- Renames `id` → `_id`
- Converts INTEGER booleans (0/1) to `true`/`false`
- Joins related data (e.g., tasks include `labels[]` and `subtasks[]`)

### Route Handlers

Routes in `server/src/routes/*.ts` follow this pattern:
```typescript
router.method('/path', (req: Request, res: Response) => {
  // 1. Validate input
  // 2. Call query function(s)
  // 3. Broadcast WebSocket event
  // 4. Return JSON response
});
```

Error handling uses `express-async-errors` for automatic promise rejection catching, plus a centralized `errorHandler` middleware that catches `SQLITE_CONSTRAINT` errors.

### UI Type Conventions

- Server types (`server/src/types.ts`): `Section`, `List`, `Task`, etc. — match API response shape, use `_id`
- UI types (`ui/src/types/index.ts`): `ISection`, `IList`, `ITask`, etc. — prefixed with `I`, same shape

### Card Order Management

Card ordering uses integer positions. Helper functions maintain order integrity:
- `makeRoom(listId, order)` — shifts cards at `order` and above up by 1
- `closeGap(listId, order)` — shifts cards above `order` down by 1
- `shiftCardOrdersUp/Down(listId, from, to)` — range-based reordering for within-list moves

---

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `CHARTERIS_API_TOKEN` | `''` (no auth) | Shared API/WS/MCP secret |
| `PORT` | `8080` | Server listen port |
| `DB_PATH` | `/data/charteris.db` | SQLite database file path |
| `NODE_ENV` | `development` | Node environment |

Configuration is loaded in `server/src/config/index.ts`.

---

## Build & Docker

### Dockerfile (2-stage)

**Stage 1 — UI Build:**
- Base: `node:20-alpine`
- Installs UI dependencies, runs `npm run build`
- Produces `ui/dist/` (static files)

**Stage 2 — Server Runtime:**
- Base: `node:20-alpine`
- Installs `python3 make g++` temporarily (for `better-sqlite3` native compilation), then removes them
- Copies `server/`, `openapi.yaml`, and built UI dist (as `/app/public/`)
- Runs `npx tsx src/index.ts`

### Build & Run

```bash
docker build -t charteris .
docker run -d --name charteris \
  -p 8080:8080 \
  -v charteris-data:/data \
  -e CHARTERIS_API_TOKEN=<token> \
  charteris
```

### Data Persistence

SQLite database lives at `/data/charteris.db`. Mount a Docker volume at `/data` to persist across container restarts. Tables and seed data are auto-created on first startup if the database is empty.

### First Startup Behavior

1. `initDb()` creates the database file if missing
2. `createTables()` runs `CREATE TABLE IF NOT EXISTS` for all tables
3. `seedIfEmpty()` checks if sections exist; if not, creates the 3 sections and 3 fixed lists
