# Workbee Technical Overview

## Introduction
Workbee is a task management application designed for focused individual work. It emphasizes a distinction between "planning" (Backlog) and "doing" (Kanban), with robust time tracking and logging capabilities.

## Technical Architecture

### Stack
*   **Runtime**: [Node.js](https://nodejs.org/)
*   **Database**: JSON file store (`workbee.json`) for a self-contained, zero-configuration local database.
*   **API Framework**: [Express](https://expressjs.com/)
*   **Frontend**: [React](https://react.dev/) + [Vite](https://vitejs.dev/)
*   **Rich Text**: [Tiptap](https://tiptap.dev/) for note editing.

### Project Structure
*   **Root**: Contains server configuration (`server.js`, `database.js`), scripts (`Taskfile.yml`), and dependency definitions (`package.json`).
*   **`src/`**: React frontend source code.
    *   `src/components/`: Reusable UI components (Modals, Editor, Navigation).
    *   `src/pages/`: Main application views (Active, Backlog, Reports).
    *   `src/styles/`: Global CSS.
*   **`dist/`**: Production build artifacts (created after running `npm run build`).
*   **`workbee.json`**: Local data file.

## Data Model

The application uses a relational schema with the following core entities:

*   **Categories**: Hierarchical organization for tasks. Supports nesting (parent/child) and custom colors.
*   **Tasks**: The central unit of work.
    *   States: `BACKLOG`, `STARTED`, `DOING`, `DONE`.
    *   Attributes: Title, Description, Story Points, Priority (`NORMAL`, `IMPORTANT`, `HIGH`), Task Type (`MEETING`, `FOLLOW_UP`, etc.).
    *   Timing: Tracks `started_at`, `doing_at`, and `done_at` timestamps for automated reporting.
*   **Todos**: Lightweight checklist items attached to a task.
*   **Logs**: immutable work logs (timestamped entries) attached to a task. Used to track progress or updates over time.
*   **Notes**: Rich text documents attached to a task.
*   **Label Notes**: Rich text documents attached to a Category (e.g., "Meeting Notes" for a specific project).

## Development

### Prerequisites
*   Node.js installed.
*   [Task](https://taskfile.dev/) (optional, but recommended for running the `Taskfile.yml` commands).

### Running Locally
To start both the backend API and the frontend dev server concurrently:

```bash
# Using Task
task dev

# Or using npm directly
npm run dev
```

The app will generally run on:
*   **Frontend**: `http://localhost:9229`
*   **API**: `http://localhost:9339`

### Building for Production
```bash
# Using Task
task run
```
This builds the React frontend into `dist/` and starts the Node server in production mode, serving the static files.

## API Design
The backend exposes a RESTful API under `/api`.
*   `GET /api/tasks`: Fetch tasks, supports filtering by status or category.
*   `GET /api/categories`: Fetch category tree.
*   `GET /api/reports`: Time-range based log retrieval.
*   See `server.js` for full endpoint definitions.
