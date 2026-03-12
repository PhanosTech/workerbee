import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';

export interface Category {
    id: number;
    parent_id: number | null;
    name: string;
    color: string | null;
    position: number;
    archived: number;
    // Computed fields
    task_count?: number;
    task_count_total?: number;
}

export interface Task {
    id: number;
    category_id: number | null;
    title: string;
    description: string | null;
    url: string | null;
    task_type: string;
    story_points: number;
    priority: string;
    status: string;
    board_position: number;
    archived: number;
    archived_at: string | null;
    created_at: string;
    started_at: string | null;
    doing_at: string | null;
    done_at: string | null;
    updated_at?: string;
    // Computed fields
    todo_total?: number;
    todo_completed?: number;
    category_name?: string | null;
    category_color?: string | null;
}

export interface Todo {
    id: number;
    task_id: number;
    text: string;
    completed: number;
    position: number;
}

export interface Log {
    id: number;
    task_id: number;
    content: string | null;
    timestamp: string;
    // Computed for reports
    task_title?: string | null;
    category_name?: string | null;
}

export interface Note {
    id: number;
    task_id: number;
    title: string | null;
    content: string | null;
    type: string;
}

export interface LabelNote {
    id: number;
    category_id: number;
    title: string | null;
    content: string | null;
    type: string;
    created_at: string;
    updated_at: string;
    archived: number;
    archived_at: string | null;
    // Computed for reports
    category_name?: string | null;
    category_color?: string | null;
}

export interface WeeklyNote {
    id: number;
    week_start: string;
    content: string;
    created_at: string;
    updated_at: string;
}

export interface JournalEntry {
    id: number;
    date: string;
    content: string;
    created_at: string;
    updated_at: string;
}

export interface Topic {
    id: number;
    title: string;
    description: string;
    status: string;
    tags: string;
    archived: number;
    created_at: string;
    updated_at: string;
}

export interface TopicTodo {
    id: number;
    topic_id: number;
    text: string;
    completed: number;
    created_at: string;
}

export interface TopicLog {
    id: number;
    topic_id: number;
    content: string | null;
    timestamp: string;
    // Computed for reports
    topic_title?: string | null;
}

export interface TopicNote {
    id: number;
    topic_id: number;
    title: string | null;
    content: string | null;
    type: string;
    created_at: string;
    updated_at?: string;
}

export interface TaskTopic {
    id: number;
    task_id: number;
    topic_id: number;
}

export interface LastId {
    categories: number;
    tasks: number;
    todos: number;
    logs: number;
    notes: number;
    label_notes: number;
    weekly_notes: number;
    journal_entries: number;
    topics: number;
    topic_todos: number;
    topic_logs: number;
    topic_notes: number;
    task_topics: number;
}

export interface Meta {
    version: number;
    lastId: LastId;
}

export interface AppState {
    meta: Meta;
    categories: Category[];
    tasks: Task[];
    todos: Todo[];
    logs: Log[];
    notes: Note[];
    label_notes: LabelNote[];
    weekly_notes: WeeklyNote[];
    journal_entries: JournalEntry[];
    topics: Topic[];
    topic_todos: TopicTodo[];
    topic_logs: TopicLog[];
    topic_notes: TopicNote[];
    task_topics: TaskTopic[];
}

const getDbDirPath = (): string => {
    return process.env.DB_PATH || path.join(__dirname, 'workbee_data');
};

const nowIso = (): string => new Date().toISOString();

const parseDateOnly = (value: string | null | undefined): string | null => {
    const s = String(value || '').trim();
    if (!s) return null;
    // accept YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
};

const dateOnly = (isoOrDate: string | null | undefined): string => parseDateOnly(isoOrDate) || '';

const inDateRange = (iso: string | null | undefined, startDate: string, endDate: string): boolean => {
    if (!iso) return false;
    const d = dateOnly(iso);
    return d >= startDate && d <= endDate;
};

const utcDateFromDateOnly = (value: string | null): Date | null => {
    const s = String(value || '').trim();
    const match = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return new Date(Date.UTC(year, month - 1, day));
};

// ISO week start (Monday) for a given YYYY-MM-DD.
const weekStartDateOnly = (dateStr: string): string | null => {
    const d = utcDateFromDateOnly(parseDateOnly(dateStr));
    if (!d) return null;
    const day = d.getUTCDay(); // 0=Sun, 1=Mon...
    const daysSinceMonday = (day + 6) % 7;
    d.setUTCDate(d.getUTCDate() - daysSinceMonday);
    return d.toISOString().split('T')[0];
};

const normalizePriority = (value: string | null | undefined): string => {
    const v = String(value ?? 'NORMAL')
        .trim()
        .toUpperCase();
    if (v === 'IMPORTANT' || v === 'HIGH' || v === 'NORMAL') return v;
    if (v === 'LOW' || v === 'MEDIUM') return 'NORMAL';
    return 'NORMAL';
};

const normalizeTaskType = (value: string | null | undefined): string =>
    String(value ?? 'NONE')
        .trim()
        .toUpperCase()
        .replaceAll(' ', '_') || 'NONE';

const normalizeStoryPoints = (value: any, fallback: number): number => {
    if (value === null || value === undefined || value === '') return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const ensureDir = async (filePath: string): Promise<void> => {
    const dir = path.dirname(filePath);
    await fsp.mkdir(dir, { recursive: true });
};

const atomicWriteFile = async (filePath: string, data: string): Promise<void> => {
    await ensureDir(filePath);
    const tmpPath = `${filePath}.tmp`;
    await fsp.writeFile(tmpPath, data);
    try {
        await fsp.rename(tmpPath, filePath);
    } catch (err: any) {
        // Windows rename doesn't overwrite by default.
        if (err && (err.code === 'EEXIST' || err.code === 'EPERM' || err.code === 'ENOTEMPTY')) {
            await fsp.rm(filePath, { force: true });
            await fsp.rename(tmpPath, filePath);
            return;
        }
        throw err;
    }
};

const createEmptyState = (): AppState => ({
    meta: {
        version: 1,
        lastId: {
            categories: 0,
            tasks: 0,
            todos: 0,
            logs: 0,
            notes: 0,
            label_notes: 0,
            weekly_notes: 0,
            journal_entries: 0,
            topics: 0,
            topic_todos: 0,
            topic_logs: 0,
            topic_notes: 0,
            task_topics: 0,
        },
    },
    categories: [],
    tasks: [],
    todos: [],
    logs: [],
    notes: [],
    label_notes: [],
    weekly_notes: [],
    journal_entries: [],
    topics: [],
    topic_todos: [],
    topic_logs: [],
    topic_notes: [],
    task_topics: [],
});

let state: AppState | null = null;
let initPromise: Promise<void> | null = null;

// Simple in-process mutex (single-user app).
let writeQueue = Promise.resolve();
const withWriteLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    const next = writeQueue.then(fn, fn);
    writeQueue = next.then(
        () => undefined,
        () => undefined
    ) as Promise<void>;
    return next;
};

const getState = (): AppState => {
    if (!state) throw new Error('DB not initialized');
    return state;
};

const bumpId = (table: keyof LastId): number => {
    const st = getState();
    const current = Number(st.meta.lastId[table] ?? 0);
    const next = current + 1;
    st.meta.lastId[table] = next;
    return next;
};

const persist = async (): Promise<void> => {
    const st = getState();
    const dbDirPath = getDbDirPath();
    await fsp.mkdir(dbDirPath, { recursive: true });
    for (const key of Object.keys(st) as (keyof AppState)[]) {
        if (key === 'meta') {
             const filePath = path.join(dbDirPath, `meta.json`);
             await atomicWriteFile(filePath, JSON.stringify(st.meta, null, 2));
             continue;
        }
        const filePath = path.join(dbDirPath, `${key}.json`);
        await atomicWriteFile(filePath, JSON.stringify(st[key], null, 2));
    }
};

const migrateInPlace = (st: any): AppState => {
    // Ensure structure exists
    if (!st.meta) st.meta = createEmptyState().meta;
    if (!st.meta.lastId) st.meta.lastId = createEmptyState().meta.lastId;
    
    const empty = createEmptyState();
    for (const k of Object.keys(empty.meta.lastId) as (keyof LastId)[]) {
        if (typeof st.meta.lastId[k] !== 'number') st.meta.lastId[k] = 0;
    }
    for (const k of Object.keys(empty) as (keyof AppState)[]) {
        if (k === 'meta') continue;
        if (!Array.isArray(st[k])) st[k] = [];
    }

    const typedState = st as AppState;

    // Backfill defaults / legacy fields
    typedState.tasks.forEach((t) => {
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

    const todoPositions = new Map<number, number>();
    typedState.todos.forEach((td) => {
        const taskId = Number(td.task_id);
        if (!Number.isFinite(taskId)) return;
        const currentNext = Number(todoPositions.get(taskId) ?? 0);
        const rawPos = Number(td.position);
        if (Number.isFinite(rawPos)) {
            td.position = rawPos;
            todoPositions.set(taskId, Math.max(currentNext, rawPos + 1));
            return;
        }
        td.position = currentNext;
        todoPositions.set(taskId, currentNext + 1);
    });

    typedState.label_notes.forEach((n) => {
        if ((n as any).archived === undefined) (n as any).archived = 0;
        if (n.archived && !n.archived_at) n.archived_at = nowIso();
        if (!n.created_at) n.created_at = nowIso();
        if (!n.updated_at) n.updated_at = n.created_at;
        if (!n.type) n.type = 'work_notes';
    });

    typedState.weekly_notes.forEach((n) => {
        if (!n.week_start) n.week_start = dateOnly(n.created_at || nowIso());
        if (!n.created_at) n.created_at = nowIso();
        if (!n.updated_at) n.updated_at = n.created_at;
        if (n.content === undefined) n.content = '';
    });

    typedState.journal_entries.forEach((n) => {
        const normalizedDate = dateOnly(n.date || n.created_at || nowIso());
        n.date = normalizedDate || dateOnly(nowIso());
        if (!n.created_at) n.created_at = nowIso();
        if (!n.updated_at) n.updated_at = n.created_at;
        if (n.content === undefined) n.content = '';
    });

    typedState.topics.forEach((t) => {
        if (t.archived === undefined) t.archived = 0;
        if (!t.created_at) t.created_at = nowIso();
        if (!t.updated_at) t.updated_at = t.created_at;
        if (!t.status) t.status = 'BACKLOG';
    });

    // Recompute lastId based on existing data
    const maxId = (arr: any[]) => arr.reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0);
    const keys = Object.keys(typedState.meta.lastId) as (keyof LastId)[];
    for (const k of keys) {
        const table = typedState[k as keyof AppState];
        if (Array.isArray(table)) {
            typedState.meta.lastId[k] = Math.max(typedState.meta.lastId[k] || 0, maxId(table));
        }
    }

    return typedState;
};

export const init = async (): Promise<void> => {
    if (initPromise) return initPromise;
    initPromise = (async () => {
        let loaded: any = null;
        const dbDirPath = getDbDirPath();
        
        // If DB_PATH is set (standard in prod), legacy file is next to the workbee_data dir.
        // If not set, we look in __dirname.
        const legacyFile = process.env.DB_PATH 
            ? path.join(path.dirname(process.env.DB_PATH), 'workbee.json')
            : path.join(__dirname, 'workbee.json');

        const dataDirExists = fs.existsSync(dbDirPath);
        const legacyFileExists = fs.existsSync(legacyFile);

        if (legacyFileExists && !dataDirExists) {
            const raw = await fsp.readFile(legacyFile, 'utf8');
            loaded = JSON.parse(raw);
            await fsp.rename(legacyFile, `${legacyFile}.bak`);
        } else if (dataDirExists) {
            loaded = {};
            const keys = Object.keys(createEmptyState()) as (keyof AppState)[];
            for (const key of keys) {
                const filePath = path.join(dbDirPath, `${key}.json`);
                if (fs.existsSync(filePath)) {
                    const raw = await fsp.readFile(filePath, 'utf8');
                    loaded[key] = JSON.parse(raw);
                } else {
                    loaded[key] = (createEmptyState() as any)[key];
                }
            }
        } else {
            loaded = createEmptyState();
        }
        state = migrateInPlace(loaded);
        await persist();
    })();
    return initPromise;
};

const computeTodoStats = (st: AppState): Map<number, { total: number; completed: number }> => {
    const byTaskId = new Map<number, { total: number; completed: number }>();
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

const taskWithComputedFields = (t: Task, todoStats: Map<number, { total: number; completed: number }>): Task => {
    const stats = todoStats.get(Number(t.id)) || { total: 0, completed: 0 };
    return { ...t, todo_total: stats.total, todo_completed: stats.completed };
};

const sortTasksDefault = (a: Task, b: Task): number => {
    const ad = String(a?.created_at || '');
    const bd = String(b?.created_at || '');
    return bd.localeCompare(ad);
};

const sortTasksByBoardPosition = (a: Task, b: Task): number => {
    const ap = Number(a?.board_position ?? 0);
    const bp = Number(b?.board_position ?? 0);
    if (ap !== bp) return ap - bp;
    return sortTasksDefault(a, b);
};

const getDescendantCategoryIds = (st: AppState, rootId: number | string): number[] => {
    const root = Number(rootId);
    if (!Number.isFinite(root)) return [];
    const childrenByParent = new Map<number | null, number[]>();
    st.categories.forEach((c) => {
        if (!c || c.archived) return;
        const pid = c.parent_id ?? null;
        const list = childrenByParent.get(pid) || [];
        list.push(c.id);
        childrenByParent.set(pid, list);
    });

    const out: number[] = [];
    const stack = [root];
    const seen = new Set<number>();
    while (stack.length) {
        const id = stack.pop();
        if (id === undefined) break;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
        const kids = childrenByParent.get(id) || [];
        kids.forEach((kid) => stack.push(kid));
    }
    return out;
};

// Categories
export const getCategories = async (): Promise<Category[]> => {
    const st = getState();
    const categories = st.categories
        .filter((c) => !c.archived)
        .map((c) => ({ ...c }));

    const directCounts = new Map<number, number>();
    st.tasks.forEach((t) => {
        if (t.archived) return;
        const categoryId = Number(t.category_id);
        if (!Number.isFinite(categoryId) || categoryId <= 0) return;
        directCounts.set(categoryId, (directCounts.get(categoryId) || 0) + 1);
    });

    const categoryById = new Map<number, Category>();
    const childrenByParent = new Map<number | null, number[]>();
    categories.forEach((c) => {
        const id = Number(c.id);
        categoryById.set(id, c);
        const parentId = c.parent_id ?? null;
        if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
        childrenByParent.get(parentId)!.push(id);
    });

    const totalCounts = new Map<number, number>();
    const visiting = new Set<number>();
    const computeTotal = (categoryId: number): number => {
        if (totalCounts.has(categoryId)) return totalCounts.get(categoryId)!;
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
};

export const createCategory = async (parent_id: number | null, name: string, color: string | null) => {
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
};

export const updateCategory = async (id: number, parent_id: number | null, name: string, color: string | null, position?: number | null) => {
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
};

export const reorderCategories = async (parent_id: number | null, orderedIds: (number | string)[]) => {
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
};

export const archiveCategory = async (id: number) => {
    return withWriteLock(async () => {
        const st = getState();
        const archiveRecursive = (categoryId: number) => {
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
};

// Tasks
export const getAllTasks = async (): Promise<Task[]> => {
    const st = getState();
    const todoStats = computeTodoStats(st);
    return st.tasks
        .filter((t) => !t.archived)
        .map((t) => taskWithComputedFields(t, todoStats))
        .sort(sortTasksDefault);
};

export const getTasksByStatus = async (status: string): Promise<Task[]> => {
    const st = getState();
    const todoStats = computeTodoStats(st);
    const s = String(status || '').toUpperCase();
    return st.tasks
        .filter((t) => !t.archived && String(t.status || '').toUpperCase() === s)
        .map((t) => taskWithComputedFields(t, todoStats))
        .sort(sortTasksByBoardPosition);
};

export const getTasksByCategory = async (id: number): Promise<Task[]> => {
    const st = getState();
    const todoStats = computeTodoStats(st);
    const cid = Number(id);
    return st.tasks
        .filter((t) => !t.archived && Number(t.category_id) === cid)
        .map((t) => taskWithComputedFields(t, todoStats))
        .sort(sortTasksDefault);
};

export const getTasksByCategoryWithDescendants = async (id: number): Promise<Task[]> => {
    const st = getState();
    const todoStats = computeTodoStats(st);
    const ids = new Set(getDescendantCategoryIds(st, id));
    return st.tasks
        .filter((t) => !t.archived && ids.has(Number(t.category_id)))
        .map((t) => taskWithComputedFields(t, todoStats))
        .sort(sortTasksDefault);
};

export const getTask = async (id: number): Promise<Task | null> => {
    const st = getState();
    return st.tasks.find((t) => Number(t.id) === Number(id)) || null;
};

export const createTask = async (category_id: number | null, title: string, description: string | null, url: string | null) => {
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
};

export const updateTask = async (id: number, category_id: number | null, title: string, description: string | null, url: string | null, status: string | null, story_points: any, priority: string | null, task_type: string | null, board_position?: number | null) => {
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
};

export const reorderTasksInStatus = async (status: string, orderedIds: (number | string)[]) => {
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
};

export const archiveTask = async (id: number) => {
    return withWriteLock(async () => {
        const st = getState();
        const task = st.tasks.find((t) => Number(t.id) === Number(id));
        if (!task) return { changes: 0 };
        task.archived = 1;
        if (!task.archived_at) task.archived_at = nowIso();
        await persist();
        return { changes: 1 };
    });
};

export const archiveDoneTasks = async () => {
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
};

export const deleteTask = async (id: number) => {
    return withWriteLock(async () => {
        const st = getState();
        const tid = Number(id);
        st.tasks = st.tasks.filter((t) => Number(t.id) !== tid);
        st.todos = st.todos.filter((td) => Number(td.task_id) !== tid);
        st.logs = st.logs.filter((l) => Number(l.task_id) !== tid);
        st.notes = st.notes.filter((n) => Number(n.task_id) !== tid);
        st.task_topics = st.task_topics.filter((tt) => Number(tt.task_id) !== tid);
        await persist();
        return { ok: true };
    });
};

// Todos
export const getTaskTodos = async (taskId: number): Promise<Todo[]> => {
    const st = getState();
    const id = Number(taskId);
    return st.todos
        .filter((td) => Number(td.task_id) === id)
        .slice()
        .sort((a, b) => {
            const ap = Number(a?.position ?? 0);
            const bp = Number(b?.position ?? 0);
            if (ap !== bp) return ap - bp;
            return Number(a?.id ?? 0) - Number(b?.id ?? 0);
        });
};

export const addTodo = async (task_id: number, text: string) => {
    return withWriteLock(async () => {
        const st = getState();
        const id = bumpId('todos');
        const tid = Number(task_id);
        const maxPos = st.todos.reduce((max, td) => {
            if (Number(td.task_id) !== tid) return max;
            const pos = Number(td.position ?? -1);
            return Number.isFinite(pos) ? Math.max(max, pos) : max;
        }, -1);
        st.todos.push({ id, task_id: tid, text, completed: 0, position: maxPos + 1 });
        await persist();
        return { changes: 1, lastInsertRowid: id };
    });
};

export const updateTodo = async (id: number, text: string, completed: boolean | number) => {
    return withWriteLock(async () => {
        const st = getState();
        const todo = st.todos.find((td) => Number(td.id) === Number(id));
        if (!todo) return { changes: 0 };
        todo.text = text;
        todo.completed = completed ? 1 : 0;
        await persist();
        return { changes: 1 };
    });
};

export const reorderTodosForTask = async (taskId: number, orderedIds: (number | string)[]) => {
    return withWriteLock(async () => {
        const st = getState();
        const tid = Number(taskId);
        if (!Number.isFinite(tid)) return { ok: false };
        const ordered = Array.isArray(orderedIds) ? orderedIds : [];
        ordered.forEach((rawId, idx) => {
            const id = Number(rawId);
            if (!Number.isFinite(id)) return;
            const todo = st.todos.find((td) => Number(td.id) === id && Number(td.task_id) === tid);
            if (!todo) return;
            todo.position = idx;
        });
        await persist();
        return { ok: true };
    });
};

export const deleteTodo = async (id: number) => {
    return withWriteLock(async () => {
        const st = getState();
        const before = st.todos.length;
        st.todos = st.todos.filter((td) => Number(td.id) !== Number(id));
        const changes = before - st.todos.length;
        await persist();
        return { changes };
    });
};

// Logs
export const getTaskLogs = async (taskId: number): Promise<Log[]> => {
    const st = getState();
    const id = Number(taskId);
    return st.logs
        .filter((l) => Number(l.task_id) === id)
        .slice()
        .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
};

export const addLog = async (task_id: number, content: string | null) => {
    return withWriteLock(async () => {
        const st = getState();
        const id = bumpId('logs');
        st.logs.push({ id, task_id: Number(task_id), content: content ?? null, timestamp: nowIso() });
        await persist();
        return { changes: 1, lastInsertRowid: id };
    });
};

// Task notes (different from label_notes)
export const getTaskNotes = async (taskId: number): Promise<Note[]> => {
    const st = getState();
    const id = Number(taskId);
    return st.notes
        .filter((n) => Number(n.task_id) === id)
        .slice()
        .sort((a, b) => Number(b.id) - Number(a.id));
};

export const addNote = async (task_id: number, title: string | null, content: string | null, type: string) => {
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
};

export const updateNote = async (id: number, title: string | null, content: string | null) => {
    return withWriteLock(async () => {
        const st = getState();
        const note = st.notes.find((n) => Number(n.id) === Number(id));
        if (!note) return { changes: 0 };
        note.title = title ?? null;
        note.content = content ?? null;
        await persist();
        return { changes: 1 };
    });
};

export const deleteNote = async (id: number) => {
    return withWriteLock(async () => {
        const st = getState();
        const before = st.notes.length;
        st.notes = st.notes.filter((n) => Number(n.id) !== Number(id));
        const changes = before - st.notes.length;
        await persist();
        return { changes };
    });
};

// Label notes (Obsidian-like notes)
export const getLabelNotes = async (categoryId: number, type?: string | null): Promise<LabelNote[]> => {
    const st = getState();
    const cid = Number(categoryId);
    const wantType = type ? String(type) : null;
    return st.label_notes
        .filter((n) => !n.archived && Number(n.category_id) === cid && (!wantType || String(n.type) === wantType))
        .slice()
        .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
};

export const getLabelNote = async (id: number): Promise<LabelNote | null> => {
    const st = getState();
    return st.label_notes.find((n) => Number(n.id) === Number(id)) || null;
};

export const addLabelNote = async (category_id: number, title: string | null, content: string | null, type: string) => {
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
};

export const updateLabelNote = async (id: number, title: string | null, content: string | null) => {
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
};

export const deleteLabelNote = async (id: number) => {
    return withWriteLock(async () => {
        const st = getState();
        const before = st.label_notes.length;
        st.label_notes = st.label_notes.filter((n) => Number(n.id) !== Number(id));
        const changes = before - st.label_notes.length;
        await persist();
        return { changes };
    });
};

export const archiveLabelNote = async (id: number) => {
    return withWriteLock(async () => {
        const st = getState();
        const note = st.label_notes.find((n) => Number(n.id) === Number(id));
        if (!note) return { changes: 0 };
        note.archived = 1;
        if (!note.archived_at) note.archived_at = nowIso();
        await persist();
        return { changes: 1 };
    });
};

export const unarchiveLabelNote = async (id: number) => {
    return withWriteLock(async () => {
        const st = getState();
        const note = st.label_notes.find((n) => Number(n.id) === Number(id));
        if (!note) return { changes: 0 };
        note.archived = 0;
        await persist();
        return { changes: 1 };
    });
};

// Weekly status notes (one per week_start)
export const getWeeklyNoteForDate = async (dateStr: string): Promise<WeeklyNote> => {
    const weekStart = weekStartDateOnly(dateStr);
    if (!weekStart) throw new Error('Invalid date');
    const st = getState();
    const existing = st.weekly_notes.find((n) => String(n.week_start) === weekStart);
    if (existing) return existing;

    return withWriteLock(async () => {
        const stLocked = getState();
        const again = stLocked.weekly_notes.find((n) => String(n.week_start) === weekStart);
        if (again) return again;
        const id = bumpId('weekly_notes');
        const ts = nowIso();
        const note: WeeklyNote = {
            id,
            week_start: weekStart,
            content: '',
            created_at: ts,
            updated_at: ts,
        };
        stLocked.weekly_notes.push(note);
        await persist();
        return note;
    });
};

export const getWeeklyNote = async (id: number): Promise<WeeklyNote | null> => {
    const st = getState();
    return st.weekly_notes.find((n) => Number(n.id) === Number(id)) || null;
};

export const updateWeeklyNote = async (id: number, content: string) => {
    return withWriteLock(async () => {
        const st = getState();
        const note = st.weekly_notes.find((n) => Number(n.id) === Number(id));
        if (!note) return { changes: 0, note: null };
        note.content = content ?? '';
        note.updated_at = nowIso();
        await persist();
        return { changes: 1, note };
    });
};

// Journal entries (daily snapshots)
export const getJournalEntries = async (): Promise<JournalEntry[]> => {
    const st = getState();
    return st.journal_entries
        .slice()
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
};

export const getJournalEntryByDate = async (dateStr: string): Promise<JournalEntry | null> => {
    const st = getState();
    const date = dateOnly(dateStr);
    if (!date) return null;
    return st.journal_entries.find((n) => String(n.date) === date) || null;
};

export const getLatestJournalEntry = async (): Promise<JournalEntry | null> => {
    const st = getState();
    if (!st.journal_entries.length) return null;
    return st.journal_entries.reduce((latest: JournalEntry | null, entry: JournalEntry) => {
        if (!latest) return entry;
        return String(entry.date || '').localeCompare(String(latest.date || '')) > 0 ? entry : latest;
    }, null);
};

export const upsertJournalEntry = async (dateStr: string, content: string) => {
    return withWriteLock(async () => {
        const st = getState();
        const date = dateOnly(dateStr);
        if (!date) throw new Error('Invalid date');
        const existing = st.journal_entries.find((n) => String(n.date) === date);
        if (existing) {
            existing.content = content ?? '';
            existing.updated_at = nowIso();
            await persist();
            return { changes: 1, entry: existing };
        }
        const id = bumpId('journal_entries');
        const ts = nowIso();
        const entry: JournalEntry = {
            id,
            date,
            content: content ?? '',
            created_at: ts,
            updated_at: ts,
        };
        st.journal_entries.push(entry);
        await persist();
        return { changes: 1, entry };
    });
};

// Search (tasks + notes)
export const search = async (query: string, limit = 60): Promise<any[]> => {
    const st = getState();
    const raw = String(query ?? '').trim();
    if (!raw) return [];

    const terms = raw
        .toLowerCase()
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean);
    if (!terms.length) return [];

    const max = Math.max(1, Math.min(200, Number(limit) || 60));

    const htmlToText = (html: string | null | undefined) =>
        String(html || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();

    const makeSnippet = (text: string | null | undefined) => {
        const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
        if (!cleaned) return '';
        const lower = cleaned.toLowerCase();
        let idx = -1;
        for (const term of terms) {
            idx = lower.indexOf(term);
            if (idx !== -1) break;
        }
        if (idx === -1) return cleaned.slice(0, 140);
        const start = Math.max(0, idx - 40);
        const end = Math.min(cleaned.length, idx + 120);
        const prefix = start > 0 ? '…' : '';
        const suffix = end < cleaned.length ? '…' : '';
        return `${prefix}${cleaned.slice(start, end)}${suffix}`;
    };

    const matches = (title: string | null | undefined, body: string | null | undefined) => {
        const t = String(title || '').toLowerCase();
        const b = String(body || '').toLowerCase();
        return terms.every((term) => t.includes(term) || b.includes(term));
    };

    const scoreHit = (title: string | null | undefined, body: string | null | undefined) => {
        const t = String(title || '').toLowerCase();
        const b = String(body || '').toLowerCase();
        let score = 0;
        for (const term of terms) {
            if (t.includes(term)) score += 5;
            else if (b.includes(term)) score += 1;
        }
        return score;
    };

    const results: any[] = [];

    st.tasks.forEach((task) => {
        if (!task || task.archived) return;
        const title = String(task.title || '').trim();
        const body = `${task.description || ''} ${task.url || ''}`.trim();
        if (!matches(title, body)) return;
        const snippetSource = task.description ? String(task.description) : `${title} ${body}`.trim();
        results.push({
            type: 'task',
            id: Number(task.id),
            title,
            status: task.status ?? null,
            category_id: task.category_id ?? null,
            updated_at: task.updated_at ?? task.created_at ?? null,
            snippet: makeSnippet(snippetSource),
            score: scoreHit(title, body),
        });
    });

    st.label_notes.forEach((note) => {
        if (!note || note.archived) return;
        const title = String(note.title || '').trim() || 'Untitled note';
        const bodyText = htmlToText(note.content);
        if (!matches(title, bodyText)) return;
        results.push({
            type: 'note',
            id: Number(note.id),
            title,
            category_id: note.category_id ?? null,
            updated_at: note.updated_at ?? note.created_at ?? null,
            snippet: makeSnippet(bodyText || title),
            score: scoreHit(title, bodyText),
        });
    });

    st.weekly_notes.forEach((note) => {
        if (!note) return;
        const title = `Week of ${note.week_start || ''}`.trim();
        const bodyText = htmlToText(note.content);
        if (!matches(title, bodyText)) return;
        results.push({
            type: 'weekly',
            id: Number(note.id),
            week_start: note.week_start ?? null,
            title,
            updated_at: note.updated_at ?? note.created_at ?? null,
            snippet: makeSnippet(bodyText || title),
            score: scoreHit(title, bodyText),
        });
    });

    results.sort((a: any, b: any) => {
        const sa = Number(a.score || 0);
        const sb = Number(b.score || 0);
        if (sa !== sb) return sb - sa;
        const da = String(a.updated_at || '');
        const db = String(b.updated_at || '');
        if (da !== db) return db.localeCompare(da);
        return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
    });

    return results.slice(0, max).map(({ score, ...rest }) => rest);
};

export interface ReportLog {
    id: number;
    task_id?: number;
    topic_id?: number;
    content: string | null;
    timestamp: string;
    task_title?: string | null;
    topic_title?: string | null;
    category_name?: string | null;
}

// Reports / archive
export const getLogsByDateRange = async (startDate: string, endDate: string): Promise<ReportLog[]> => {
    const st = getState();
    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);
    if (!start || !end) return [];

    const taskById = new Map(st.tasks.map((t) => [Number(t.id), t]));
    const topicById = new Map(st.topics.map((t) => [Number(t.id), t]));
    const catById = new Map(st.categories.map((c) => [Number(c.id), c]));

    const taskLogs = st.logs
        .filter((l) => inDateRange(l.timestamp, start, end))
        .map((l) => {
            const task = taskById.get(Number(l.task_id));
            const cat = task ? catById.get(Number(task.category_id)) : null;
            return {
                ...l,
                task_title: task?.title ?? null,
                category_name: cat?.name ?? null,
            } as ReportLog;
        });

    const topicLogs = st.topic_logs
        .filter((l) => inDateRange(l.timestamp, start, end))
        .map((l) => {
            const topic = topicById.get(Number(l.topic_id));
            return {
                ...l,
                topic_title: topic?.title ?? null,
                category_name: null,
            } as ReportLog;
        });

    return [...taskLogs, ...topicLogs].sort((a, b) =>
        String(b.timestamp || '').localeCompare(String(a.timestamp || ''))
    );
};

export const getTasksCompletedByDateRange = async (startDate: string, endDate: string): Promise<Task[]> => {
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
};

export const getArchivedTasksByDateRange = async (startDate: string, endDate: string): Promise<Task[]> => {
    const st = getState();
    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);
    if (!start || !end) return [];
    return st.tasks
        .filter((t) => t.archived && t.archived_at && inDateRange(t.archived_at, start, end))
        .slice()
        .sort((a, b) => String(b.archived_at || '').localeCompare(String(a.archived_at || '')));
};

export const getArchivedLabelNotesByDateRange = async (startDate: string, endDate: string): Promise<LabelNote[]> => {
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
};

// Topics API
export const getTopics = async (): Promise<Topic[]> => {
    const st = getState();
    return st.topics.filter((t) => !t.archived).map((t) => ({ ...t }));
};
export const getTopic = async (id: number): Promise<Topic | null> => {
    const st = getState();
    return st.topics.find((t) => Number(t.id) === Number(id)) || null;
};
export const createTopic = async (title: string, description: string | null, status: string | null, tags: string | null) => {
    return withWriteLock(async () => {
        const st = getState();
        const id = bumpId('topics');
        const topic: Topic = {
            id,
            title,
            description: description || '',
            status: status || 'BACKLOG',
            tags: tags || '',
            archived: 0,
            created_at: nowIso(),
            updated_at: nowIso(),
        };
        st.topics.push(topic);
        await persist();
        return { changes: 1, lastInsertRowid: id };
    });
};
export const updateTopic = async (id: number, title: string, description: string | null, status: string | null, tags: string | null) => {
    return withWriteLock(async () => {
        const st = getState();
        const topic = st.topics.find((t) => Number(t.id) === Number(id));
        if (!topic) return { changes: 0 };
        topic.title = title;
        topic.description = description || '';
        topic.status = status || 'BACKLOG';
        topic.tags = tags || '';
        topic.updated_at = nowIso();
        await persist();
        return { changes: 1 };
    });
};
export const deleteTopic = async (id: number) => {
    return withWriteLock(async () => {
        const st = getState();
        const tid = Number(id);
        st.topics = st.topics.filter((t) => Number(t.id) !== tid);
        st.topic_todos = st.topic_todos.filter((tt) => Number(tt.topic_id) !== tid);
        st.topic_logs = st.topic_logs.filter((tl) => Number(tl.topic_id) !== tid);
        st.topic_notes = st.topic_notes.filter((tn) => Number(tn.topic_id) !== tid);
        st.task_topics = st.task_topics.filter((tt) => Number(tt.topic_id) !== tid);
        await persist();
        return { changes: 1 };
    });
};

// Topic Todos
export const getTopicTodos = async (topicId: number): Promise<TopicTodo[]> => {
    const st = getState();
    const tid = Number(topicId);
    return st.topic_todos
        .filter((tt) => Number(tt.topic_id) === tid)
        .sort((a, b) => Number(a.id) - Number(b.id));
};
export const addTopicTodo = async (topic_id: number, text: string) => {
    return withWriteLock(async () => {
        const st = getState();
        const id = bumpId('topic_todos');
        st.topic_todos.push({ id, topic_id: Number(topic_id), text, completed: 0, created_at: nowIso() });
        await persist();
        return { changes: 1, lastInsertRowid: id };
    });
};
export const updateTopicTodo = async (id: number, text: string, completed: boolean | number) => {
    return withWriteLock(async () => {
        const st = getState();
        const todo = st.topic_todos.find((tt) => Number(tt.id) === Number(id));
        if (!todo) return { changes: 0 };
        todo.text = text;
        todo.completed = completed ? 1 : 0;
        await persist();
        return { changes: 1 };
    });
};
export const deleteTopicTodo = async (id: number) => {
    return withWriteLock(async () => {
        const st = getState();
        const before = st.topic_todos.length;
        st.topic_todos = st.topic_todos.filter((tt) => Number(tt.id) !== Number(id));
        const changes = before - st.topic_todos.length;
        await persist();
        return { changes };
    });
};

// Topic Logs
export const getTopicLogs = async (topicId: number): Promise<TopicLog[]> => {
    const st = getState();
    const tid = Number(topicId);
    return st.topic_logs
        .filter((tl) => Number(tl.topic_id) === tid)
        .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
};
export const addTopicLog = async (topic_id: number, content: string | null) => {
    return withWriteLock(async () => {
        const st = getState();
        const id = bumpId('topic_logs');
        st.topic_logs.push({ id, topic_id: Number(topic_id), content: content ?? null, timestamp: nowIso() });
        await persist();
        return { changes: 1, lastInsertRowid: id };
    });
};

// Topic Notes
export const getTopicNotes = async (topicId: number): Promise<TopicNote[]> => {
    const st = getState();
    const tid = Number(topicId);
    return st.topic_notes
        .filter((tn) => Number(tn.topic_id) === tid)
        .sort((a, b) => Number(b.id) - Number(a.id));
};
export const addTopicNote = async (topic_id: number, title: string | null, content: string | null, type: string) => {
    return withWriteLock(async () => {
        const st = getState();
        const id = bumpId('topic_notes');
        st.topic_notes.push({
            id,
            topic_id: Number(topic_id),
            title: title ?? null,
            content: content ?? null,
            type: type ?? 'text',
            created_at: nowIso(),
        });
        await persist();
        return { changes: 1, lastInsertRowid: id };
    });
};
export const updateTopicNote = async (id: number, title: string | null, content: string | null) => {
    return withWriteLock(async () => {
        const st = getState();
        const note = st.topic_notes.find((tn) => Number(tn.id) === Number(id));
        if (!note) return { changes: 0 };
        note.title = title ?? null;
        note.content = content ?? null;
        note.updated_at = nowIso();
        await persist();
        return { changes: 1 };
    });
};
export const deleteTopicNote = async (id: number) => {
    return withWriteLock(async () => {
        const st = getState();
        const before = st.topic_notes.length;
        st.topic_notes = st.topic_notes.filter((tn) => Number(tn.id) !== Number(id));
        const changes = before - st.topic_notes.length;
        await persist();
        return { changes };
    });
};

// Task-Topic Links
export const getTaskTopics = async (taskId: number): Promise<Topic[]> => {
    const st = getState();
    const tid = Number(taskId);
    const topicIds = st.task_topics
        .filter((tt) => Number(tt.task_id) === tid)
        .map((tt) => Number(tt.topic_id));
    const topicSet = new Set(topicIds);
    return st.topics.filter((t) => topicSet.has(Number(t.id)));
};
export const setTaskTopics = async (taskId: number, topicIds: (number | string)[]) => {
    return withWriteLock(async () => {
        const st = getState();
        const tid = Number(taskId);
        // Remove existing
        st.task_topics = st.task_topics.filter((tt) => Number(tt.task_id) !== tid);
        // Add new
        for (const topicId of topicIds) {
            const id = bumpId('task_topics');
            st.task_topics.push({ id, task_id: tid, topic_id: Number(topicId) });
        }
        await persist();
        return { ok: true };
    });
};
