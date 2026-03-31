# Charteris

A personal task management tool that combines the spatial organization of a kanban board with the focus of a daily planner — all in a single Docker container. 

## Why Charteris?

After years of bouncing between commercial task management tools, I kept running into the same tradeoff: either you get a flat to-do list (Todoist) or a project board (Trello), but not both — and licensing fees keep climbing for features I don't need. What I actually wanted was a happy medium: simple enough for daily planning, flexible enough for project-level organization, and open enough to build on.

Charteris solves this with **tasks that live in multiple views simultaneously**:

- **Inbox** — a single-column capture zone. Tasks land here first, whether created manually or by an automated agent.
- **Planning** — two fixed lists, **Today** and **Next**, for short-term focus. Drag tasks here from the Inbox or the Board. Shortcut buttons help keep these lists organized quickly.
- **Board** — an unlimited kanban workspace. Create project-specific lists, group by context, or organize however you like.

Because a task can appear in multiple views at once, planning your day is as simple as dragging tasks from project lists on the Board onto "Today." More sophisticated tools lean on deadlines, calendars, and scheduling algorithms — and while Charteris supports due dates and recurrence, I've found that I still prefer to start each day by manually committing to a set of tasks. This tool makes that exceptionally easy.

It's also built as a developer-friendly platform — with a full REST API, MCP server, and a planned agent framework for automated task creation, prioritization, and workflow management.

Charteris was built almost entirely with AI, and is released freely under the MIT license.

### Features

- Dark-mode card-based UI with a celestial theme
- Real-time sync via WebSocket — open multiple tabs without conflicts
- Drag-and-drop between lists and sections
- Keyboard-driven workflow (see [Keyboard Shortcuts](#keyboard-shortcuts))
- Trello JSON import
- RESTful API with interactive Swagger docs
- MCP server for AI/LLM tool integration
- SQLite database — zero configuration, single-file persistence
- Runs as one Docker container on any platform

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
| **Planning** | Today, Next | Short-term focus — what to work on now vs. soon |
| **Board** | User-created | Long-term organization — projects, contexts, areas |

Inbox and Planning have fixed lists. The Board section supports unlimited user-created lists.

### Tasks

Tasks are the core unit of work. A task can appear in multiple lists across different sections — for example, a task can live on a Board project list *and* appear in Today for focused work. Completing or editing it in one place updates it everywhere.

- Click a task to open the edit modal (title, description, due date, priority, labels)
- Drag tasks between lists to reorganize
- Tasks show priority indicators, due dates, and completion status

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Q` | Quick-add a new task |
| `Enter` | Toggle complete on selected task(s) |
| `Backspace` | Archive selected task(s) |
| `Delete` | Delete selected task(s) (with confirmation) |
| `Arrow Up/Down` | Navigate between tasks (hold `Shift` to multi-select) |
| `Arrow Left` | Move task toward Inbox (Board → Today) |
| `Arrow Right` | Move task toward Board (Today → Next → Board) |
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
