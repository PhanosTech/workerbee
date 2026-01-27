import React, { useMemo, useState, useEffect } from 'react';
import { api } from '../api';
import TiptapEditor from './TiptapEditor';

const COPY_TASK_NOTE_FOLDER_KEY = 'wb-copy-task-note-folder-id';

const moveBefore = (items, movingId, targetId) => {
    const fromIndex = items.findIndex((t) => t.id === movingId);
    const toIndex = items.findIndex((t) => t.id === targetId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return items;

    const next = items.slice();
    const [moved] = next.splice(fromIndex, 1);
    const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    next.splice(insertIndex, 0, moved);
    return next;
};

const moveToEnd = (items, movingId) => {
    const fromIndex = items.findIndex((t) => t.id === movingId);
    if (fromIndex === -1 || fromIndex === items.length - 1) return items;
    const next = items.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.push(moved);
    return next;
};

const TaskModal = ({ taskId, onClose, onUpdate }) => {
    const [task, setTask] = useState(null);
    const [todos, setTodos] = useState([]);
    const [logs, setLogs] = useState([]);
    const [notes, setNotes] = useState([]);
    const [labelNotes, setLabelNotes] = useState([]);
    const [categories, setCategories] = useState([]);
    const [newTodo, setNewTodo] = useState('');
    const [newLog, setNewLog] = useState('');
    const [editingTodoId, setEditingTodoId] = useState(null);
    const [editingTodoText, setEditingTodoText] = useState('');
    const [dragTodoId, setDragTodoId] = useState(null);
    const [notesTab, setNotesTab] = useState('task');
    const [showNoteModal, setShowNoteModal] = useState(false);
    const [activeNote, setActiveNote] = useState(null);
    const [noteTitleDraft, setNoteTitleDraft] = useState('');
    const [noteDraft, setNoteDraft] = useState('');
    const [showLabelNoteModal, setShowLabelNoteModal] = useState(false);
    const [activeLabelNote, setActiveLabelNote] = useState(null);
    const [labelNoteTitleDraft, setLabelNoteTitleDraft] = useState('');
    const [labelNoteDraft, setLabelNoteDraft] = useState('');
    const [copyToFolderOpen, setCopyToFolderOpen] = useState(false);
    const [copyTargetCategoryId, setCopyTargetCategoryId] = useState(null);
    const [copyingNote, setCopyingNote] = useState(false);
    const [copyStatus, setCopyStatus] = useState(null);
    const [copyFoldersLoading, setCopyFoldersLoading] = useState(false);

    useEffect(() => {
        loadTaskData();
    }, [taskId]);

    useEffect(() => {
        if (notesTab !== 'label') return;
        if (!task?.category_id) return;
        loadLabelNotes(task.category_id);
    }, [notesTab, task?.category_id]);

    const loadTaskData = async () => {
        try {
            const data = await api.getTask(taskId);
            setTask(data);
            setTodos(data.todos || []);
            setLogs(data.logs || []);
            setNotes(data.notes || []);
        } catch (err) {
            console.error(err);
        }
    };

    const loadLabelNotes = async (categoryId) => {
        try {
            const data = await api.getLabelNotes(categoryId);
            setLabelNotes(data || []);
        } catch (err) {
            console.error(err);
        }
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
        const byParent = new Map();
        list.forEach((cat) => {
            const key = cat.parent_id ?? null;
            const siblings = byParent.get(key) || [];
            siblings.push(cat);
            byParent.set(key, siblings);
        });

        const sortCats = (a, b) => {
            const ap = Number(a?.position ?? 0);
            const bp = Number(b?.position ?? 0);
            if (ap !== bp) return ap - bp;
            return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });
        };

        for (const [key, siblings] of byParent.entries()) {
            byParent.set(key, siblings.slice().sort(sortCats));
        }

        const out = [];
        const walk = (parentId, depth) => {
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

    const readLastCopyFolderId = () => {
        try {
            const raw = window.localStorage.getItem(COPY_TASK_NOTE_FOLDER_KEY);
            const parsed = raw ? Number(raw) : null;
            return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        } catch {
            return null;
        }
    };

    const openCopyToFolder = async () => {
        setCopyStatus(null);
        setCopyToFolderOpen(true);
        const fallback =
            readLastCopyFolderId() ??
            (Number.isFinite(Number(task?.category_id)) ? Number(task.category_id) : null);
        setCopyTargetCategoryId((prev) => prev ?? fallback);
        await loadCategories();
    };

    const closeCopyToFolder = () => {
        setCopyToFolderOpen(false);
        setCopyingNote(false);
        setCopyStatus(null);
    };

    useEffect(() => {
        if (!copyToFolderOpen) return;
        if (!orderedCategoryOptions.length) return;
        const selectedId = Number(copyTargetCategoryId);
        const exists = orderedCategoryOptions.some((opt) => Number(opt.id) === selectedId);
        if (exists) return;
        setCopyTargetCategoryId(orderedCategoryOptions[0].id);
    }, [copyToFolderOpen, orderedCategoryOptions, copyTargetCategoryId]);

    const handleSaveTask = async (updates = {}) => {
        const nextTask = { ...task, ...updates };
        await api.updateTask(task.id, {
            category_id: nextTask.category_id,
            title: nextTask.title,
            description: nextTask.description,
            url: nextTask.url,
            status: nextTask.status,
            story_points: nextTask.story_points,
            priority: nextTask.priority,
            task_type: nextTask.task_type,
            due_date: nextTask.due_date
        });
        onUpdate();
        onClose();
    };

    const handleAddTodo = async (e) => {
        e.preventDefault();
        if (!newTodo) return;
        await api.addTodo(task.id, newTodo);
        setNewTodo('');
        loadTaskData();
    };

    const handleToggleTodo = async (todo) => {
        const nextCompleted = !todo.completed;
        setTodos((prev) =>
            prev.map((t) => (t.id === todo.id ? { ...t, completed: nextCompleted ? 1 : 0 } : t))
        );
        await api.updateTodo(todo.id, todo.text, nextCompleted);
    };

    const handleStartEditTodo = (todo) => {
        setEditingTodoId(todo.id);
        setEditingTodoText(todo.text || '');
    };

    const handleCancelEditTodo = () => {
        setEditingTodoId(null);
        setEditingTodoText('');
    };

    const handleSaveEditTodo = async (todo) => {
        const nextText = editingTodoText.trim();
        if (!nextText) return;
        setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, text: nextText } : t)));
        await api.updateTodo(todo.id, nextText, !!todo.completed);
        handleCancelEditTodo();
    };

    const handleDeleteTodo = async (todo) => {
        if (!confirm('Delete this todo?')) return;
        setTodos((prev) => prev.filter((t) => t.id !== todo.id));
        await api.deleteTodo(todo.id);
        if (editingTodoId === todo.id) handleCancelEditTodo();
    };

    const parseDragTodoId = (e) => {
        const raw = e.dataTransfer.getData('text/plain');
        return Number(raw || dragTodoId);
    };

    const handleDropTodoOn = async (e, targetId) => {
        e.preventDefault();
        e.stopPropagation();
        const todoId = parseDragTodoId(e);
        if (!todoId || todoId === targetId) return;
        const next = moveBefore(todos, todoId, targetId);
        setTodos(next);
        setDragTodoId(null);
        await api.reorderTodos(task.id, next.map((t) => t.id));
    };

    const handleDropTodoToEnd = async (e) => {
        e.preventDefault();
        const todoId = parseDragTodoId(e);
        if (!todoId) return;
        const next = moveToEnd(todos, todoId);
        setTodos(next);
        setDragTodoId(null);
        await api.reorderTodos(task.id, next.map((t) => t.id));
    };

    const handleAddLog = async (e) => {
        e.preventDefault();
        if (!newLog) return;
        await api.addLog(task.id, newLog);
        setNewLog('');
        loadTaskData();
    };

    const htmlToPlainText = (html) =>
        (html || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();

    const escapeHtml = (text) =>
        (text || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');

    const normalizeNoteContent = (content) => {
        const trimmed = (content || '').trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('<')) return content;
        return `<p>${escapeHtml(trimmed).replaceAll('\n', '<br />')}</p>`;
    };

    const isEmptyHtml = (html) => htmlToPlainText(html).length === 0;

    const openNoteModal = (note) => {
        setActiveNote(note || null);
        setNoteTitleDraft(note?.title || '');
        setNoteDraft(normalizeNoteContent(note?.content || ''));
        setCopyToFolderOpen(false);
        setCopyTargetCategoryId(null);
        setCopyStatus(null);
        setShowNoteModal(true);
    };

    const closeNoteModal = () => {
        setShowNoteModal(false);
        setActiveNote(null);
        setNoteTitleDraft('');
        setNoteDraft('');
        closeCopyToFolder();
    };

    const handleSaveNote = async () => {
        if (isEmptyHtml(noteDraft)) return;

        if (activeNote?.id) {
            await api.updateNote(activeNote.id, noteTitleDraft, noteDraft);
        } else {
            await api.addNote(task.id, noteTitleDraft, noteDraft, 'rich_text');
        }
        closeNoteModal();
        loadTaskData();
    };

    const handleCopyNoteToFolder = async () => {
        const targetId = Number(copyTargetCategoryId);
        if (!Number.isFinite(targetId) || targetId <= 0) return;
        if (isEmptyHtml(noteDraft)) return;

        const title = noteTitleDraft?.trim()
            ? noteTitleDraft.trim()
            : task?.title
              ? `[Task] ${task.title}`
              : 'Task note';

        setCopyingNote(true);
        setCopyStatus(null);
        try {
            await api.addLabelNote(targetId, title, noteDraft, 'work_notes');
            try {
                window.localStorage.setItem(COPY_TASK_NOTE_FOLDER_KEY, String(targetId));
            } catch {
                // ignore
            }
            const folderName = categories.find((c) => Number(c.id) === targetId)?.name;
            setCopyStatus(folderName ? `Copied to “${folderName}”.` : 'Copied.');
        } catch (err) {
            console.error(err);
            setCopyStatus('Copy failed.');
        } finally {
            setCopyingNote(false);
        }
    };

    const handleDeleteNote = async () => {
        if (!activeNote?.id) return;
        if (!confirm('Delete this note?')) return;
        await api.deleteNote(activeNote.id);
        closeNoteModal();
        loadTaskData();
    };

    const openLabelNoteModal = (note) => {
        setActiveLabelNote(note || null);
        setLabelNoteTitleDraft(note?.title || '');
        setLabelNoteDraft(note?.content || '');
        setShowLabelNoteModal(true);
    };

    const closeLabelNoteModal = () => {
        setShowLabelNoteModal(false);
        setActiveLabelNote(null);
        setLabelNoteTitleDraft('');
        setLabelNoteDraft('');
    };

    const handleSaveLabelNote = async () => {
        if (!task?.category_id) return;
        if (isEmptyHtml(labelNoteDraft)) return;

        if (activeLabelNote?.id) {
            await api.updateLabelNote(activeLabelNote.id, labelNoteTitleDraft, labelNoteDraft);
        } else {
            await api.addLabelNote(task.category_id, labelNoteTitleDraft, labelNoteDraft, 'work_notes');
        }

        closeLabelNoteModal();
        loadLabelNotes(task.category_id);
    };

    const handleDeleteLabelNote = async () => {
        if (!activeLabelNote?.id) return;
        if (!confirm('Delete this folder note?')) return;
        await api.deleteLabelNote(activeLabelNote.id);
        const categoryId = task?.category_id;
        closeLabelNoteModal();
        if (categoryId) loadLabelNotes(categoryId);
    };

    const handleArchiveTask = async () => {
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
                        value={task.title}
                        onChange={e => setTask({ ...task, title: e.target.value })}
                    />
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <div className="modal-body task-modal-grid">
                    <div className="task-col task-col-properties">
                        <section>
                            <label>Description</label>
                            <textarea
                                value={task.description || ''}
                                onChange={e => setTask({ ...task, description: e.target.value })}
                            />
                        </section>
                        <section>
                            <label>URL</label>
                            <input
                                type="text"
                                value={task.url || ''}
                                onChange={e => setTask({ ...task, url: e.target.value })}
                            />
                        </section>
                        <section>
                            <label>Due Date</label>
                            <input
                                type="date"
                                value={task.due_date ? task.due_date.split('T')[0] : ''}
                                onChange={e => setTask({ ...task, due_date: e.target.value })}
                            />
                        </section>
                        <section>
                            <label>Story Points</label>
                            <input
                                type="number"
                                min="0"
                                step="1"
                                value={Number.isFinite(Number(task.story_points)) ? Number(task.story_points) : 0}
                                onChange={(e) => setTask({ ...task, story_points: Number(e.target.value) || 0 })}
                            />
                        </section>
                        <section>
                            <label>Priority</label>
                            <select
                                value={(task.priority || 'NORMAL').toUpperCase()}
                                onChange={(e) => setTask({ ...task, priority: e.target.value })}
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
                                onChange={(e) => setTask({ ...task, task_type: e.target.value })}
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
                                onChange={(e) => setTask({ ...task, status: e.target.value })}
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
                                    {todos.filter((t) => t.completed).length}/{todos.length}
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
                                            <label className="todo-item">
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
                                                        onKeyDown={(e) => {
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
                                            </label>
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
                                                            ✎
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="icon-btn"
                                                            onClick={() => handleDeleteTodo(todo)}
                                                            title="Delete"
                                                            aria-label="Delete todo"
                                                        >
                                                            🗑
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
                                <div className="notes-tabbar" role="tablist" aria-label="Notes">
                                    <button
                                        type="button"
                                        className={`notes-tab ${notesTab === 'task' ? 'active' : ''}`}
                                        onClick={() => setNotesTab('task')}
                                    >
                                        Task Notes
                                    </button>
                                    <button
                                        type="button"
                                        className={`notes-tab ${notesTab === 'label' ? 'active' : ''}`}
                                        onClick={() => setNotesTab('label')}
                                    >
                                        Folder Notes
                                    </button>
                                </div>
                                <button onClick={() => (notesTab === 'task' ? openNoteModal(null) : openLabelNoteModal(null))}>
                                    + New
                                </button>
                            </div>
                            <div className="task-panel-scroll" role="region" aria-label="Notes">
                                {notesTab === 'task' && (
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
                                )}

                                {notesTab === 'label' && (
                                    <>
                                        {!task?.category_id && <div className="muted">This task has no folder.</div>}
                                        {task?.category_id && (
                                            <ul className="notes-list label-notes-list">
                                                {labelNotes.map((note) => (
                                                    <li key={note.id} className="label-note-row" onClick={() => openLabelNoteModal(note)}>
                                                        <div className="label-note-row-top">
                                                            <div className="label-note-row-title">
                                                                {note.title?.trim() ? note.title : `Note #${note.id}`}
                                                            </div>
                                                            <div
                                                                className="label-note-row-actions"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <button
                                                                    type="button"
                                                                    className="icon-btn"
                                                                    title="Edit note"
                                                                    onClick={() => openLabelNoteModal(note)}
                                                                >
                                                                    ✏️
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="label-note-row-preview">
                                                            {htmlToPlainText(note.content).slice(0, 140) || 'Empty note'}
                                                        </div>
                                                        <div className="label-note-row-meta">
                                                            {note.updated_at
                                                                ? new Date(note.updated_at).toLocaleString()
                                                                : new Date().toLocaleString()}
                                                        </div>
                                                    </li>
                                                ))}
                                                {labelNotes.length === 0 && (
                                                    <li className="notes-empty">No folder notes yet.</li>
                                                )}
                                            </ul>
                                        )}
                                    </>
                                )}
                            </div>
                        </section>
                    </div>
                </div>

                <div className="task-modal-footer">
                    <div className="task-modal-actions">
                        <button onClick={() => handleSaveTask({ status: 'BACKLOG' })}>Move to Backlog</button>
                        <button className="danger" onClick={handleArchiveTask}>Archive</button>
                        <button onClick={handleSaveTask} className="primary-btn">Save & Close</button>
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
                        {copyToFolderOpen && (
                            <div className="copy-to-folder-row" role="region" aria-label="Copy task note to folder">
                                <select
                                    value={copyTargetCategoryId ?? ''}
                                    onChange={(e) => setCopyTargetCategoryId(Number(e.target.value) || null)}
                                    disabled={copyFoldersLoading}
                                    aria-label="Target folder"
                                >
                                    <option value="" disabled>
                                        {copyFoldersLoading ? 'Loading folders…' : 'Select a folder…'}
                                    </option>
                                    {orderedCategoryOptions.map((opt) => (
                                        <option key={opt.id} value={opt.id}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={handleCopyNoteToFolder}
                                    disabled={
                                        copyFoldersLoading ||
                                        copyingNote ||
                                        !copyTargetCategoryId ||
                                        isEmptyHtml(noteDraft)
                                    }
                                    title="Copy this task note into a folder note"
                                >
                                    {copyingNote ? 'Copying…' : 'Copy'}
                                </button>
                                <button type="button" className="icon-btn" onClick={closeCopyToFolder} title="Close copy">
                                    ✕
                                </button>
                            </div>
                        )}
                        {copyStatus ? <div className="muted copy-to-folder-status">{copyStatus}</div> : null}
                        <div className="modal-actions">
                            <button onClick={closeNoteModal}>Cancel</button>
                            {activeNote?.id && <button onClick={handleDeleteNote}>Delete</button>}
                            {!copyToFolderOpen && (
                                <button type="button" onClick={openCopyToFolder} disabled={isEmptyHtml(noteDraft)}>
                                    📁 Copy to folder…
                                </button>
                            )}
                            <button className="primary-btn" onClick={handleSaveNote} disabled={isEmptyHtml(noteDraft)}>
                                Save Note
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showLabelNoteModal && (
                <div
                    className="modal-overlay note-modal-overlay"
                    onMouseDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        closeLabelNoteModal();
                    }}
                >
                    <div className="modal-content note-modal">
                        <div className="modal-header">
                            <h3 style={{ margin: 0 }}>{activeLabelNote ? 'Edit Folder Note' : 'New Folder Note'}</h3>
                            <button className="close-btn" onClick={closeLabelNoteModal}>&times;</button>
                        </div>

                        <input
                            type="text"
                            placeholder="Title"
                            value={labelNoteTitleDraft}
                            onChange={(e) => setLabelNoteTitleDraft(e.target.value)}
                            style={{ marginBottom: 10 }}
                        />

                        <TiptapEditor
                            content={labelNoteDraft}
                            onChange={setLabelNoteDraft}
                            placeholder="Folder notes…"
                            onRequestSave={handleSaveLabelNote}
                        />

                        <div className="modal-actions">
                            <button onClick={closeLabelNoteModal}>Cancel</button>
                            {activeLabelNote?.id && <button onClick={handleDeleteLabelNote}>Delete</button>}
                            <button
                                className="primary-btn"
                                onClick={handleSaveLabelNote}
                                disabled={isEmptyHtml(labelNoteDraft)}
                            >
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
