# Workbee User Guide

## Getting Started

Workbee is your personal task manager. To start the application, open a terminal in the application folder and run:
`npm run dev`

Then open your browser to `http://localhost:9229`.

## Usage Concepts

The top navigation bar gives you access to the main parts of the app:

1.  **Logs**: Your day-by-day journal/work log area.
2.  **Threads**: Follow-up threads with their own notes, worklog, linked tasks, links, and backlog folders.
3.  **Kanban**: Where you work.
4.  **Backlog**: Where you plan.
5.  **Notes**: Browse and edit notes attached to tasks and folders.
6.  **Reports**: Where you review.
7.  **Weekly**: Weekly status notes.
8.  **Settings**: App configuration, including the data directory.

---

### The Backlog (Planning)

The Backlog is the heart of your organization. It features a hierarchical tree of **Categories** on the left and a list of tasks on the right.

*   **Categories**: Create folders to organize your work (e.g., "Project Alpha", "Learning", "Chores").
    *   **Create**: Use the "New Category" button.
    *   **Nest**: Drag and drop categories to create sub-folders.
    *   **Edit**: Click the "Edit" (pencil) icon to change names or colors.
    *   **Label Notes**: Click the "Notes" icon on a category to store high-level information like meeting notes or specifications for that entire project.

*   **Creating Tasks**: Select a category and use the input box at the top to add a new task.
*   **Managing Tasks**:
    *   **Status**: Tasks start in `Backlog`. Move them to `Started` when you are ready to work on them.
    *   **Priority/Points**: Assign priority (Normal/Important/High) and Story Points (effort estimate) to help prioritize.

---

### The Kanban Board (doing)

This is your focused workspace. It only shows tasks that are relevant *now*.

*   **Started**: Tasks you have committed to doing but haven't actively picked up today.
*   **Doing**: The single task (or few tasks) you are working on *right now*.
*   **Done**: Tasks completed recently.

**Workflow**:
1.  Go to the **Backlog** and change a task's status to `Started`.
2.  Go to the **Kanban** board.
3.  Drag the task from `Started` to `Doing`.
4.  Click the task card to open the **Task Detail View**.

#### Task Detail View
Clicking any task opens a modal with powerful tools:
*   **Todos**: Add quick checklists (e.g., "Email Bob", "Fix bug").
*   **Logs**: Add timestamped updates (e.g., "Found the issue in server.js", "Waiting for reply"). This is crucial for tracking *what* you did and *when*.
*   **Notes**: Write long-form content with rich text formatting (bold, lists, code blocks).
*   **Links**: Add labeled external links such as tickets, docs, PRs, or reference pages.
*   **Threads**: See and open linked threads directly from the task.

---

### Threads

Threads are useful for follow-ups, email chains, or ongoing discussions that need their own notes and worklog without becoming a task themselves.

*   **Details**: Give the thread a title, description, status, links, and one or more backlog folders.
*   **Notes**: Keep separate notes for individual messages, summaries, or imported thread items.
*   **Tasks**: Link related tasks so thread context and execution stay connected.
*   **Logs**: Track progress or key updates over time.

---

### Settings

The Settings page lets you control where WorkerBee stores its JSON data files.

*   **Current Data Directory**: Shows the folder the desktop app is using right now.
*   **Check Folder**: Verifies the selected folder path before switching.
*   **Save & Switch**:
    *   If the folder already contains WorkerBee data, the app loads it immediately.
    *   If the folder is empty or missing, WorkerBee creates it and starts a fresh store there.
*   **Persistence**: The selected data directory is saved and used again after the app restarts.

---

### Reports (Reviewing)

The Reports page helps you see what you've accomplished.
*   **Date Range**: Select a start and end date.
*   **View**: See a timeline of all your **Logs** and a list of all **Completed Tasks** for that period.

## Themes

Workbee comes with several built-in themes to match your mood. Use the theme selector in the top right to switch between:
*   Midnight (Default Dark)
*   Graphite
*   Ocean
*   Forest
*   Light
*   ...and more.
