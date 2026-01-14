const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const DEFAULT_DB_FILE = path.join(__dirname, 'workbee.json');
const dbFilePath = process.env.DB_PATH || DEFAULT_DB_FILE;

const nowIso = () => new Date().toISOString();

const parseDateOnly = (value) => {
    const s = String(value || '').trim();
    if (!s) return null;
    // accept YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
};

const dateOnly = (isoOrDate) => parseDateOnly(isoOrDate) || '';

const inDateRange = (iso, startDate, endDate) => {
    if (!iso) return false;
    const d = dateOnly(iso);
    return d >= startDate && d <= endDate;
};

const normalizePriority = (value) => {
    const v = String(value ?? 'NORMAL')
        .trim()
        .toUpperCase();
    if (v === 'IMPORTANT' || v === 'HIGH' || v === 'NORMAL') return v;
    if (v === 'LOW' || v === 'MEDIUM') return 'NORMAL';
    return 'NORMAL';
};

const normalizeTaskType = (value) =>
    String(value ?? 'NONE')
        .trim()
        .toUpperCase()
        .replaceAll(' ', '_') || 'NONE';

const normalizeStoryPoints = (value, fallback) => {
    if (value === null || value === undefined || value === '') return fallback ?? 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback ?? 0;
};

const ensureDir = async (filePath) => {
    const dir = path.dirname(filePath);
    await fsp.mkdir(dir, { recursive: true });
};

const atomicWriteFile = async (filePath, data) => {
    await ensureDir(filePath);
    const tmpPath = `${filePath}.tmp`;
    await fsp.writeFile(tmpPath, data);
    try {
        await fsp.rename(tmpPath, filePath);
    } catch (err) {
        // Windows rename doesn't overwrite by default.
        if (err && (err.code === 'EEXIST' || err.code === 'EPERM' || err.code === 'ENOTEMPTY')) {
            await fsp.rm(filePath, { force: true });
            await fsp.rename(tmpPath, filePath);
            return;
        }
        throw err;
    }
};

const createEmptyState = () => ({
    meta: {
        version: 1,
        lastId: {
            categories: 0,
            tasks: 0,
            todos: 0,
            logs: 0,
            notes: 0,
            label_notes: 0,
        },
    },
    categories: [],
    tasks: [],
    todos: [],
    logs: [],
    notes: [],
    label_notes: [],
});

let state = null;
let initPromise = null;

// Simple in-process mutex (single-user app).
let writeQueue = Promise.resolve();
const withWriteLock = async (fn) => {
    const next = writeQueue.then(fn, fn);
    writeQueue = next.then(
        () => undefined,
        () => undefined
    );
    return next;
};

const getState = () => {
    if (!state) throw new Error('DB not initialized');
    return state;
};

const bumpId = (table) => {
    const st = getState();
    const current = Number(st.meta?.lastId?.[table] ?? 0);
    const next = current + 1;
    st.meta.lastId[table] = next;
    return next;
};

const persist = async () => {
    const st = getState();
    await atomicWriteFile(dbFilePath, JSON.stringify(st, null, 2));
};

const migrateInPlace = (st) => {
    // Ensure structure exists
    if (!st.meta) st.meta = createEmptyState().meta;
    if (!st.meta.lastId) st.meta.lastId = createEmptyState().meta.lastId;
    for (const k of Object.keys(createEmptyState().meta.lastId)) {
        if (typeof st.meta.lastId[k] !== 'number') st.meta.lastId[k] = 0;
    }
    for (const k of ['categories', 'tasks', 'todos', 'logs', 'notes', 'label_notes']) {
        if (!Array.isArray(st[k])) st[k] = [];
    }

    // Backfill defaults / legacy fields
    st.tasks.forEach((t) => {
        if (t.priority == null || String(t.priority).trim() === '') t.priority = 'NORMAL';
        t.priority = normalizePriority(t.priority);
        if (!t.task_type) t.task_type = 'NONE';
        t.task_type = normalizeTaskType(t.task_type);
        if (t.archived === undefined) t.archived = 0;
        if (t.archived && !t.archived_at) t.archived_at = nowIso();
        if (t.board_position === undefined || t.board_position === null) t.board_position = 0;
        if (t.story_points === undefined || t.story_points === null) t.story_points = 0;
        if (t.status === 'ACTIVE') {
            t.status = 'STARTED';
            if (!t.started_at) t.started_at = nowIso();
        }
        if (t.status === 'DONE' && !t.done_at) t.done_at = nowIso();
    });

    st.label_notes.forEach((n) => {
        if (n.archived === undefined) n.archived = 0;
        if (n.archived && !n.archived_at) n.archived_at = nowIso();
        if (!n.created_at) n.created_at = nowIso();
        if (!n.updated_at) n.updated_at = n.created_at;
        if (!n.type) n.type = 'work_notes';
    });

    // Recompute lastId based on existing data
    const maxId = (arr) => arr.reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0);
    st.meta.lastId.categories = Math.max(st.meta.lastId.categories, maxId(st.categories));
    st.meta.lastId.tasks = Math.max(st.meta.lastId.tasks, maxId(st.tasks));
    st.meta.lastId.todos = Math.max(st.meta.lastId.todos, maxId(st.todos));
    st.meta.lastId.logs = Math.max(st.meta.lastId.logs, maxId(st.logs));
    st.meta.lastId.notes = Math.max(st.meta.lastId.notes, maxId(st.notes));
    st.meta.lastId.label_notes = Math.max(st.meta.lastId.label_notes, maxId(st.label_notes));

    return st;
};

const init = async () => {
    if (initPromise) return initPromise;
    initPromise = (async () => {
        let loaded = null;
        if (fs.existsSync(dbFilePath)) {
            const raw = await fsp.readFile(dbFilePath, 'utf8');
            loaded = JSON.parse(raw);
        } else {
            loaded = createEmptyState();
        }
        state = migrateInPlace(loaded);
        await persist();
    })();
    return initPromise;
};

const computeTodoStats = (st) => {
    const byTaskId = new Map();
    st.todos.forEach((td) => {
        if (!td || td.task_id == null) return;
        const taskId = Number(td.task_id);
        if (!Number.isFinite(taskId)) return;
        const entry = byTaskId.get(taskId) || { total: 0, completed: 0 };
        entry.total += 1;
        if (td.completed) entry.completed += 1;
        byTaskId.set(taskId, entry);
    });
    return byTaskId;
};

const taskWithComputedFields = (t, todoStats) => {
    const stats = todoStats.get(Number(t.id)) || { total: 0, completed: 0 };
    return { ...t, todo_total: stats.total, todo_completed: stats.completed };
};

const sortTasksDefault = (a, b) => {
    const ad = String(a?.created_at || '');
    const bd = String(b?.created_at || '');
    return bd.localeCompare(ad);
};

const sortTasksByBoardPosition = (a, b) => {
    const ap = Number(a?.board_position ?? 0);
    const bp = Number(b?.board_position ?? 0);
    if (ap !== bp) return ap - bp;
    return sortTasksDefault(a, b);
};

const getDescendantCategoryIds = (st, rootId) => {
    const root = Number(rootId);
    if (!Number.isFinite(root)) return [];
    const childrenByParent = new Map();
    st.categories.forEach((c) => {
        if (!c || c.archived) return;
        const pid = c.parent_id ?? null;
        const list = childrenByParent.get(pid) || [];
        list.push(c.id);
        childrenByParent.set(pid, list);
    });

    const out = [];
    const stack = [root];
    const seen = new Set();
    while (stack.length) {
        const id = stack.pop();
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
        const kids = childrenByParent.get(id) || [];
        kids.forEach((kid) => stack.push(kid));
    }
    return out;
};

module.exports = {
    init,

    // Categories
    getCategories: async () => {
        const st = getState();
        const categories = st.categories
            .filter((c) => !c.archived)
            .map((c) => ({ ...c }));

        const directCounts = new Map();
        st.tasks.forEach((t) => {
            if (t.archived) return;
            const categoryId = Number(t.category_id);
            if (!Number.isFinite(categoryId) || categoryId <= 0) return;
            directCounts.set(categoryId, (directCounts.get(categoryId) || 0) + 1);
        });

        const categoryById = new Map();
        const childrenByParent = new Map();
        categories.forEach((c) => {
            const id = Number(c.id);
            categoryById.set(id, c);
            const parentId = c.parent_id ?? null;
            if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
            childrenByParent.get(parentId).push(id);
        });

        const totalCounts = new Map();
        const visiting = new Set();
        const computeTotal = (categoryId) => {
            if (totalCounts.has(categoryId)) return totalCounts.get(categoryId);
            if (visiting.has(categoryId)) return directCounts.get(categoryId) || 0;
            visiting.add(categoryId);
            const direct = directCounts.get(categoryId) || 0;
            const children = childrenByParent.get(categoryId) || [];
            const total = children.reduce((sum, childId) => sum + computeTotal(childId), direct);
            totalCounts.set(categoryId, total);
            visiting.delete(categoryId);
            return total;
        };

        categories.forEach((c) => {
            const id = Number(c.id);
            c.task_count = directCounts.get(id) || 0;
            c.task_count_total = computeTotal(id);
        });

        return categories
            .sort((a, b) => {
                const ap = a.parent_id == null ? 0 : 1;
                const bp = b.parent_id == null ? 0 : 1;
                if (ap !== bp) return ap - bp;
                const pidA = a.parent_id ?? -1;
                const pidB = b.parent_id ?? -1;
                if (pidA !== pidB) return pidA - pidB;
                const posA = Number(a.position ?? 0);
                const posB = Number(b.position ?? 0);
                if (posA !== posB) return posA - posB;
                return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
            });
    },

    createCategory: async (parent_id, name, color) => {
        return withWriteLock(async () => {
            const st = getState();
            const siblings = st.categories.filter((c) => !c.archived && (c.parent_id ?? null) === (parent_id ?? null));
            const nextPos = siblings.reduce((m, c) => Math.max(m, Number(c.position ?? 0)), -1) + 1;
            const id = bumpId('categories');
            st.categories.push({
                id,
                parent_id: parent_id ?? null,
                name,
                color: color ?? null,
                position: nextPos,
                archived: 0,
            });
            await persist();
            return { changes: 1, lastInsertRowid: id };
        });
    },

    updateCategory: async (id, parent_id, name, color, position) => {
        return withWriteLock(async () => {
            const st = getState();
            const cat = st.categories.find((c) => Number(c.id) === Number(id));
            if (!cat) return { changes: 0 };
            cat.parent_id = parent_id ?? null;
            cat.name = name;
            cat.color = color ?? null;
            if (position !== undefined && position !== null) cat.position = position;
            await persist();
            return { changes: 1 };
        });
    },

    reorderCategories: async (parent_id, orderedIds) => {
        return withWriteLock(async () => {
            const st = getState();
            const ids = new Set(orderedIds.map((x) => Number(x)));
            orderedIds.forEach((rawId, idx) => {
                const id = Number(rawId);
                const cat = st.categories.find((c) => Number(c.id) === id);
                if (!cat) return;
                if ((cat.parent_id ?? null) !== (parent_id ?? null)) return;
                cat.position = idx;
            });
            // keep any non-mentioned siblings at end in stable order
            st.categories.forEach((c) => {
                if ((c.parent_id ?? null) !== (parent_id ?? null)) return;
                if (c.archived) return;
                if (ids.has(Number(c.id))) return;
                // leave position as-is
            });
            await persist();
            return { ok: true };
        });
    },

    archiveCategory: async (id) => {
        return withWriteLock(async () => {
            const st = getState();
            const archiveRecursive = (categoryId) => {
                const cat = st.categories.find((c) => Number(c.id) === Number(categoryId));
                if (!cat) return;
                cat.archived = 1;
                // archive tasks and notes in this category
                st.tasks.forEach((t) => {
                    if (Number(t.category_id) !== Number(categoryId)) return;
                    t.archived = 1;
                    if (!t.archived_at) t.archived_at = nowIso();
                });
                st.label_notes.forEach((n) => {
                    if (Number(n.category_id) !== Number(categoryId)) return;
                    n.archived = 1;
                    if (!n.archived_at) n.archived_at = nowIso();
                });
                st.categories.forEach((c) => {
                    if (Number(c.parent_id) === Number(categoryId)) archiveRecursive(c.id);
                });
            };
            archiveRecursive(id);
            await persist();
            return { ok: true };
        });
    },

    // Tasks
    getAllTasks: async () => {
        const st = getState();
        const todoStats = computeTodoStats(st);
        return st.tasks
            .filter((t) => !t.archived)
            .map((t) => taskWithComputedFields(t, todoStats))
            .sort(sortTasksDefault);
    },

    getTasksByStatus: async (status) => {
        const st = getState();
        const todoStats = computeTodoStats(st);
        const s = String(status || '').toUpperCase();
        return st.tasks
            .filter((t) => !t.archived && String(t.status || '').toUpperCase() === s)
            .map((t) => taskWithComputedFields(t, todoStats))
            .sort(sortTasksByBoardPosition);
    },

    getTasksByCategory: async (id) => {
        const st = getState();
        const todoStats = computeTodoStats(st);
        const cid = Number(id);
        return st.tasks
            .filter((t) => !t.archived && Number(t.category_id) === cid)
            .map((t) => taskWithComputedFields(t, todoStats))
            .sort(sortTasksDefault);
    },

    getTasksByCategoryWithDescendants: async (id) => {
        const st = getState();
        const todoStats = computeTodoStats(st);
        const ids = new Set(getDescendantCategoryIds(st, id));
        return st.tasks
            .filter((t) => !t.archived && ids.has(Number(t.category_id)))
            .map((t) => taskWithComputedFields(t, todoStats))
            .sort(sortTasksDefault);
    },

    getTask: async (id) => {
        const st = getState();
        return st.tasks.find((t) => Number(t.id) === Number(id)) || null;
    },

    createTask: async (category_id, title, description, url) => {
        return withWriteLock(async () => {
            const st = getState();
            const id = bumpId('tasks');
            st.tasks.push({
                id,
                category_id: category_id ?? null,
                title,
                description: description ?? null,
                url: url ?? null,
                task_type: 'NONE',
                story_points: 0,
                priority: 'NORMAL',
                status: 'BACKLOG',
                board_position: 0,
                archived: 0,
                archived_at: null,
                created_at: nowIso(),
                started_at: null,
                doing_at: null,
                done_at: null,
            });
            await persist();
            return { changes: 1, lastInsertRowid: id };
        });
    },

    updateTask: async (id, category_id, title, description, url, status, story_points, priority, task_type, board_position) => {
        return withWriteLock(async () => {
            const st = getState();
            const task = st.tasks.find((t) => Number(t.id) === Number(id));
            if (!task) return null;

            const nextStatus = String(status ?? task.status ?? 'BACKLOG').toUpperCase();
            const existingStatus = String(task.status ?? 'BACKLOG').toUpperCase();

            let started_at = task.started_at;
            let doing_at = task.doing_at;
            let done_at = task.done_at;

            if (nextStatus && nextStatus !== existingStatus) {
                const now = nowIso();
                if (nextStatus === 'BACKLOG') {
                    started_at = null;
                    doing_at = null;
                    done_at = null;
                } else if (nextStatus === 'STARTED') {
                    started_at = now;
                    doing_at = null;
                    done_at = null;
                } else if (nextStatus === 'DOING') {
                    started_at = started_at || now;
                    doing_at = now;
                    done_at = null;
                } else if (nextStatus === 'DONE') {
                    started_at = started_at || now;
                    doing_at = doing_at || now;
                    done_at = now;
                }
            }

            let nextBoardPosition = task.board_position ?? 0;
            if (typeof board_position === 'number' && Number.isFinite(board_position)) {
                nextBoardPosition = board_position;
            } else if (nextStatus && nextStatus !== existingStatus) {
                if (['STARTED', 'DOING', 'DONE'].includes(nextStatus)) {
                    const max = st.tasks
                        .filter((t) => !t.archived && String(t.status || '').toUpperCase() === nextStatus)
                        .reduce((m, t) => Math.max(m, Number(t.board_position ?? 0)), -1);
                    nextBoardPosition = max + 1;
                }
            }

            task.category_id = category_id ?? null;
            task.title = title;
            task.description = description ?? null;
            task.url = url ?? null;
            task.status = nextStatus;
            task.story_points = normalizeStoryPoints(story_points, task.story_points ?? 0);
            task.priority = normalizePriority(priority ?? task.priority ?? 'NORMAL');
            task.task_type = normalizeTaskType(task_type ?? task.task_type ?? 'NONE');
            task.board_position = nextBoardPosition;
            task.started_at = started_at;
            task.doing_at = doing_at;
            task.done_at = done_at;

            await persist();
            return { changes: 1 };
        });
    },

    reorderTasksInStatus: async (status, orderedIds) => {
        return withWriteLock(async () => {
            const st = getState();
            const s = String(status || '').toUpperCase();
            orderedIds.forEach((rawId, idx) => {
                const id = Number(rawId);
                const task = st.tasks.find((t) => Number(t.id) === id);
                if (!task) return;
                if (task.archived) return;
                if (String(task.status || '').toUpperCase() !== s) return;
                task.board_position = idx;
            });
            await persist();
            return { ok: true };
        });
    },

    archiveTask: async (id) => {
        return withWriteLock(async () => {
            const st = getState();
            const task = st.tasks.find((t) => Number(t.id) === Number(id));
            if (!task) return { changes: 0 };
            task.archived = 1;
            if (!task.archived_at) task.archived_at = nowIso();
            await persist();
            return { changes: 1 };
        });
    },

    archiveDoneTasks: async () => {
        return withWriteLock(async () => {
            const st = getState();
            let changes = 0;
            st.tasks.forEach((t) => {
                if (t.archived) return;
                if (String(t.status || '').toUpperCase() !== 'DONE') return;
                t.archived = 1;
                t.archived_at = nowIso();
                changes += 1;
            });
            await persist();
            return { changes };
        });
    },

    // Todos
    getTaskTodos: async (taskId) => {
        const st = getState();
        const id = Number(taskId);
        return st.todos.filter((td) => Number(td.task_id) === id);
    },
    addTodo: async (task_id, text) => {
        return withWriteLock(async () => {
            const st = getState();
            const id = bumpId('todos');
            st.todos.push({ id, task_id: Number(task_id), text, completed: 0 });
            await persist();
            return { changes: 1, lastInsertRowid: id };
        });
    },
    updateTodo: async (id, text, completed) => {
        return withWriteLock(async () => {
            const st = getState();
            const todo = st.todos.find((td) => Number(td.id) === Number(id));
            if (!todo) return { changes: 0 };
            todo.text = text;
            todo.completed = completed ? 1 : 0;
            await persist();
            return { changes: 1 };
        });
    },
    deleteTodo: async (id) => {
        return withWriteLock(async () => {
            const st = getState();
            const before = st.todos.length;
            st.todos = st.todos.filter((td) => Number(td.id) !== Number(id));
            const changes = before - st.todos.length;
            await persist();
            return { changes };
        });
    },

    // Logs
    getTaskLogs: async (taskId) => {
        const st = getState();
        const id = Number(taskId);
        return st.logs
            .filter((l) => Number(l.task_id) === id)
            .slice()
            .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    },
    addLog: async (task_id, content) => {
        return withWriteLock(async () => {
            const st = getState();
            const id = bumpId('logs');
            st.logs.push({ id, task_id: Number(task_id), content: content ?? null, timestamp: nowIso() });
            await persist();
            return { changes: 1, lastInsertRowid: id };
        });
    },

    // Task notes (different from label_notes)
    getTaskNotes: async (taskId) => {
        const st = getState();
        const id = Number(taskId);
        return st.notes
            .filter((n) => Number(n.task_id) === id)
            .slice()
            .sort((a, b) => Number(b.id) - Number(a.id));
    },
    addNote: async (task_id, title, content, type) => {
        return withWriteLock(async () => {
            const st = getState();
            const id = bumpId('notes');
            st.notes.push({
                id,
                task_id: Number(task_id),
                title: title ?? null,
                content: content ?? null,
                type: type ?? 'text',
            });
            await persist();
            return { changes: 1, lastInsertRowid: id };
        });
    },
    updateNote: async (id, title, content) => {
        return withWriteLock(async () => {
            const st = getState();
            const note = st.notes.find((n) => Number(n.id) === Number(id));
            if (!note) return { changes: 0 };
            note.title = title ?? null;
            note.content = content ?? null;
            await persist();
            return { changes: 1 };
        });
    },
    deleteNote: async (id) => {
        return withWriteLock(async () => {
            const st = getState();
            const before = st.notes.length;
            st.notes = st.notes.filter((n) => Number(n.id) !== Number(id));
            const changes = before - st.notes.length;
            await persist();
            return { changes };
        });
    },

    // Label notes (Obsidian-like notes)
    getLabelNotes: async (categoryId, type) => {
        const st = getState();
        const cid = Number(categoryId);
        const wantType = type ? String(type) : null;
        return st.label_notes
            .filter((n) => !n.archived && Number(n.category_id) === cid && (!wantType || String(n.type) === wantType))
            .slice()
            .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    },
    getLabelNote: async (id) => {
        const st = getState();
        return st.label_notes.find((n) => Number(n.id) === Number(id)) || null;
    },
    addLabelNote: async (category_id, title, content, type) => {
        return withWriteLock(async () => {
            const st = getState();
            const id = bumpId('label_notes');
            const ts = nowIso();
            st.label_notes.push({
                id,
                category_id: Number(category_id),
                title: title ?? null,
                content: content ?? null,
                type: type ?? 'work_notes',
                created_at: ts,
                updated_at: ts,
                archived: 0,
                archived_at: null,
            });
            await persist();
            return { changes: 1, lastInsertRowid: id };
        });
    },
    updateLabelNote: async (id, title, content) => {
        return withWriteLock(async () => {
            const st = getState();
            const note = st.label_notes.find((n) => Number(n.id) === Number(id));
            if (!note) return { changes: 0 };
            note.title = title ?? null;
            note.content = content ?? null;
            note.updated_at = nowIso();
            await persist();
            return { changes: 1 };
        });
    },
    deleteLabelNote: async (id) => {
        return withWriteLock(async () => {
            const st = getState();
            const before = st.label_notes.length;
            st.label_notes = st.label_notes.filter((n) => Number(n.id) !== Number(id));
            const changes = before - st.label_notes.length;
            await persist();
            return { changes };
        });
    },
    archiveLabelNote: async (id) => {
        return withWriteLock(async () => {
            const st = getState();
            const note = st.label_notes.find((n) => Number(n.id) === Number(id));
            if (!note) return { changes: 0 };
            note.archived = 1;
            if (!note.archived_at) note.archived_at = nowIso();
            await persist();
            return { changes: 1 };
        });
    },
    unarchiveLabelNote: async (id) => {
        return withWriteLock(async () => {
            const st = getState();
            const note = st.label_notes.find((n) => Number(n.id) === Number(id));
            if (!note) return { changes: 0 };
            note.archived = 0;
            await persist();
            return { changes: 1 };
        });
    },

    // Reports / archive
    getLogsByDateRange: async (startDate, endDate) => {
        const st = getState();
        const start = parseDateOnly(startDate);
        const end = parseDateOnly(endDate);
        if (!start || !end) return [];

        const taskById = new Map(st.tasks.map((t) => [Number(t.id), t]));
        const catById = new Map(st.categories.map((c) => [Number(c.id), c]));

        return st.logs
            .filter((l) => inDateRange(l.timestamp, start, end))
            .slice()
            .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
            .map((l) => {
                const task = taskById.get(Number(l.task_id));
                const cat = task ? catById.get(Number(task.category_id)) : null;
                return {
                    ...l,
                    task_title: task?.title ?? null,
                    category_name: cat?.name ?? null,
                };
            });
    },

    getTasksCompletedByDateRange: async (startDate, endDate) => {
        const st = getState();
        const start = parseDateOnly(startDate);
        const end = parseDateOnly(endDate);
        if (!start || !end) return [];

        const catById = new Map(st.categories.map((c) => [Number(c.id), c]));
        return st.tasks
            .filter((t) => t.done_at && inDateRange(t.done_at, start, end))
            .slice()
            .sort((a, b) => String(b.done_at || '').localeCompare(String(a.done_at || '')))
            .map((t) => {
                const cat = catById.get(Number(t.category_id));
                return { ...t, category_name: cat?.name ?? null, category_color: cat?.color ?? null };
            });
    },

    getArchivedTasksByDateRange: async (startDate, endDate) => {
        const st = getState();
        const start = parseDateOnly(startDate);
        const end = parseDateOnly(endDate);
        if (!start || !end) return [];
        return st.tasks
            .filter((t) => t.archived && t.archived_at && inDateRange(t.archived_at, start, end))
            .slice()
            .sort((a, b) => String(b.archived_at || '').localeCompare(String(a.archived_at || '')));
    },

    getArchivedLabelNotesByDateRange: async (startDate, endDate) => {
        const st = getState();
        const start = parseDateOnly(startDate);
        const end = parseDateOnly(endDate);
        if (!start || !end) return [];
        const catById = new Map(st.categories.map((c) => [Number(c.id), c]));
        return st.label_notes
            .filter((n) => n.archived && n.archived_at && inDateRange(n.archived_at, start, end))
            .slice()
            .sort((a, b) => String(b.archived_at || '').localeCompare(String(a.archived_at || '')))
            .map((n) => {
                const cat = catById.get(Number(n.category_id));
                return { ...n, category_name: cat?.name ?? null, category_color: cat?.color ?? null };
            });
    },
};
