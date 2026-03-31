This is a comprehensive UX Technical Specification designed for a coding agent to build a high-fidelity, dark-mode task management dashboard.

---

# UX Technical Specification: "Charteris" Dashboard

## 1. Design Principles & Global Variables
The interface uses a modular, card-based architecture within three distinct functional sections. All dimensions, colors, and spacing must be implemented using **CSS Variables** at the root level for global consistency.

### Visual Variables
* **Backgrounds:**
    * `--bg-app`: `#000000` (Pure Black)
    * `--bg-section-inbox`: `#0D1B2A` (Deep Midnight Blue)
    * `--bg-section-scheduled`: `#1A1A1A` (Dark Charcoal)
    * `--bg-section-board`: `#102521` (Deep Forest Green)
    * `--bg-card`: `#121212` (Matte Black)
    * `--bg-card-hover`: `#1E1E1E`
* **Priorities (Top Border Colors):**
    * `--priority-high`: `#D90429` (Red)
    * `--priority-medium`: `#F77F00` (Orange)
    * `--priority-low`: `#FCBF49` (Yellow)
    * `--priority-info`: `#457B9D` (Blue)
* **Typography & Icons:**
    * `--text-primary`: `#FFFFFF` (100% opacity)
    * `--text-secondary`: `#A0A0A0` (Muted Grey)
    * `--icon-ui`: `#888888` (FontAwesome single-color)
* **Spacing & Radius:**
    * `--radius-section`: `12px` (Top corners only)
    * `--radius-card`: `8px` (All corners)
    * `--gap-main`: `16px` (Between sections)
    * `--gap-list`: `12px` (Between cards)
    * `--pad-card`: `12px`

---

## 2. Layout Architecture

### Desktop View (Horizontal)
The application is a full-height (`100vh`) flex container.
1.  **Inbox Section:** Fixed width of `320px`. Contains one vertical list.
2.  **Scheduled Section:** Fixed width of `640px`. Contains exactly two vertical lists side-by-side. Horizontal scrolling is disabled for this section.
3.  **Board Section:** `flex-grow: 1`. Occupies all remaining width. It houses a variable number of lists and allows horizontal scrolling (`overflow-x: auto`).

### Mobile View (Responsive)
* Sections stack vertically (`flex-direction: column`).
* All sections expand to `100%` width.
* Sections are toggled via the floating navigation bar at the bottom.

---

## 3. Component Specifications

### Section Containers
Each of the three main sections must have:
* **Header:** A container with a FontAwesome icon (e.g., `fa-inbox`, `fa-calendar-alt`, `fa-columns`), a Bold Title, and a right-aligned `fa-ellipsis-h` (More) menu button.
* **Vertical Scrolling:** Content within the section should scroll vertically if it exceeds viewport height. Scrollbars should be thin (`4px`) and colored `--icon-ui`.

### Vertical Lists
Lists act as containers for cards.
* **Width:** Fixed at `280px`.
* **Header:** List Title in `--text-primary` with a `fa-ellipsis-h` menu.
* **Footer:** A "Add a card" button at the bottom of every list featuring a `fa-plus` icon.

### Task Cards
Cards are the atomic unit of the UI.
* **Structure:**
    * **Priority Border:** A `3px` solid top border using the `--priority` variables.
    * **Checkbox:** A FontAwesome `fa-check-circle` (if completed) or a hidden `fa-circle` (on hover).
    * **Label:** The task text.
* **Interactions:**
    * **Hover State:** The card background shifts to `--bg-card-hover`. 
    * **Reveal Actions:** On hover (or tap), hidden utility icons must appear:
        * Left side: An empty checkbox icon (`fa-circle`).
        * Right side: A "Move to Scheduled" icon (`fa-arrow-left`) and a "Drag handle" icon (`fa-grip-vertical`).
* **Drag & Drop:** Cards must be visually prepared for reordering within lists and moving between sections.

---

## 4. Navigation & UI Controls
* **Floating Navigation:** A centered group of three buttons at the bottom of the screen.
    * Solid background (Dark Grey).
    * Icons: `fa-inbox`, `fa-calendar`, `fa-th-large`.
* **Icon Usage:** Use FontAwesome single-color icons for UI navigation and card actions. Avoid adding icons to list titles or card content unless explicitly user-provided to prevent visual clutter.

---

## 5. Implementation Notes for the Coding Agent
* **State Management:** Use a framework-agnostic approach to handle the "active" visibility of cards' hidden buttons.
* **Flexbox:** Ensure the "Board" section uses `align-items: flex-start` so that lists maintain their variable height and don't stretch to the bottom of the section.
* **Transitions:** Add a `200ms ease-in-out` transition for hover states on cards and buttons.
