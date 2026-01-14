const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./database');

const app = express();
const API_PORT = Number(process.env.API_PORT || 9339);
const WEB_PORT = Number(process.env.WEB_PORT || 9229);

app.use(cors());
app.use(bodyParser.json());

// Ensure DB schema/migrations are applied before serving requests.
db.init?.().catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});

// Helpful dev landing page (the UI is served by Vite during development)
if (process.env.NODE_ENV !== 'production') {
    app.get('/', (req, res) => {
        res.type('text').send(
            [
                'WorkerBee API server is running.',
                `Open the UI via the Vite dev server (http://localhost:${WEB_PORT}/).`,
                'API endpoints are under /api.'
            ].join('\n')
        );
    });
}

// API Endpoints
// Categories
app.get('/api/categories', async (req, res) => {
    try {
        const rows = await db.getCategories();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/categories', async (req, res) => {
    try {
        const { parent_id, name, color } = req.body;
        const result = await db.createCategory(parent_id, name, color);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/categories/reorder', async (req, res) => {
    try {
        const { parent_id, ordered_ids } = req.body;
        const result = await db.reorderCategories(parent_id ?? null, ordered_ids || []);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/categories/:id', async (req, res) => {
    try {
        const { parent_id, name, color, position } = req.body;
        const result = await db.updateCategory(req.params.id, parent_id, name, color, position);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/categories/:id', async (req, res) => {
    try {
        const result = await db.archiveCategory(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Label Notes (Category Notes)
app.get('/api/categories/:id/notes', async (req, res) => {
    try {
        const { type } = req.query;
        const rows = await db.getLabelNotes(req.params.id, type);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/categories/:id/notes', async (req, res) => {
    try {
        const { title, content, type } = req.body;
        const result = await db.addLabelNote(req.params.id, title, content, type);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/label_notes/:id', async (req, res) => {
    try {
        const row = await db.getLabelNote(req.params.id);
        if (!row) {
            return res.status(404).json({ error: 'Note not found' });
        }
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/label_notes/:id', async (req, res) => {
    try {
        const { title, content } = req.body;
        const result = await db.updateLabelNote(req.params.id, title, content);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/label_notes/:id', async (req, res) => {
    try {
        const result = await db.deleteLabelNote(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/label_notes/:id/archive', async (req, res) => {
    try {
        const result = await db.archiveLabelNote(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/label_notes/:id/unarchive', async (req, res) => {
    try {
        const result = await db.unarchiveLabelNote(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Tasks
app.get('/api/tasks', async (req, res) => {
    try {
        const { status, category_id } = req.query;
        let rows;
        if (status) {
            rows = await db.getTasksByStatus(status);
        } else if (category_id) {
            const includeDesc =
                req.query.include_descendants === '1' ||
                req.query.include_descendants === 'true' ||
                req.query.include_descendants === 'yes';
            rows = includeDesc
                ? await db.getTasksByCategoryWithDescendants(category_id)
                : await db.getTasksByCategory(category_id);
        } else {
            rows = await db.getAllTasks();
        }
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/tasks/:id', async (req, res) => {
    try {
        const row = await db.getTask(req.params.id);
        if (!row) {
            return res.status(404).json({ error: 'Task not found' });
        }
        const todos = await db.getTaskTodos(req.params.id);
        const logs = await db.getTaskLogs(req.params.id);
        const notes = await db.getTaskNotes(req.params.id);
        res.json({ ...row, todos, logs, notes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tasks', async (req, res) => {
    try {
        const { category_id, title, description, url } = req.body;
        const result = await db.createTask(category_id, title, description, url);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tasks/reorder', async (req, res) => {
    try {
        const { status, ordered_ids } = req.body || {};
        if (!status || !Array.isArray(ordered_ids)) {
            return res.status(400).json({ error: 'status and ordered_ids are required' });
        }
        const result = await db.reorderTasksInStatus(status, ordered_ids);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tasks/:id', async (req, res) => {
    try {
        const existing = await db.getTask(req.params.id);
        if (!existing) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const body = req.body || {};
        const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

        const category_id = has('category_id') ? body.category_id : existing.category_id;
        const title = has('title') ? body.title : existing.title;
        const description = has('description') ? body.description : existing.description;
        const url = has('url') ? body.url : existing.url;
        const status = has('status') ? body.status : existing.status;
        const story_points = has('story_points') ? body.story_points : existing.story_points;
        const priority = has('priority') ? body.priority : existing.priority;
        const task_type = has('task_type') ? body.task_type : existing.task_type;

        const result = await db.updateTask(
            req.params.id,
            category_id,
            title,
            description,
            url,
            status,
            story_points,
            priority,
            task_type
        );
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/tasks/:id', async (req, res) => {
    try {
        const result = await db.archiveTask(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tasks/archive_done', async (req, res) => {
    try {
        const result = await db.archiveDoneTasks();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Task Sub-resources (Todos, Logs, Notes)
app.post('/api/tasks/:id/todos', async (req, res) => {
    try {
        const { text } = req.body;
        const result = await db.addTodo(req.params.id, text);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/todos/:id', async (req, res) => {
    try {
        const { text, completed } = req.body;
        const result = await db.updateTodo(req.params.id, text, completed);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/todos/:id', async (req, res) => {
    try {
        const result = await db.deleteTodo(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tasks/:id/logs', async (req, res) => {
    try {
        const { content } = req.body;
        const result = await db.addLog(req.params.id, content);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tasks/:id/notes', async (req, res) => {
    try {
        const { title, content, type } = req.body;
        const result = await db.addNote(req.params.id, title, content, type);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/notes/:id', async (req, res) => {
    try {
        const { title, content } = req.body;
        const result = await db.updateNote(req.params.id, title, content);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/notes/:id', async (req, res) => {
    try {
        const result = await db.deleteNote(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reports (Get Logs)
app.get('/api/reports', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        // Default to last 7 days if not provided
        const end = endDate || new Date().toISOString().split('T')[0];
        const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const rows = await db.getLogsByDateRange(start, end);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/summary', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const end = endDate || new Date().toISOString().split('T')[0];
        const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const logs = await db.getLogsByDateRange(start, end);
        const completedTasks = await db.getTasksCompletedByDateRange(start, end);
        res.json({ startDate: start, endDate: end, logs, completedTasks });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Archived items (rarely used retrieval)
app.get('/api/archive', async (req, res) => {
    try {
        const { startDate, endDate, weeks } = req.query;

        const end =
            endDate ||
            new Date().toISOString().split('T')[0];

        const start =
            startDate ||
            (weeks
                ? new Date(Date.now() - Number(weeks) * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                : new Date(Date.now() - 4 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

        const [tasks, notes] = await Promise.all([
            db.getArchivedTasksByDateRange(start, end),
            db.getArchivedLabelNotesByDateRange(start, end),
        ]);

        res.json({ startDate: start, endDate: end, tasks, notes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Serve static files in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    // Express 5 + path-to-regexp no longer supports a bare "*" route.
    // Also avoid hijacking unknown `/api/*` routes (let them 404 instead).
    app.get(/^\/(?!api\b).*/, (req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
}

if (process.env.NODE_ENV === 'production') {
    app.listen(WEB_PORT, '0.0.0.0', () => {
        console.log(`Web server running on http://localhost:${WEB_PORT}`);
    });
}

if (process.env.NODE_ENV !== 'production' || API_PORT !== WEB_PORT) {
    app.listen(API_PORT, '0.0.0.0', () => {
        console.log(`API server running on http://localhost:${API_PORT}`);
        if (process.env.NODE_ENV !== 'production') {
            console.log(`Web UI (dev) should be at http://localhost:${WEB_PORT}/`);
        }
    });
}
