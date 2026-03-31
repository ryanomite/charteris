# Project Requirements

## Overview

This is a web-based personal task management tool (not a project management tool), called Charteris. It runs as a single Docker container with a SQLite database.

## Components

- Task management web interface (`ui/`), a blend between Trello and Todoist. This is a PWA installable Vue.js client-side application that uses a RESTful API for data transmission.
- SQLite database (via better-sqlite3) to track tasks, lists, and deadlines — stored at `/data/charteris.db` inside the container.
- Comprehensive RESTful API (`server/`), used by the UI and capable of performing all operations on tasks, lists, etc. Includes full Swagger documentation (served at `/api/docs`). The server also provides a WebSocket backend for real-time data updates, and an MCP server for agentic AI operations.
- Phase 2: an agent (`agent/`) with scripts to monitor external applications and data feeds (email, calendar, notes, etc.) for potential new tasks — uses the API to create them in the Inbox for review. Scripts can run locally or be scheduled via the host machine's crontab.

Everything runs in a single Docker container on port 8080. Data persists in a Docker volume mounted at `/data`.

## Charteris UI Functionality

- This is a functional blend between Trello and Todoist for personal task management. Trello lets the user create arbitrary lists of cards (tied to tasks), and organize those elements in any way desired. Todoist is more of a single list with clear deadline/timeline management - with great keyboard shortcuts. In this model, we'll organize lists into three sections: Inbox, Planning, and Board. The "Board" section will be more like Trello, with arbitrary task/list arrangement (drag and drop, reordering), the "Planning" section will have two fixed lists ("Today" and "Next" that respectively reflect items on today's and tomorrow's to-do lists), and the "Inbox" section will have a single list of draft tasks ("Draft") that are automatically created by the charteris-agent for consideration.
- **IMPORTANT**: There is a critical distinction between tasks and cards. **Tasks** are the primary record in the database that we associate with typical to-do list functionality (completion, due dates, priority, labels, recurrence, etc). **Cards** are instances of the same task within one or more Lists, and are what are used by Vue.js to render actual cards in the interface. Every task must have at least one associated card. When selecting, reordering, moving, and dragging-and-dropping in the interface, it's the card record that's being modified; when editing (such as completing a task, changing a due date, etc.), it's the underlying task that's being modified.
- Application should maintain a persistant internal data model of tasks, cards, lists, sections, etc., and use that to render the interface in Vue.js, dynamically. When data is requested (via an API call) or pushed (via websockets), the internal data model should be changed - which should automatically update relevant parts of the interface.
- Tasks can be associated with more than one list, meaning they could appear as more than one card in the interface. 
- Cards can be reordered within lists, and lists can be reordered within sections
- Cards can be dragged between lists. If the source and destination lists are in the SAME section, the source list is **replaced** with the destination list on the card object. If the lists are in DIFFERENT sections, the card is duplicated (same task) in the target list. If a card is dragged from one section to another that it is already associated with, the original card is removed.
- The "Inbox" section is one-way (enforced in the frontend application, NOT the backend API): its cards can only be moved out of the inbox, not in. This means that the Draft list in the Inbox section cannot be the destination of a drag-and-drop operation. However, the backend API can freely create Inbox/Draft cards.
- Tasks have boolean values for completion and archiving. Completed tasks will continue to show in the interface; archived will not. 
- Clicking a card (unless the shift or control key currently pressed - see below) will open up a detailed task edit modal, where users can edit the associated task's title (what shows in the main interface), completion and archival status, priority, labels, due date, recurrence, detailed description, and subtasks (a simple checklist, not actual task records). Users can also permenantly delete a task, though archival is preferred for completed tasks.
- Tasks can have optional due dates, that affects how associated cards are highlighted, and can be used to create alarms/notifications. *However*, task due dates have nothing to do with the Today and Next lists in the Planning section. We may ultimately create a shortcut button to add tasks due both today and tomorrow to the Today list, but that's just a utility; users will typically manage their own daily to-do list.
- Tasks will also have an optional recurrence schedule (weekly on days specified), stored as a string. Unlike most task and calendar applications, however, the recurrence schedule will be used by a separate tool (in charteris-agent, phase 2) to create duplicate tasks for each date of recurrence. These duplicate tasks will need a "parent" field that points back to the original/master task that resulted in their generation. That master task will have a "master" boolean flag set, and will point to itself as its own parent.
  - The daily tool that creates duplicate recurrance tasks will run shortly after midnight, and look for any unarchived, master recurring tasks (master tasks with a recurrence schedule) where the recurrence matches today's date - and then create an uncompleted duplicate of that task with today's date as the due date.
- When editing a task that has a parent task, all fields EXCEPT for completion and archival status (those are specific to individual instances of a series) will also propagate to the parent task, *and* to any task that has that same parent as the task being edited.
- When editing a task that has a parent task (even if it's a master task), there should be a separate delete button that deletes the entire series - all task with the same parent task.
- One or more cards can be selected in the UX, indicated by a white border on the card in the UX
  - Since the same card can appear in multiple lists, it's important that selection apply to the specific card, not the underlying task. Edit operations made based off the selection will likely apply to the underlying tasks.
  - In the desktop interface, a single card is selected when the mouse hovers over it, unless the shift/control key is currently pressed - in which case the currently selected card stays selected
  - If control is pressed and a card is clicked, that card is added to the selection; if the shift key is pressed and a card is clicked, the selection is set to the range for cards (within the same list) from the original selection to the clicked card (in either direction).
  - If up/down arrow is pressed, the selection is set the next/previous card; if no card is currently selected, start with the first card in the first list in the Board section. If a card is already selected *and* the shift key was held down when the up/down arrow is pressed, we add the existing selection.
  - If the right/left arrow is pressed, the selection is moved to the first card of the next/previous list in any section
- Keyboard shortcuts - these apply to the current selection:
  - Enter - toggle completion of underlying tasks
  - Backspace - archive underlying tasks
  - Delete - delete underlying tasks (with prompt)
  - Left arrow (Board lists only) - add the card to the Today list on the Scheduling card (so it appears in both lists)
  - Right arrow (Today list only) - move the card from the Today list to the Next list
  - Right arrow (Next list only) - move the card from the Next list to the first list in the Board section
  - P - show a dropdown with priorities 1-4 (red, orange, yellow, blue), and apply that priority to underlying associated with the selection. The dropdown items should be selectable by hitting the 1-4 keys, too
  - @ - opens up a pre-focused text box where the user can either create a new label or auto-complete/select from existing labels

## Lists & Sections

- The three sections (Inbox, Planning, Board) are fixed and cannot be created, deleted, or renamed.
- The fixed lists — Draft (Inbox), Today (Planning), and Next (Planning) — cannot be deleted or renamed.
- Users can freely create, rename, reorder, and delete custom lists in the Board section only.

## Labels

- Labels are plain text tags with no color. They are used for categorization and filtering.

## Subtasks

- Subtasks are a simple persistent checklist stored on the task record (not separate task objects). Each subtask has a title and a completed boolean. Subtask completion state is persisted in the database.
- Subtasks propagate to parent and sibling tasks in a recurring series, just like other task fields (they are NOT instance-specific like completion/archive).

## Authentication & Security

- This is a single-user application — there are no user accounts, user management, or access control features.
- The web UI is protected by **HTTP Basic Auth** with a single password (no username required, or use a fixed username like "charteris").
- The REST API, WebSocket connections, and MCP server all require an **API token** passed as a query string parameter (`?token=<value>`). The token does not expire.
- Both the Basic Auth password and the API token are configured via **environment variables** (e.g., `CHARTERIS_UI_PASSWORD`, `CHARTERIS_API_TOKEN`).
- Database credentials are also environment variables.
- All secrets must be stored in a `.env` file (or `docker-compose.yml` environment block) and **excluded from git** via `.gitignore`.
