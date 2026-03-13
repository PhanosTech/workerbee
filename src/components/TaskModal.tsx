import React, { useMemo, useState, useEffect, useRef, FormEvent, DragEvent, KeyboardEvent } from 'react';
import { api, Task, Todo, Log, Note, Category, Topic } from '../api';
import TiptapEditor from './TiptapEditor';

const moveBefore = <T extends { id: number | string }>(items: T[], movingId: number | string, targetId: number | string): T[] => {
    const fromIndex = items.findIndex((t) => t.id === movingId);
    const toIndex = items.findIndex((t) => t.id === targetId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return items;

    const next = items.slice();
    const [moved] = next.splice(fromIndex, 1);
    const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    next.splice(insertIndex, 0, moved);
    return next;
};

const moveToEnd = <T extends { id: number | string }>(items: T[], movingId: number | string): T[] => {
    const fromIndex = items.findIndex((t) => t.id === movingId);
    if (fromIndex === -1 || fromIndex === items.length - 1) return items;
    const next = items.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.push(moved);
    return next;
};

interface TaskModalProps {
    taskId: number;
    onClose: () => void;
    onUpdate: () => void;
}

const TaskModal: React.FC<TaskModalProps> = ({ taskId, onClose, onUpdate }) => {
    const [task, setTask] = useState<Task | null>(null);
    const [taskDirty, setTaskDirty] = useState(false);
    const [todos, setTodos] = useState<Todo[]>([]);
    const [logs, setLogs] = useState<Log[]>([]);
    const [notes, setNotes] = useState<Note[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [newTodo, setNewTodo] = useState('');
    const [newLog, setNewLog] = useState('');
    const [editingTodoId, setEditingTodoId] = useState<number | null>(null);
    const [editingTodoText, setEditingTodoText] = useState('');
    const [dragTodoId, setDragTodoId] = useState<number | null>(null);
    const [showNoteModal, setShowNoteModal] = useState(false);
    const [activeNote, setActiveNote] = useState<Note | null>(null);
    const [noteTitleDraft, setNoteTitleDraft] = useState('');
    const [noteDraft, setNoteDraft] = useState('');
    const [copyFoldersLoading, setCopyFoldersLoading] = useState(false);
    const [allTopics, setAllTopics] = useState<Topic[]>([]);
    const [taskTopicIds, setTaskTopicIds] = useState<(number | string)[]>([]);
    const taskDirtyRef = useRef(false);

    useEffect(() => {
        taskDirtyRef.current = taskDirty;
    }, [taskDirty]);

    useEffect(() => {
        setTaskDirty(false);
        loadTaskData({ preserveDraft: false });
        loadAllTopics();
        loadTaskTopics();
        loadCategories();
    }, [taskId]);

    const loadTaskData = async ({ preserveDraft = true } = {}) => {
        try {
            const data = await api.getTask(taskId);
            if (!data) return;
            setTask((prev) => {
                if (preserveDraft && taskDirtyRef.current && prev?.id === data.id) {
                    return { ...data, ...prev };
                }
                return data;
            });
            if (!(preserveDraft && taskDirtyRef.current)) {
                setTaskDirty(false);
            }
            setTodos(data.todos || []);
            setLogs(data.logs || []);
            setNotes(data.notes || []);
        } catch (err) {
            console.error(err);
        }
    };

    const loadAllTopics = async () => {
        try {
            const data = await api.getTopics();
            setAllTopics(data || []);
        } catch (err) {
            console.error(err);
        }
    };

    const loadTaskTopics = async () => {
        try {
            const data = await api.getTaskTopics(taskId);
            setTaskTopicIds(data.map(t => t.id));
        } catch (err) {
            console.error(err);
        }
    };

    const updateTaskDraft = (updates: Partial<Task>) => {
        setTask((prev) => (prev ? { ...prev, ...updates } : prev));
        setTaskDirty(true);
    };

    const loadCategories = async () => {
        if (copyFoldersLoading) return;
        setCopyFoldersLoading(true);
        try {
            const data = await api.getCategories();
            setCategories(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error(err);
            setCategories([]);
        } finally {
            setCopyFoldersLoading(false);
        }
    };

    const orderedCategoryOptions = useMemo(() => {
        const list = Array.isArray(categories) ? categories : [];
        const byParent = new Map<number | null, Category[]>();
        list.forEach((cat) => {
            const key = cat.parent_id ?? null;
            const siblings = byParent.get(key) || [];
            siblings.push(cat);
            byParent.set(key, siblings);
        });

        const sortCats = (a: Category, b: Category) => {
            const ap = Number(a?.position ?? 0);
            const bp = Number(b?.position ?? 0);
            if (ap !== bp) return ap - bp;
            return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });
        };

        for (const [key, siblings] of byParent.entries()) {
            byParent.set(key, siblings.slice().sort(sortCats));
        }

        const out: { id: number, label: string }[] = [];
        const walk = (parentId: number | null, depth: number) => {
            const siblings = byParent.get(parentId) || [];
            siblings.forEach((cat) => {
                const prefix = depth > 0 ? '\u00A0\u00A0'.repeat(depth) : '';
                out.push({ id: cat.id, label: `${prefix}${cat.name || `Folder #${cat.id}`}` });
                walk(cat.id, depth + 1);
            });
        };
        walk(null, 0);
        return out;
    }, [categories]);

    const handleSaveTask = async (updates: Partial<Task> = {}) => {
        if (!task) return;
        const nextTask = { ...task, ...updates };
        await Promise.all([
            api.updateTask(task.id, {
                category_id: nextTask.category_id,
                title: nextTask.title,
                description: nextTask.description,
                url: nextTask.url,
                status: nextTask.status,
                story_points: nextTask.story_points,
                priority: nextTask.priority,
                task_type: nextTask.task_type,
                due_date: nextTask.due_date
            } as Partial<Task>),
            api.setTaskTopics(task.id, taskTopicIds)
        ]);
        setTaskDirty(false);
        onUpdate();
        onClose();
    };

    const handleHardDeleteTask = async () => {
        if (!task) return;
        if (!confirm('PERMANENTLY DELETE this task and all its data? This cannot be undone.')) return;
        await api.hardDeleteTask(task.id);
        onUpdate();
        onClose();
    };

    const handleAddTodo = async (e: FormEvent) => {
        e.preventDefault();
        if (!task || !newTodo) return;
        await api.addTodo(task.id, newTodo);
        setNewTodo('');
        loadTaskData();
    };

    const handleToggleTodo = async (todo: Todo) => {
        const nextCompleted = !todo.completed;
        setTodos((prev) =>
            prev.map((t) => (t.id === todo.id ? { ...t, completed: nextCompleted ? 1 : 0 } : t))
        );
        await api.updateTodo(todo.id, todo.text, nextCompleted);
    };

    const handleStartEditTodo = (todo: Todo) => {
        setEditingTodoId(todo.id);
        setEditingTodoText(todo.text || '');
    };

    const handleCancelEditTodo = () => {
        setEditingTodoId(null);
        setEditingTodoText('');
    };

    const handleSaveEditTodo = async (todo: Todo) => {
        const nextText = editingTodoText.trim();
        if (!nextText) return;
        setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, text: nextText } : t)));
        await api.updateTodo(todo.id, nextText, !!todo.completed);
        handleCancelEditTodo();
    };

    const handleDeleteTodo = async (todo: Todo) => {
        if (!confirm('Delete this todo?')) return;
        setTodos((prev) => prev.filter((t) => t.id !== todo.id));
        await api.deleteTodo(todo.id);
        if (editingTodoId === todo.id) handleCancelEditTodo();
    };

    const parseDragTodoId = (e: DragEvent) => {
        const raw = e.dataTransfer.getData('text/plain');
        return Number(raw || dragTodoId);
    };

    const handleDropTodoOn = async (e: DragEvent, targetId: number) => {
        e.preventDefault();
        e.stopPropagation();
        const todoId = parseDragTodoId(e);
        if (!todoId || todoId === targetId || !task) return;
        const next = moveBefore(todos, todoId, targetId);
        setTodos(next);
        setDragTodoId(null);
        await api.reorderTodos(task.id, next.map((t) => t.id));
    };

    const handleDropTodoToEnd = async (e: DragEvent) => {
        e.preventDefault();
        const todoId = parseDragTodoId(e);
        if (!todoId || !task) return;
        const next = moveToEnd(todos, todoId);
        setTodos(next);
        setDragTodoId(null);
        await api.reorderTodos(task.id, next.map((t) => t.id));
    };

    const handleAddLog = async (e: FormEvent) => {
        e.preventDefault();
        if (!task || !newLog) return;
        await api.addLog(task.id, newLog);
        setNewLog('');
        loadTaskData();
    };

    const htmlToPlainText = (html: string | null | undefined) =>
        (html || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();

    const escapeHtml = (text: string) =>
        (text || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');

    const normalizeNoteContent = (content: string | null | undefined) => {
        const trimmed = (content || '').trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('<')) return content || '';
        return `<p>${escapeHtml(trimmed).replaceAll('\n', '<br />')}</p>`;
    };

    const isEmptyHtml = (html: string) => htmlToPlainText(html).length === 0;

    const openNoteModal = (note: Note | null) => {
        setActiveNote(note || null);
        setNoteTitleDraft(note?.title || '');
        setNoteDraft(normalizeNoteContent(note?.content || ''));
        setShowNoteModal(true);
    };

    const closeNoteModal = () => {
        setShowNoteModal(false);
        setActiveNote(null);
        setNoteTitleDraft('');
        setNoteDraft('');
    };

    const handleSaveNote = async () => {
        if (isEmptyHtml(noteDraft) || !task) return;

        if (activeNote?.id) {
            await api.updateNote(activeNote.id, noteTitleDraft, noteDraft);
        } else {
            await api.addNote(task.id, noteTitleDraft, noteDraft, 'rich_text');
        }
        closeNoteModal();
        loadTaskData();
    };

    const handleDeleteNote = async () => {
        if (!activeNote?.id) return;
        if (!confirm('Delete this note?')) return;
        await api.deleteNote(activeNote.id);
        closeNoteModal();
        loadTaskData();
    };

    const handleArchiveTask = async () => {
        if (!task) return;
        if (!confirm('Archive this task?')) return;
        await api.archiveTask(task.id);
        onUpdate();
        onClose();
    };

    if (!task) {
        return (
            <div
                className="modal-overlay"
                onMouseDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    onClose();
                }}
            >
                <div className="modal-content note-modal">
                    <div style={{ opacity: 0.8 }}>Loading…</div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="modal-overlay"
            onMouseDown={(e) => {
                if (e.target !== e.currentTarget) return;
                onClose();
            }}
        >
            <div className="modal-content task-modal">
                <div className="modal-header">
                    <input
                        className="title-input"
                        value={task.title || ''}
                        onChange={(e) => updateTaskDraft({ title: e.target.value })}
                    />
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <div className="modal-body task-modal-grid">
                    <div className="task-col task-col-properties">
                        <section>
                            <label>Folder</label>
                            <select
                                value={task.category_id || ''}
                                onChange={(e) => updateTaskDraft({ category_id: Number(e.target.value) || null })}
                            >
                                <option value="">No Folder</option>
                                {orderedCategoryOptions.map(opt => (
                                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                                ))}
                            </select>
                        </section>
                        <section>
                            <label>Description</label>
                            <textarea
                                value={task.description || ''}
                                onChange={(e) => updateTaskDraft({ description: e.target.value })}
                            />
                        </section>
                        <section>
                            <label>Topics</label>
                            <div className="topics-checkboxes" style={{ maxHeight: 150, overflow: 'auto', border: '1px solid var(--border-subtle)', padding: 8, borderRadius: 8, background: 'var(--input-bg)' }}>
                                {allTopics.map(topic => (
                                    <label key={topic.id} style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', letterSpacing: 'normal', cursor: 'pointer', marginBottom: 4 }}>
                                        <input
                                            type="checkbox"
                                            checked={taskTopicIds.includes(topic.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setTaskTopicIds([...taskTopicIds, topic.id]);
                                                } else {
                                                    setTaskTopicIds(taskTopicIds.filter(id => id !== topic.id));
                                                }
                                                setTaskDirty(true);
                                            }}
                                        />
                                        <span style={{ fontSize: '0.85rem' }}>{topic.title}</span>
                                    </label>
                                ))}
                                {allTopics.length === 0 && <div className="muted" style={{ fontSize: '0.8rem' }}>No topics found.</div>}
                            </div>
                        </section>
                        <section>
                            <label>URL</label>
                            <input
                                type="text"
                                value={task.url || ''}
                                onChange={(e) => updateTaskDraft({ url: e.target.value })}
                            />
                        </section>
                        <section>
                            <label>Due Date</label>
                            <input
                                type="date"
                                value={task.due_date ? task.due_date.split('T')[0] : ''}
                                onChange={(e) => updateTaskDraft({ due_date: e.target.value })}
                            />
                        </section>
                        <section>
                            <label>Story Points</label>
                            <input
                                type="number"
                                min="0"
                                step="1"
                                value={Number.isFinite(Number(task.story_points)) ? Number(task.story_points) : 0}
                                onChange={(e) => updateTaskDraft({ story_points: Number(e.target.value) || 0 })}
                            />
                        </section>
                        <section>
                            <label>Priority</label>
                            <select
                                value={(task.priority || 'NORMAL').toUpperCase()}
                                onChange={(e) => updateTaskDraft({ priority: e.target.value })}
                            >
                                <option value="NORMAL">Normal</option>
                                <option value="IMPORTANT">Important</option>
                                <option value="HIGH">High</option>
                            </select>
                        </section>
                        <section>
                            <label>Type</label>
                            <select
                                value={String(task.task_type || 'NONE').toUpperCase()}
                                onChange={(e) => updateTaskDraft({ task_type: e.target.value })}
                            >
                                <option value="NONE">None</option>
                                <option value="MEETING">Meeting</option>
                                <option value="FOLLOW_UP">Follow Up</option>
                                <option value="ISSUE">Issue</option>
                            </select>
                        </section>
                        <section>
                            <label>Status</label>
                            <select
                                value={task.status}
                                onChange={(e) => updateTaskDraft({ status: e.target.value })}
                            >
                                <option value="BACKLOG">Backlog</option>
                                <option value="STARTED">Started</option>
                                <option value="DOING">Doing</option>
                                <option value="DONE">Done</option>
                            </select>
                        </section>
                    </div>

                    <div className="task-col">
                        <section className="task-panel">
                            <div className="task-panel-header">
                                <label>Todos</label>
                                <span className="muted">
                                    {todos.filter((t) => t.completed).length}/{todos.length} · drag to sort
                                </span>
                            </div>
                            <form onSubmit={handleAddTodo} className="task-panel-form todo-add-form">
                                <input
                                    placeholder="Add todo..."
                                    value={newTodo}
                                    onChange={(e) => setNewTodo(e.target.value)}
                                />
                            </form>
                            <div
                                className="task-panel-scroll todo-scroll"
                                role="region"
                                aria-label="Todos"
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={handleDropTodoToEnd}
                            >
                                <ul className="todo-list">
                                    {todos.map((todo) => (
                                        <li
                                            key={todo.id}
                                            className={`todo-row ${dragTodoId === todo.id ? 'dragging' : ''} ${editingTodoId === todo.id ? 'editing' : ''}`}
                                            draggable={editingTodoId !== todo.id}
                                            onDragStart={(e) => {
                                                setDragTodoId(todo.id);
                                                e.dataTransfer.setData('text/plain', String(todo.id));
                                                e.dataTransfer.effectAllowed = 'move';
                                            }}
                                            onDragEnd={() => setDragTodoId(null)}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => handleDropTodoOn(e, todo.id)}
                                        >
                                            <span className="todo-drag-handle" aria-hidden="true">
                                                ⋮⋮
                                            </span>
                                            <div className="todo-item">
                                                <input
                                                    type="checkbox"
                                                    checked={!!todo.completed}
                                                    onChange={() => handleToggleTodo(todo)}
                                                />
                                                {editingTodoId === todo.id ? (
                                                    <input
                                                        className="todo-edit-input"
                                                        value={editingTodoText}
                                                        onChange={(e) => setEditingTodoText(e.target.value)}
                                                        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                handleSaveEditTodo(todo);
                                                            }
                                                            if (e.key === 'Escape') {
                                                                e.preventDefault();
                                                                handleCancelEditTodo();
                                                            }
                                                        }}
                                                    />
                                                ) : (
                                                    <span onDoubleClick={() => handleStartEditTodo(todo)}>{todo.text}</span>
                                                )}
                                            </div>
                                            <div className="todo-actions">
                                                {editingTodoId === todo.id ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="icon-btn"
                                                            onClick={() => handleSaveEditTodo(todo)}
                                                            title="Save"
                                                            aria-label="Save todo"
                                                        >
                                                            ✓
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="icon-btn"
                                                            onClick={handleCancelEditTodo}
                                                            title="Cancel"
                                                            aria-label="Cancel"
                                                        >
                                                            ×
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="icon-btn"
                                                            onClick={() => handleStartEditTodo(todo)}
                                                            title="Edit"
                                                            aria-label="Edit todo"
                                                        >
                                                            ✏
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="icon-btn"
                                                            onClick={() => handleDeleteTodo(todo)}
                                                            title="Delete"
                                                            aria-label="Delete todo"
                                                        >
                                                            ✕
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                                {todos.length === 0 && <div className="muted">No todos yet.</div>}
                            </div>
                        </section>
                    </div>

                    <div className="task-col">
                        <section className="task-panel">
                            <div className="task-panel-header">
                                <label>Work Log</label>
                            </div>
                            <div className="task-panel-scroll" role="region" aria-label="Work log">
                                {logs.map((log) => (
                                    <div key={log.id} className="log-entry">
                                        <div className="log-time">{new Date(log.timestamp).toLocaleString()}</div>
                                        <div className="log-content">{log.content}</div>
                                    </div>
                                ))}
                                {logs.length === 0 && <div className="muted">No work logs yet.</div>}
                            </div>
                            <form onSubmit={handleAddLog} className="task-panel-form log-form">
                                <textarea
                                    placeholder="What did you work on?"
                                    value={newLog}
                                    onChange={(e) => setNewLog(e.target.value)}
                                />
                                <button type="submit">Log Work</button>
                            </form>
                        </section>
                    </div>

                    <div className="task-col">
                        <section className="task-panel">
                            <div className="task-panel-header">
                                <label>Task Notes</label>
                                <button onClick={() => openNoteModal(null)}>
                                    + New
                                </button>
                            </div>
                            <div className="task-panel-scroll" role="region" aria-label="Notes">
                                <ul className="notes-list">
                                    {notes.map((note) => (
                                        <li key={note.id} onClick={() => openNoteModal(note)}>
                                            <div className="note-row-title">
                                                {note.title?.trim() ? note.title : `Note #${note.id}`}
                                            </div>
                                            <div className="note-row-preview">
                                                {htmlToPlainText(note.content).slice(0, 90) || 'Empty note'}
                                            </div>
                                        </li>
                                    ))}
                                    {notes.length === 0 && <li className="notes-empty">No task notes yet.</li>}
                                </ul>
                            </div>
                        </section>
                    </div>
                </div>

                <div className="task-modal-footer">
                    <div className="task-modal-actions">
                        <button onClick={() => handleSaveTask({ status: 'BACKLOG' })}>Move to Backlog</button>
                        <button className="danger" onClick={handleArchiveTask}>Archive</button>
                        <button className="danger" onClick={handleHardDeleteTask}>Hard Delete</button>
                        <button onClick={() => handleSaveTask({})} className="primary-btn">Save & Close</button>
                    </div>
                </div>
            </div>

            {showNoteModal && (
                <div
                    className="modal-overlay note-modal-overlay"
                    onMouseDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        closeNoteModal();
                    }}
                >
                    <div className="modal-content note-modal">
                        <h3>{activeNote ? 'Edit Note' : 'New Note'}</h3>
                        <input
                            type="text"
                            placeholder="Title"
                            value={noteTitleDraft}
                            onChange={(e) => setNoteTitleDraft(e.target.value)}
                            style={{ marginBottom: 10 }}
                        />
                        <TiptapEditor
                            content={noteDraft}
                            onChange={setNoteDraft}
                            placeholder="Paste an email, a snippet, or free-form notes…"
                            onRequestSave={handleSaveNote}
                        />
                        <div className="modal-actions">
                            <button onClick={closeNoteModal}>Cancel</button>
                            {activeNote?.id && <button onClick={handleDeleteNote}>Delete</button>}
                            <button className="primary-btn" onClick={handleSaveNote} disabled={isEmptyHtml(noteDraft)}>
                                Save Note
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TaskModal;
