const Database = require('better-sqlite3');
const path = require('path');

const db = new Database('workbee.db', { verbose: console.log });

const columnExists = (table, column) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    return columns.some((c) => c.name === column);
};

const ensureColumn = (table, column, definition) => {
    if (columnExists(table, column)) return;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
};

// Create Tables
const createTables = () => {
    db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_id INTEGER,
            name TEXT NOT NULL,
            color TEXT,
            position INTEGER DEFAULT 0,
            archived INTEGER DEFAULT 0,
            FOREIGN KEY(parent_id) REFERENCES categories(id)
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER,
            title TEXT NOT NULL,
            description TEXT,
            url TEXT,
            task_type TEXT DEFAULT 'NONE', -- NONE, MEETING, FOLLOW_UP, ISSUE
            story_points INTEGER DEFAULT 0,
            priority TEXT DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH
            status TEXT DEFAULT 'BACKLOG', -- BACKLOG, STARTED, DOING, DONE
            board_position INTEGER DEFAULT 0, -- manual ordering within status lanes
            archived INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            started_at DATETIME,
            doing_at DATETIME,
            done_at DATETIME,
            FOREIGN KEY(category_id) REFERENCES categories(id)
        );

        CREATE TABLE IF NOT EXISTS todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER,
            text TEXT NOT NULL,
            completed INTEGER DEFAULT 0,
            FOREIGN KEY(task_id) REFERENCES tasks(id)
        );

        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER,
            content TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(task_id) REFERENCES tasks(id)
        );
        
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER,
            title TEXT,
            content TEXT,
            type TEXT DEFAULT 'text',
            FOREIGN KEY(task_id) REFERENCES tasks(id)
        );

        CREATE TABLE IF NOT EXISTS label_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER,
            title TEXT,
            content TEXT,
            type TEXT DEFAULT 'work_notes', -- email, meeting_notes, review_notes, work_notes
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(category_id) REFERENCES categories(id)
        );
    `);
};

createTables();

// Lightweight migrations for existing DBs
ensureColumn('categories', 'position', 'INTEGER DEFAULT 0');
ensureColumn('tasks', 'started_at', 'DATETIME');
ensureColumn('tasks', 'doing_at', 'DATETIME');
ensureColumn('tasks', 'done_at', 'DATETIME');
ensureColumn('tasks', 'story_points', 'INTEGER DEFAULT 0');
ensureColumn('tasks', 'priority', "TEXT DEFAULT 'MEDIUM'");
ensureColumn('tasks', 'board_position', 'INTEGER DEFAULT 0');
ensureColumn('tasks', 'task_type', "TEXT DEFAULT 'NONE'");
ensureColumn('notes', 'title', 'TEXT');
ensureColumn('label_notes', 'title', 'TEXT');

// Status migration (older builds used ACTIVE)
db.exec(`UPDATE tasks SET status = 'STARTED', started_at = COALESCE(started_at, CURRENT_TIMESTAMP) WHERE status = 'ACTIVE'`);
db.exec(`UPDATE tasks SET done_at = COALESCE(done_at, CURRENT_TIMESTAMP) WHERE status = 'DONE' AND done_at IS NULL`);

// Prepared Statements
const getCategories = db.prepare(
    'SELECT * FROM categories WHERE archived = 0 ORDER BY (parent_id IS NOT NULL), parent_id, position ASC, name COLLATE NOCASE ASC'
);
const insertCategory = db.prepare(
    'INSERT INTO categories (parent_id, name, color, position) VALUES (@parent_id, @name, @color, @position)'
);
const updateCategory = db.prepare(
    'UPDATE categories SET name = @name, color = @color, parent_id = @parent_id, position = @position WHERE id = @id'
);
const archiveCategory = db.prepare('UPDATE categories SET archived = 1 WHERE id = ?');

const selectTasksBase = `
    SELECT
        t.*,
        COUNT(td.id) AS todo_total,
        COALESCE(SUM(CASE WHEN td.completed = 1 THEN 1 ELSE 0 END), 0) AS todo_completed
    FROM tasks t
    LEFT JOIN todos td ON td.task_id = t.id
`;

const getAllTasks = db.prepare(`
    ${selectTasksBase}
    WHERE t.archived = 0
    GROUP BY t.id
    ORDER BY t.created_at DESC
`);
const getTasksByStatus = db.prepare(`
    ${selectTasksBase}
    WHERE t.status = ? AND t.archived = 0
    GROUP BY t.id
    ORDER BY t.board_position ASC, t.created_at DESC
`);
const getTasksByCategory = db.prepare(`
    ${selectTasksBase}
    WHERE t.category_id = ? AND t.archived = 0
    GROUP BY t.id
    ORDER BY t.created_at DESC
`);
const getTasksByCategoryWithDescendants = db.prepare(`
    WITH RECURSIVE subtree(id) AS (
        SELECT id FROM categories WHERE id = ? AND archived = 0
        UNION ALL
        SELECT c.id
        FROM categories c
        JOIN subtree s ON c.parent_id = s.id
        WHERE c.archived = 0
    )
    ${selectTasksBase}
    WHERE t.category_id IN (SELECT id FROM subtree) AND t.archived = 0
    GROUP BY t.id
    ORDER BY t.created_at DESC
`);
const getTask = db.prepare('SELECT * FROM tasks WHERE id = ?');
const createTask = db.prepare('INSERT INTO tasks (category_id, title, description, url) VALUES (@category_id, @title, @description, @url)');
const updateTaskStmt = db.prepare(
    `UPDATE tasks
     SET title = @title,
         description = @description,
         url = @url,
         task_type = @task_type,
         story_points = @story_points,
         priority = @priority,
         status = @status,
         board_position = @board_position,
         category_id = @category_id,
         started_at = @started_at,
         doing_at = @doing_at,
         done_at = @done_at
     WHERE id = @id`
);
const archiveTask = db.prepare('UPDATE tasks SET archived = 1 WHERE id = ?');
const archiveDoneTasksStmt = db.prepare("UPDATE tasks SET archived = 1 WHERE status = 'DONE' AND archived = 0");

const getTaskTodos = db.prepare('SELECT * FROM todos WHERE task_id = ?');
const addTodo = db.prepare('INSERT INTO todos (task_id, text) VALUES (@task_id, @text)');
const updateTodo = db.prepare('UPDATE todos SET completed = @completed, text = @text WHERE id = @id');
const deleteTodo = db.prepare('DELETE FROM todos WHERE id = ?');

const getTaskLogs = db.prepare('SELECT * FROM logs WHERE task_id = ? ORDER BY timestamp DESC');
const addLog = db.prepare('INSERT INTO logs (task_id, content) VALUES (@task_id, @content)');

const getTaskNotes = db.prepare('SELECT * FROM notes WHERE task_id = ? ORDER BY id DESC');
const addNote = db.prepare('INSERT INTO notes (task_id, title, content, type) VALUES (@task_id, @title, @content, @type)');
const updateNote = db.prepare('UPDATE notes SET title = @title, content = @content WHERE id = @id');
const deleteNote = db.prepare('DELETE FROM notes WHERE id = ?');

// Recursive archive helper (simple version)
const archiveCategoryRecursive = db.transaction((id) => {
    archiveCategory.run(id);
    // Archive tasks
    db.prepare('UPDATE tasks SET archived = 1 WHERE category_id = ?').run(id);
    // Find children
    const children = db.prepare('SELECT id FROM categories WHERE parent_id = ?').all(id);
    for (const child of children) {
        archiveCategoryRecursive(child.id); // Valid recursion in transaction? Yes.
    }
});

module.exports = {
    getCategories: () => getCategories.all(),
    createCategory: (parent_id, name, color) => {
        const nextPosRow = db
            .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM categories WHERE parent_id IS ? AND archived = 0')
            .get(parent_id);
        return insertCategory.run({ parent_id, name, color, position: nextPosRow?.next_pos ?? 0 });
    },
    updateCategory: (id, parent_id, name, color, position) => {
        const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
        const nextPosition = position ?? existing?.position ?? 0;
        return updateCategory.run({ id, parent_id, name, color, position: nextPosition });
    },
    reorderCategories: (parent_id, orderedIds) => {
        const stmt = db.prepare('UPDATE categories SET position = @position WHERE id = @id');
        const tx = db.transaction(() => {
            orderedIds.forEach((id, idx) => stmt.run({ id, position: idx }));
        });
        tx();
        return { ok: true };
    },
    reorderTasksInStatus: (status, orderedIds) => {
        const normalizedStatus = String(status || '').toUpperCase();
        const stmt = db.prepare('UPDATE tasks SET board_position = @position WHERE id = @id AND status = @status');
        const tx = db.transaction(() => {
            orderedIds.forEach((id, idx) => stmt.run({ id, position: idx, status: normalizedStatus }));
        });
        tx();
        return { ok: true };
    },
    archiveCategory: (id) => archiveCategoryRecursive(id),

    getAllTasks: () => getAllTasks.all(),
    getTasksByStatus: (status) => getTasksByStatus.all(status),
    getTasksByCategory: (id) => getTasksByCategory.all(id),
    getTasksByCategoryWithDescendants: (id) => getTasksByCategoryWithDescendants.all(id),
    getTask: (id) => getTask.get(id),
    createTask: (category_id, title, description, url) => createTask.run({ category_id, title, description, url }),
    updateTask: (id, category_id, title, description, url, status, story_points, priority, task_type, board_position) => {
        const existing = getTask.get(id);
        if (!existing) return null;

        let started_at = existing.started_at;
        let doing_at = existing.doing_at;
        let done_at = existing.done_at;
        let nextBoardPosition = existing.board_position ?? 0;

        if (status && status !== existing.status) {
            const now = new Date().toISOString();

            if (status === 'BACKLOG') {
                started_at = null;
                doing_at = null;
                done_at = null;
            } else if (status === 'STARTED') {
                started_at = now;
                doing_at = null;
                done_at = null;
            } else if (status === 'DOING') {
                started_at = started_at || now;
                doing_at = now;
                done_at = null;
            } else if (status === 'DONE') {
                started_at = started_at || now;
                doing_at = doing_at || now;
                done_at = now;
            }
        }

        const normalizedPriority = (priority ?? existing.priority ?? 'MEDIUM').toUpperCase();
        const normalizedStoryPoints =
            story_points === null || story_points === undefined || story_points === ''
                ? existing.story_points ?? 0
                : Number(story_points) || 0;
        const normalizedTaskTypeRaw = String(task_type ?? existing.task_type ?? 'NONE')
            .trim()
            .toUpperCase()
            .replaceAll(' ', '_');
        const normalizedTaskType = normalizedTaskTypeRaw ? normalizedTaskTypeRaw : 'NONE';

        if (typeof board_position === 'number' && Number.isFinite(board_position)) {
            nextBoardPosition = board_position;
        } else if (status && status !== existing.status) {
            if (['STARTED', 'DOING', 'DONE'].includes(status)) {
                const row = db
                    .prepare('SELECT COALESCE(MAX(board_position), -1) AS max_pos FROM tasks WHERE status = ? AND archived = 0')
                    .get(status);
                nextBoardPosition = (row?.max_pos ?? -1) + 1;
            }
        }

        return updateTaskStmt.run({
            id,
            category_id,
            title,
            description,
            url,
            story_points: normalizedStoryPoints,
            priority: normalizedPriority,
            status,
            task_type: normalizedTaskType,
            board_position: nextBoardPosition,
            started_at,
            doing_at,
            done_at
        });
    },
    archiveTask: (id) => archiveTask.run(id),
    archiveDoneTasks: () => archiveDoneTasksStmt.run(),

    getTaskTodos: (taskId) => getTaskTodos.all(taskId),
    addTodo: (task_id, text) => addTodo.run({ task_id, text }),
    updateTodo: (id, text, completed) => updateTodo.run({ id, text, completed: completed ? 1 : 0 }),
    deleteTodo: (id) => deleteTodo.run(id),

    getTaskLogs: (taskId) => getTaskLogs.all(taskId),
    addLog: (task_id, content) => addLog.run({ task_id, content }),

    getTaskNotes: (taskId) => getTaskNotes.all(taskId),
    addNote: (task_id, title, content, type) => addNote.run({ task_id, title, content, type }),
    updateNote: (id, title, content) => updateNote.run({ id, title, content }),
    deleteNote: (id) => deleteNote.run(id),

    getLogsByDateRange: (startDate, endDate) => {
        return db.prepare(`
            SELECT l.*, t.title as task_title, c.name as category_name 
            FROM logs l 
            JOIN tasks t ON l.task_id = t.id 
            LEFT JOIN categories c ON t.category_id = c.id 
            WHERE date(l.timestamp) BETWEEN date(?) AND date(?) 
            ORDER BY l.timestamp DESC
        `).all(startDate, endDate);
    },

    getTasksCompletedByDateRange: (startDate, endDate) => {
        return db.prepare(`
            SELECT
                t.*,
                c.name AS category_name,
                c.color AS category_color
            FROM tasks t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.done_at IS NOT NULL
              AND date(t.done_at) BETWEEN date(?) AND date(?)
            ORDER BY t.done_at DESC
        `).all(startDate, endDate);
    },

    getLabelNotes: (categoryId, type) => {
        if (type) {
            return db.prepare('SELECT * FROM label_notes WHERE category_id = ? AND type = ? ORDER BY updated_at DESC').all(categoryId, type);
        }
        return db.prepare('SELECT * FROM label_notes WHERE category_id = ? ORDER BY updated_at DESC').all(categoryId);
    },

    // We'll treat label notes as individual entries that can be edited.
    // Or should it be one note per type per category? 
    // The user said "I want to be able to dump the notes there... filter by type". So likely multiples.
    addLabelNote: (category_id, title, content, type) => {
        return db
            .prepare('INSERT INTO label_notes (category_id, title, content, type) VALUES (@category_id, @title, @content, @type)')
            .run({ category_id, title, content, type });
    },
    updateLabelNote: (id, title, content) => {
        return db
            .prepare('UPDATE label_notes SET title = @title, content = @content, updated_at = CURRENT_TIMESTAMP WHERE id = @id')
            .run({ id, title, content });
    },
    deleteLabelNote: (id) => db.prepare('DELETE FROM label_notes WHERE id = ?').run(id)
};
