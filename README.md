# Charteris

A personal task management tool designed to separate **intent** from **debt**. It provides a high-level **Cabinet** for your long-term projects and a focused **Briefing** for your daily commitments—all in a single Docker container.

## Why Charteris?
After years of bouncing between commercial tools, I found they all fall into the "Commitment Trap." Tools like Todoist link deadlines to daily lists, creating an "overdue snowball" of tasks that eventually becomes demoralizing. Tools like Trello offer great spatial organization but lack a dedicated "Today" focus.

Charteris acts as a filter between a **Cabinet** (everything you need to track) and a **Briefing** (the only things you need to do today - or very soon). Inspired by the historical role of a private secretary, it handles the noise so you can focus on the work.

Charteris solves the common productivity friction points with three core pillars:

1.  **Cabinet:** A visual board of unlimited lists to organize projects, domains, and "rainy-day" ideas. This satisfies the GTD requirement of offloading everything from your brain.
2.  **Briefing:** A dedicated planning section with two fixed lists, **Today** and **Next**. Moving a task here is a manual act of commitment, not an automated deadline.
3.  **Dual Presence:** The "secret sauce." Tasks can exist in the Cabinet and Briefing sections simultaneously. Moving a task to your Briefing doesn't remove it from its project list in Cabinet—it simply flags it for action while preserving all project context.

### Philosophy of Intent
Charteris honors the "blank sheet of paper" ritual. By using the **Adjourn** feature, the Briefing is cleared at the start of each day, forcing you to intentionally "cast" tasks from Cabinet into Briefing. This ensures your daily list represents what you *actually* intend to do, rather than a mounting debt of what you didn't finish yesterday.

It's also built as a developer-friendly platform—with a full REST API, MCP server, and a planned agent framework for automated task creation and workflow management.

### Features
- **Dual-Presence Logic:** Tasks exist in project lists and daily views synchronously.
- **The Adjourn Ritual:** A manual or automated daily reset to keep your Briefing focused and fresh.
- **Cast Due Tasks:** A shortcut to instantly identify and move urgent items from Cabinet into Briefing for review.
- **Progress Visualization:** A real-time progress indicator at the top of Briefing to track daily resolution.
- **Developer First:** RESTful API, interactive Swagger docs, and MCP server for LLM integration.
- **Zero Config:** Single Docker container with a SQLite backend.

## Installation

### Prerequisites

- Docker

### Quick Start

```bash
# Clone the repository
git clone <repo-url> charteris
cd charteris

# Build the image
docker build -t charteris .

# Run the container
docker run -d \
  --name charteris \
  -p 8080:8080 \
  -v charteris-data:/data \
  -e CHARTERIS_API_TOKEN=<your-secret-token> \
  charteris
```

Open `http://localhost:8080` in your browser. On first startup, Charteris creates the database and default sections/lists automatically.

### Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `CHARTERIS_API_TOKEN` | Yes | Shared secret for API, WebSocket, and MCP authentication. Passed as `?token=` query parameter. |

Data is stored in a SQLite database at `/data/charteris.db` inside the container. Mount a Docker volume (as shown above) to persist data across container restarts.

### Updating

```bash
docker stop charteris && docker rm charteris
docker build -t charteris .
docker run -d \
  --name charteris \
  -p 8080:8080 \
  -v charteris-data:/data \
  -e CHARTERIS_API_TOKEN=<your-secret-token> \
  charteris
```

Your data persists in the `charteris-data` volume.

## Usage

### Sections and Lists

Charteris organizes work into three **sections**, displayed left to right:

| Section | Lists | Purpose |
|---------|-------|---------|
| **Inbox** | Draft | Capture zone — tasks start here |
| **Briefing** | Today, Next | Short-term commitment — what you are doing now |
| **Cabinet** | User-created | Long-term organization — projects, contexts, areas |

Inbox and Planning have fixed lists. The Board section supports unlimited user-created lists.

### Tasks

Tasks are the core unit of work. A task can appear in multiple lists across different sections — for example, a task can live on a Board project list *and* appear in Today for focused work. Completing or editing it in one place updates it everywhere.

- Click a task to open the edit modal (title, description, due date, priority, labels)
- Drag tasks between lists to reorganize
- Tasks show priority indicators, due dates, and completion status

### Priority Guide

Priority guides what you should commit to, but does not auto-commit work. You still choose what enters Today and Next.

If there is a real external expectation or deadline, the task should generally be P1-P3.

- **P1 — Commit today:** work that should be done today; urgent external commitments usually belong here.
- **P2 — Next up, very important:** high priority and likely next in line; okay to slip a day.
- **P3 — Important, time-bounded, but flexible:** should be done soon; moderate slip is acceptable.
- **P4 — Internal priority, no near-term external pressure:** matters more than "someday" but has no immediate outside expectation.
- **P5 — Rainy Day:** optional/nice-to-have backlog work with low urgency and flexible timing.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Q` | Quick-add a new task |
| `Enter` | Toggle complete on selected task(s) |
| `Backspace` | Archive selected task(s) |
| `Delete` | Delete selected task(s) (with confirmation) |
| `Arrow Up/Down` | Navigate between tasks (hold `Shift` to multi-select) |
| `Arrow Left` | Move task toward Inbox (Cabinet → Today) |
| `Arrow Right` | Move task toward Board (Today → Next → Cabinet) |
| `Escape` | Clear selection |

### Trello Import

Export your Trello board as JSON, then:

```bash
./scripts/import-trello.sh ./trello-export.json http://localhost:8080 <your-token>
```

### API Documentation

Interactive Swagger docs are available at `http://localhost:8080/api/docs` when the container is running.

The OpenAPI specification is maintained at [openapi.yaml](openapi.yaml) in the project root.

### Admin Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/admin/reset` | POST | Drop all data, recreate default sections and lists |
| `/api/v1/admin/drop` | POST | Drop all data (empty database) |

## Agent (Planned 2.0)

The `agent/` directory is a placeholder for automated task ingestion workflows. The agent will:

- Monitor external sources (email, calendar, notes, RSS feeds) on a schedule
- Use LLMs to extract actionable items and summarize them into task titles and descriptions
- Automatically create tasks in the Inbox via the Charteris API
- Optionally use LLMs to organize, prioritize, and route tasks to appropriate Board lists

The agent runs as a separate process and communicates with Charteris through its REST API and MCP server.

## Project Structure

```
charteris/
├── server/          → Express API + WebSocket + MCP (TypeScript)
├── ui/              → Vue.js PWA frontend (TypeScript)
├── agent/           → Task ingestion agent (Python, planned)
├── scripts/         → Utility scripts (Trello import, etc.)
├── docs/            → Architecture documentation
├── planning/        → UX specs and requirements
├── openapi.yaml     → API specification (OpenAPI 3.0)
├── Dockerfile       → Single-container build
└── .env.example     → Environment variable template
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vue 3 (Composition API), Vite, Pinia, TypeScript |
| Backend | Node.js, Express, TypeScript |
| Database | SQLite (via better-sqlite3) |
| Real-time | WebSocket |
| AI Integration | MCP (Model Context Protocol) server |
| Container | Docker (single image, port 8080) |

## Architecture Note: Tasks vs. Cards

The user-facing documentation above refers to everything as "tasks" for simplicity. Under the hood, the data model draws an important distinction:

- A **task** is the canonical record — title, description, priority, due date, completion status, labels, subtasks, and recurrence.
- A **card** is a visual placement of a task within a specific list. One task can have multiple cards across different sections.

Editing (completing, changing priority, etc.) always operates on the underlying **task** — which updates every card that references it. Moving, reordering, and drag-and-drop operate on individual **cards**. Selection in the UI also targets specific cards, since the same task may appear in multiple places.

This distinction is critical for API consumers, MCP tool users, and anyone extending the codebase. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full technical reference.

## License

MIT — see [LICENSE](LICENSE).
