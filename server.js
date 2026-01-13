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
app.get('/api/categories', (req, res) => {
    try {
        const rows = db.getCategories();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/categories', (req, res) => {
    try {
        const { parent_id, name, color } = req.body;
        const result = db.createCategory(parent_id, name, color);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/categories/:id', (req, res) => {
    try {
        const { parent_id, name, color, position } = req.body;
        const result = db.updateCategory(req.params.id, parent_id, name, color, position);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/categories/reorder', (req, res) => {
    try {
        const { parent_id, ordered_ids } = req.body;
        const result = db.reorderCategories(parent_id ?? null, ordered_ids || []);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/categories/:id', (req, res) => {
    try {
        const result = db.archiveCategory(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Label Notes (Category Notes)
app.get('/api/categories/:id/notes', (req, res) => {
    try {
        const { type } = req.query;
        const rows = db.getLabelNotes(req.params.id, type);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/categories/:id/notes', (req, res) => {
    try {
        const { title, content, type } = req.body;
        const result = db.addLabelNote(req.params.id, title, content, type);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/label_notes/:id', (req, res) => {
    try {
        const { title, content } = req.body;
        const result = db.updateLabelNote(req.params.id, title, content);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/label_notes/:id', (req, res) => {
    try {
        const result = db.deleteLabelNote(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Tasks
app.get('/api/tasks', (req, res) => {
    try {
        const { status, category_id } = req.query;
        let rows;
        if (status) {
            rows = db.getTasksByStatus(status);
        } else if (category_id) {
            const includeDesc =
                req.query.include_descendants === '1' ||
                req.query.include_descendants === 'true' ||
                req.query.include_descendants === 'yes';
            rows = includeDesc ? db.getTasksByCategoryWithDescendants(category_id) : db.getTasksByCategory(category_id);
        } else {
            rows = db.getAllTasks();
        }
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/tasks/:id', (req, res) => {
    try {
        const row = db.getTask(req.params.id);
        if (!row) {
            return res.status(404).json({ error: 'Task not found' });
        }
        const todos = db.getTaskTodos(req.params.id);
        const logs = db.getTaskLogs(req.params.id);
        const notes = db.getTaskNotes(req.params.id);
        res.json({ ...row, todos, logs, notes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tasks', (req, res) => {
    try {
        const { category_id, title, description, url } = req.body;
        const result = db.createTask(category_id, title, description, url);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tasks/reorder', (req, res) => {
    try {
        const { status, ordered_ids } = req.body || {};
        if (!status || !Array.isArray(ordered_ids)) {
            return res.status(400).json({ error: 'status and ordered_ids are required' });
        }
        const result = db.reorderTasksInStatus(status, ordered_ids);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tasks/:id', (req, res) => {
    try {
        const existing = db.getTask(req.params.id);
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

        const result = db.updateTask(
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

app.delete('/api/tasks/:id', (req, res) => {
    try {
        const result = db.archiveTask(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tasks/archive_done', (req, res) => {
    try {
        const result = db.archiveDoneTasks();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Task Sub-resources (Todos, Logs, Notes)
app.post('/api/tasks/:id/todos', (req, res) => {
    try {
        const { text } = req.body;
        const result = db.addTodo(req.params.id, text);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/todos/:id', (req, res) => {
    try {
        const { text, completed } = req.body;
        const result = db.updateTodo(req.params.id, text, completed);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/todos/:id', (req, res) => {
    try {
        const result = db.deleteTodo(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tasks/:id/logs', (req, res) => {
    try {
        const { content } = req.body;
        const result = db.addLog(req.params.id, content);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tasks/:id/notes', (req, res) => {
    try {
        const { title, content, type } = req.body;
        const result = db.addNote(req.params.id, title, content, type);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/notes/:id', (req, res) => {
    try {
        const { title, content } = req.body;
        const result = db.updateNote(req.params.id, title, content);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/notes/:id', (req, res) => {
    try {
        const result = db.deleteNote(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reports (Get Logs)
app.get('/api/reports', (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        // Default to last 7 days if not provided
        const end = endDate || new Date().toISOString().split('T')[0];
        const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const rows = db.getLogsByDateRange(start, end);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/summary', (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const end = endDate || new Date().toISOString().split('T')[0];
        const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const logs = db.getLogsByDateRange(start, end);
        const completedTasks = db.getTasksCompletedByDateRange(start, end);
        res.json({ startDate: start, endDate: end, logs, completedTasks });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Serve static files in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
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
