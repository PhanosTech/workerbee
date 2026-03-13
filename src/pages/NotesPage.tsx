import React, { useEffect, useMemo, useRef, useState } from 'react';
import TiptapEditor from '../components/TiptapEditor';
import { api, Category, Note, Task, TaskNote, TopicNote } from '../api';
import { NotesFocus } from '../App';
import { dateInputToIso, formatDateTime, htmlToPlainText, normalizeNoteContent, toDateInputValue } from '../utils/noteUtils';

type NotesFilter = 'active' | 'done' | 'archived';
type NotesSource = 'tasks' | 'topics';

const EXPANDED_FOLDERS_STORAGE_KEY = 'wb-notes-expanded-folders-v2';
const TASK_FILTER_STORAGE_KEY = 'wb-notes-task-filter-v1';

interface NotesPageProps {
    focus?: NotesFocus | null;
    onOpenSearch?: () => void;
}

const sortCategories = (a: Category, b: Category) => {
    const ap = Number(a.position ?? 0);
    const bp = Number(b.position ?? 0);
    if (ap !== bp) return ap - bp;
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
};

const sortTasks = (a: Task, b: Task) => {
    const ap = Number(a.list_position ?? 0);
    const bp = Number(b.list_position ?? 0);
    if (ap !== bp) return ap - bp;
    return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
};

const toTaskNote = (note: Note, task: Task): TaskNote => ({
    ...note,
    content: normalizeNoteContent(note.content),
    category_id: task.category_id ?? null,
    task_title: task.title ?? null,
    task_status: task.status ?? null,
    task_archived: Number(task.archived ?? 0),
});

const getTaskFilters = (filter: NotesFilter) => {
    if (filter === 'done') {
        return { statuses: ['DONE'] };
    }
    if (filter === 'archived') {
        return { archived: 'only' as const };
    }
    return { statuses: ['BACKLOG', 'STARTED', 'DOING'] };
};

const NotesPage: React.FC<NotesPageProps> = ({ focus, onOpenSearch }) => {
    const [categories, setCategories] = useState<Category[]>([]);
    const [expandedCategories, setExpandedCategories] = useState<Set<number>>(() => {
        if (typeof window === 'undefined') return new Set();
        try {
            const raw = window.localStorage.getItem(EXPANDED_FOLDERS_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(parsed)) return new Set();
            return new Set(parsed.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value) && value > 0));
        } catch {
            return new Set();
        }
    });
    const [taskFilter, setTaskFilter] = useState<NotesFilter>(() => {
        if (typeof window === 'undefined') return 'active';
        const raw = window.localStorage.getItem(TASK_FILTER_STORAGE_KEY);
        return raw === 'done' || raw === 'archived' ? raw : 'active';
    });
    const [notesSource, setNotesSource] = useState<NotesSource>('tasks');
    const [tasksByCategory, setTasksByCategory] = useState<Record<number, Task[]>>({});
    const [taskNotesMap, setTaskNotesMap] = useState<Record<number, TaskNote[]>>({});
    const [loadingCategories, setLoadingCategories] = useState<Set<number>>(new Set());
    const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
    const [selectedNote, setSelectedNote] = useState<TaskNote | null>(null);
    const [noteDirty, setNoteDirty] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [topicNotes, setTopicNotes] = useState<TopicNote[]>([]);
    const [selectedTopicNote, setSelectedTopicNote] = useState<TopicNote | null>(null);
    const [topicNoteDirty, setTopicNoteDirty] = useState(false);
    const [topicNotesLoading, setTopicNotesLoading] = useState(false);
    const [topicStartDate, setTopicStartDate] = useState('');
    const [topicEndDate, setTopicEndDate] = useState('');

    const noteDirtyRef = useRef(false);
    const selectedNoteRef = useRef<TaskNote | null>(null);
    const autoSaveTimerRef = useRef<number | null>(null);
    const fetchSeqRef = useRef<Map<number, number>>(new Map());
    const topicNoteDirtyRef = useRef(false);
    const selectedTopicNoteRef = useRef<TopicNote | null>(null);
    const topicNoteAutoSaveTimerRef = useRef<number | null>(null);

    const categoryById = useMemo(() => {
        const map = new Map<number, Category>();
        categories.forEach((category) => map.set(category.id, category));
        return map;
    }, [categories]);

    const childrenByParent = useMemo(() => {
        const map = new Map<number | null, Category[]>();
        categories.forEach((category) => {
            const key = category.parent_id ?? null;
            const list = map.get(key) || [];
            list.push(category);
            map.set(key, list);
        });
        for (const [key, list] of map.entries()) {
            map.set(key, list.slice().sort(sortCategories));
        }
        return map;
    }, [categories]);

    const taskById = useMemo(() => {
        const map = new Map<number, Task>();
        Object.values(tasksByCategory).flat().forEach((task) => map.set(task.id, task));
        return map;
    }, [tasksByCategory]);

    useEffect(() => {
        noteDirtyRef.current = noteDirty;
    }, [noteDirty]);

    useEffect(() => {
        selectedNoteRef.current = selectedNote;
    }, [selectedNote]);

    useEffect(() => {
        topicNoteDirtyRef.current = topicNoteDirty;
    }, [topicNoteDirty]);

    useEffect(() => {
        selectedTopicNoteRef.current = selectedTopicNote;
    }, [selectedTopicNote]);

    useEffect(() => {
        try {
            window.localStorage.setItem(EXPANDED_FOLDERS_STORAGE_KEY, JSON.stringify(Array.from(expandedCategories)));
        } catch {
            // ignore
        }
    }, [expandedCategories]);

    useEffect(() => {
        try {
            window.localStorage.setItem(TASK_FILTER_STORAGE_KEY, taskFilter);
        } catch {
            // ignore
        }
    }, [taskFilter]);

    const fetchCategories = async () => {
        try {
            const data = await api.getCategories();
            setCategories((data || []).slice().sort(sortCategories));
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchCategories();
    }, []);

    const expandAncestors = (categoryId: number | null) => {
        if (!categoryId) return;
        setExpandedCategories((prev) => {
            const next = new Set(prev);
            let current: Category | undefined = categoryById.get(categoryId);
            const seen = new Set<number>();
            while (current && !seen.has(current.id)) {
                next.add(current.id);
                seen.add(current.id);
                current = current.parent_id ? categoryById.get(current.parent_id) : undefined;
            }
            return next;
        });
    };

    const fetchCategoryContent = async (categoryId: number) => {
        const seq = (fetchSeqRef.current.get(categoryId) || 0) + 1;
        fetchSeqRef.current.set(categoryId, seq);
        setLoadingCategories((prev) => new Set(prev).add(categoryId));

        try {
            const tasks = (await api.getTasks({ category_id: categoryId, ...getTaskFilters(taskFilter) })) || [];
            const sortedTasks = tasks.slice().sort(sortTasks);
            const notesEntries = await Promise.all(
                sortedTasks.map(async (task) => {
                    const notes = await api.getTaskNotes(task.id);
                    return [task.id, (notes || []).map((note) => toTaskNote(note, task))] as const;
                })
            );

            if (fetchSeqRef.current.get(categoryId) !== seq) return;

            setTasksByCategory((prev) => ({ ...prev, [categoryId]: sortedTasks }));
            setTaskNotesMap((prev) => {
                const next = { ...prev };
                notesEntries.forEach(([taskId, notes]) => {
                    next[taskId] = notes;
                });
                return next;
            });
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingCategories((prev) => {
                const next = new Set(prev);
                next.delete(categoryId);
                return next;
            });
        }
    };

    const fetchTopicNotes = async (preferredNoteId?: number | null) => {
        setTopicNotesLoading(true);
        try {
            const data = await api.getAllTopicNotes({
                startDate: topicStartDate || undefined,
                endDate: topicEndDate || undefined,
            });
            const normalized = (data || []).map((note) => ({
                ...note,
                content: normalizeNoteContent(note.content),
            }));
            setTopicNotes(normalized);
            setSelectedTopicNote((prev) => {
                if (!normalized.length) return null;
                const targetId = preferredNoteId ?? prev?.id ?? normalized[0].id;
                return normalized.find((note) => note.id === targetId) || normalized[0];
            });
        } catch (err) {
            console.error(err);
            setTopicNotes([]);
            setSelectedTopicNote(null);
        } finally {
            setTopicNotesLoading(false);
        }
    };

    useEffect(() => {
        setTasksByCategory({});
        setTaskNotesMap({});
        if (!expandedCategories.size) return;
        Array.from(expandedCategories).forEach((categoryId) => {
            fetchCategoryContent(categoryId);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskFilter]);

    useEffect(() => {
        if (notesSource !== 'topics') return;
        void fetchTopicNotes();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [notesSource, topicStartDate, topicEndDate]);

    const toggleCategory = (categoryId: number) => {
        const isOpen = expandedCategories.has(categoryId);
        if (isOpen) {
            setExpandedCategories((prev) => {
                const next = new Set(prev);
                next.delete(categoryId);
                return next;
            });
            return;
        }

        setExpandedCategories((prev) => {
            const next = new Set(prev);
            next.add(categoryId);
            return next;
        });
        fetchCategoryContent(categoryId);
    };

    const handleSaveNote = async (note: TaskNote | null = selectedNoteRef.current) => {
        if (!note) return;
        try {
            await api.updateNote(note.id, note.title, note.content);
            const nextNote = { ...note, updated_at: new Date().toISOString() };
            setTaskNotesMap((prev) => ({
                ...prev,
                [note.task_id]: (prev[note.task_id] || []).map((entry) => (entry.id === note.id ? nextNote : entry)),
            }));
            setSelectedNote((prev) => (prev?.id === note.id ? nextNote : prev));
            setNoteDirty(false);
        } catch (err) {
            console.error(err);
        }
    };

    const handleSelectNote = (note: TaskNote | null) => {
        if (noteDirtyRef.current && selectedNoteRef.current) {
            void handleSaveNote(selectedNoteRef.current);
        }
        setSelectedNote(note);
        setSelectedTaskId(note?.task_id ?? null);
        setNoteDirty(false);
        if (note?.category_id) expandAncestors(note.category_id);
        if (note?.id) {
            const nextHash = `#/notes/${note.id}`;
            if (window.location.hash !== nextHash) {
                window.history.replaceState(null, '', nextHash);
            }
        }
    };

    const handleSelectTask = (task: Task) => {
        setSelectedTaskId(task.id);
        const notes = taskNotesMap[task.id] || [];
        if (notes.length) {
            handleSelectNote(notes[0]);
            return;
        }
        if (noteDirtyRef.current && selectedNoteRef.current) {
            void handleSaveNote(selectedNoteRef.current);
        }
        setSelectedNote(null);
        setNoteDirty(false);
    };

    const handleCreateNote = async (task: Task) => {
        try {
            const result = await api.addNote(task.id, '', '', 'rich_text');
            const note = await api.getNote(Number(result.lastInsertRowid));
            if (!note) return;
            const normalizedNote = {
                ...note,
                content: normalizeNoteContent(note.content),
            };
            setTaskNotesMap((prev) => ({
                ...prev,
                [task.id]: [normalizedNote, ...(prev[task.id] || [])],
            }));
            handleSelectNote(normalizedNote);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        if (!noteDirty || !selectedNote?.id) return;
        if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = window.setTimeout(() => {
            void handleSaveNote(selectedNote);
        }, 700);
        return () => {
            if (autoSaveTimerRef.current) {
                window.clearTimeout(autoSaveTimerRef.current);
                autoSaveTimerRef.current = null;
            }
        };
    }, [noteDirty, selectedNote?.id, selectedNote?.title, selectedNote?.content]);

    const handleDeleteNote = async () => {
        if (!selectedNote?.id) return;
        if (!window.confirm('Delete this task note?')) return;
        try {
            const taskId = selectedNote.task_id;
            await api.deleteNote(selectedNote.id);
            const remaining = (taskNotesMap[taskId] || []).filter((note) => note.id !== selectedNote.id);
            setTaskNotesMap((prev) => ({ ...prev, [taskId]: remaining }));
            setSelectedNote(remaining[0] || null);
            setSelectedTaskId(remaining.length ? taskId : null);
            setNoteDirty(false);
        } catch (err) {
            console.error(err);
        }
    };

    const handleSaveTopicNote = async (note: TopicNote | null = selectedTopicNoteRef.current) => {
        if (!note?.id) return;
        try {
            const previousNote = topicNotes.find((entry) => entry.id === note.id);
            const dateChanged = previousNote?.created_at !== note.created_at;
            await api.updateTopicNote(note.id, note.title ?? null, note.content ?? null, note.created_at ?? null);
            const nextNote = { ...note, updated_at: new Date().toISOString() };
            if (dateChanged) {
                await fetchTopicNotes(note.id);
            } else {
                setTopicNotes((prev) => prev.map((entry) => (entry.id === note.id ? nextNote : entry)));
                setSelectedTopicNote((prev) => (prev?.id === note.id ? nextNote : prev));
            }
            setTopicNoteDirty(false);
        } catch (err) {
            console.error(err);
        }
    };

    const updateSelectedTopicNoteDraft = (updates: Partial<TopicNote>, options: { syncList?: boolean } = {}) => {
        const currentId = selectedTopicNoteRef.current?.id;
        if (!currentId) return;
        setSelectedTopicNote((prev) => (prev ? { ...prev, ...updates } : prev));
        if (options.syncList !== false) {
            setTopicNotes((prev) =>
                prev.map((note) => (note.id === currentId ? { ...note, ...updates } : note))
            );
        }
        setTopicNoteDirty(true);
    };

    const handleSelectTopicNote = (note: TopicNote | null) => {
        if (topicNoteDirtyRef.current && selectedTopicNoteRef.current) {
            void handleSaveTopicNote(selectedTopicNoteRef.current);
        }
        setSelectedTopicNote(note);
        setTopicNoteDirty(false);
    };

    useEffect(() => {
        if (!topicNoteDirty || !selectedTopicNote?.id) return;
        if (topicNoteAutoSaveTimerRef.current) window.clearTimeout(topicNoteAutoSaveTimerRef.current);
        topicNoteAutoSaveTimerRef.current = window.setTimeout(() => {
            void handleSaveTopicNote(selectedTopicNote);
        }, 700);
        return () => {
            if (topicNoteAutoSaveTimerRef.current) {
                window.clearTimeout(topicNoteAutoSaveTimerRef.current);
                topicNoteAutoSaveTimerRef.current = null;
            }
        };
    }, [topicNoteDirty, selectedTopicNote?.id, selectedTopicNote?.title, selectedTopicNote?.content, selectedTopicNote?.created_at]);

    const handleDeleteTopicNote = async () => {
        if (!selectedTopicNote?.id) return;
        if (!window.confirm('Delete this thread note?')) return;
        try {
            await api.deleteTopicNote(selectedTopicNote.id);
            const remaining = topicNotes.filter((note) => note.id !== selectedTopicNote.id);
            setTopicNotes(remaining);
            setSelectedTopicNote(remaining[0] || null);
            setTopicNoteDirty(false);
        } catch (err) {
            console.error(err);
        }
    };

    const handleSwitchSource = (nextSource: NotesSource) => {
        if (nextSource === notesSource) return;
        if (notesSource === 'tasks' && noteDirtyRef.current && selectedNoteRef.current) {
            void handleSaveNote(selectedNoteRef.current);
        }
        if (notesSource === 'topics' && topicNoteDirtyRef.current && selectedTopicNoteRef.current) {
            void handleSaveTopicNote(selectedTopicNoteRef.current);
        }
        setNotesSource(nextSource);
    };

    useEffect(() => {
        const noteId = Number(focus?.noteId);
        if (!noteId) return;
        setNotesSource('tasks');
        (async () => {
            const note = await api.getNote(noteId);
            if (!note) return;
            if (note.category_id) {
                expandAncestors(note.category_id);
                await fetchCategoryContent(note.category_id);
            }
            handleSelectNote(note);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focus?.nonce]);

    const renderCategoryTree = (parentId: number | null = null, depth = 0): React.ReactNode => {
        const nodes = childrenByParent.get(parentId) || [];
        if (!nodes.length) return null;

        return nodes.map((category) => {
            const isOpen = expandedCategories.has(category.id);
            const tasks = tasksByCategory[category.id] || [];
            const visibleTasks = tasks.filter((task) => (taskNotesMap[task.id] || []).length > 0);
            const isLoadingCategory = loadingCategories.has(category.id);

            return (
                <div key={category.id}>
                    <button
                        type="button"
                        className={`notes-tree-row notes-tree-category ${isOpen ? 'active' : ''}`}
                        style={{ paddingLeft: depth * 16 }}
                        onClick={() => toggleCategory(category.id)}
                    >
                        <span className={`notes-tree-twist ${isOpen ? 'open' : ''}`} aria-hidden="true">
                            ▸
                        </span>
                        <span className="notes-tree-dot" style={{ backgroundColor: category.color || 'var(--text-faint)' }} aria-hidden="true" />
                        <span className="notes-tree-icon" aria-hidden="true">📁</span>
                        <span className="notes-tree-title">{category.name}</span>
                    </button>

                    {isOpen ? (
                        <div className="notes-tree-children">
                            {isLoadingCategory && <div className="notes-tree-empty">Loading tasks…</div>}
                            {!isLoadingCategory && visibleTasks.length === 0 && <div className="notes-tree-empty">No task notes in this view.</div>}
                            {visibleTasks.map((task) => {
                                const notes = taskNotesMap[task.id] || [];
                                const isTaskSelected = selectedTaskId === task.id;
                                return (
                                    <div key={task.id}>
                                        <div
                                            className={`notes-tree-row notes-tree-task ${isTaskSelected ? 'active' : ''}`}
                                            style={{ paddingLeft: depth * 16 + 20 }}
                                        >
                                            <button type="button" className="notes-tree-main" onClick={() => handleSelectTask(task)}>
                                                <span className="notes-tree-icon" aria-hidden="true">📋</span>
                                                <span className="notes-tree-title">{task.title}</span>
                                                <span className="notes-task-meta">{notes.length}</span>
                                            </button>
                                            <button
                                                type="button"
                                                className="notes-tree-action visible"
                                                title="New task note"
                                                aria-label="New task note"
                                                onClick={() => handleCreateNote(task)}
                                            >
                                                +
                                            </button>
                                        </div>
                                        {notes.map((note) => (
                                            <button
                                                key={note.id}
                                                type="button"
                                                className={`notes-tree-row notes-tree-note ${selectedNote?.id === note.id ? 'active' : ''}`}
                                                style={{ paddingLeft: depth * 16 + 40 }}
                                                onClick={() => handleSelectNote(note)}
                                            >
                                                <span className="notes-tree-icon" aria-hidden="true">📝</span>
                                                <span className="notes-tree-title">{note.title?.trim() || '(Untitled note)'}</span>
                                            </button>
                                        ))}
                                    </div>
                                );
                            })}
                            {renderCategoryTree(category.id, depth + 1)}
                        </div>
                    ) : null}
                </div>
            );
        });
    };

    const selectedTask = selectedTaskId ? taskById.get(selectedTaskId) || null : null;

    return (
        <div className="notes-page">
            <aside className="notes-sidebar" aria-label="Notes navigation">
                <div className="notes-sidebar-header">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <h2 style={{ margin: 0 }}>Notes</h2>
                        <button
                            type="button"
                            className="icon-btn"
                            title="Search"
                            aria-label="Search"
                            onClick={() => onOpenSearch?.()}
                        >
                            🔍
                        </button>
                    </div>
                    <div className="notes-filters" style={{ marginTop: 10 }}>
                        <button type="button" className={`filter-btn ${notesSource === 'tasks' ? 'active' : ''}`} onClick={() => handleSwitchSource('tasks')}>
                            Task Notes
                        </button>
                        <button type="button" className={`filter-btn ${notesSource === 'topics' ? 'active' : ''}`} onClick={() => handleSwitchSource('topics')}>
                            Thread Notes
                        </button>
                    </div>

                    {notesSource === 'tasks' ? (
                        <div className="notes-filters" style={{ marginTop: 10 }}>
                            <button type="button" className={`filter-btn ${taskFilter === 'active' ? 'active' : ''}`} onClick={() => setTaskFilter('active')}>
                                Backlog + Doing
                            </button>
                            <button type="button" className={`filter-btn ${taskFilter === 'done' ? 'active' : ''}`} onClick={() => setTaskFilter('done')}>
                                Done
                            </button>
                            <button type="button" className={`filter-btn ${taskFilter === 'archived' ? 'active' : ''}`} onClick={() => setTaskFilter('archived')}>
                                Archived
                            </button>
                        </div>
                    ) : (
                        <div className="notes-date-filters" style={{ marginTop: 10 }}>
                            <label className="notes-date-field">
                                <span>From</span>
                                <input type="date" value={topicStartDate} onChange={(e) => setTopicStartDate(e.target.value)} />
                            </label>
                            <label className="notes-date-field">
                                <span>To</span>
                                <input type="date" value={topicEndDate} onChange={(e) => setTopicEndDate(e.target.value)} />
                            </label>
                            {(topicStartDate || topicEndDate) ? (
                                <button type="button" className="link-btn" onClick={() => { setTopicStartDate(''); setTopicEndDate(''); }}>
                                    Clear
                                </button>
                            ) : null}
                        </div>
                    )}
                </div>

                <div className="notes-sidebar-content">
                    {notesSource === 'tasks' ? (
                        isLoading ? <div className="notes-tree-empty">Loading…</div> : renderCategoryTree(null)
                    ) : topicNotesLoading ? (
                        <div className="notes-tree-empty">Loading thread notes…</div>
                    ) : topicNotes.length === 0 ? (
                        <div className="notes-tree-empty">No thread notes in this date range.</div>
                    ) : (
                        <ul className="notes-list topic-notes-list">
                            {topicNotes.map((note) => (
                                <li key={note.id}>
                                    <button
                                        type="button"
                                        className={`topic-note-list-item ${selectedTopicNote?.id === note.id ? 'active' : ''}`}
                                        onClick={() => handleSelectTopicNote(note)}
                                    >
                                        <div className="note-row-title">{note.title?.trim() || '(Untitled note)'}</div>
                                        <div className="note-row-meta">
                                            {(note.topic_title || 'Thread')} · {formatDateTime(note.created_at)}
                                        </div>
                                        <div className="note-row-preview">
                                            {htmlToPlainText(note.content).slice(0, 120) || 'Empty note'}
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </aside>

            <section className="notes-editor-area" aria-label="Notes editor">
                {notesSource === 'tasks' ? (
                    selectedNote ? (
                        <>
                            <header className="note-header">
                                <div className="note-header-meta">
                                    <div className="muted">
                                        {selectedNote.task_title || 'Task note'} · {selectedNote.task_status || 'Unknown'} · Created {formatDateTime(selectedNote.created_at)}
                                    </div>
                                    <input
                                        className="note-title-input"
                                        value={selectedNote.title || ''}
                                        onChange={(e) => {
                                            setSelectedNote((prev) => prev ? { ...prev, title: e.target.value } : prev);
                                            setNoteDirty(true);
                                        }}
                                        onBlur={() => void handleSaveNote()}
                                        placeholder="Note title"
                                    />
                                </div>
                                <div className="note-header-actions">
                                    <button type="button" className="link-btn danger-link" onClick={handleDeleteNote}>
                                        Delete
                                    </button>
                                </div>
                            </header>
                            <div className="note-editor-wrapper">
                                <TiptapEditor
                                    content={selectedNote.content || ''}
                                    onChange={(html) => {
                                        setSelectedNote((prev) => prev ? ({ ...prev, content: html }) : prev);
                                        setNoteDirty(true);
                                    }}
                                    onRequestSave={handleSaveNote}
                                    placeholder="Write task notes here…"
                                />
                            </div>
                        </>
                    ) : selectedTask ? (
                        <div className="notes-empty-state">
                            <div className="notes-empty-icon" aria-hidden="true">📝</div>
                            <p>{selectedTask.title} does not have a note yet.</p>
                            <button type="button" className="primary-btn" onClick={() => handleCreateNote(selectedTask)}>
                                Create First Note
                            </button>
                        </div>
                    ) : (
                        <div className="notes-empty-state">
                            <div className="notes-empty-icon" aria-hidden="true">📝</div>
                            <p>Select a task note from the sidebar.</p>
                        </div>
                    )
                ) : selectedTopicNote ? (
                    <>
                        <header className="note-header">
                            <div className="note-header-meta">
                                <div className="muted">
                                    {selectedTopicNote.topic_title || 'Thread note'} · {selectedTopicNote.topic_status || 'Unknown'} · Date {formatDateTime(selectedTopicNote.created_at)}
                                </div>
                                <input
                                    className="note-title-input"
                                    value={selectedTopicNote.title || ''}
                                    onChange={(e) => updateSelectedTopicNoteDraft({ title: e.target.value })}
                                    onBlur={() => void handleSaveTopicNote()}
                                    placeholder="Note title"
                                />
                            </div>
                            <div className="note-header-actions">
                                <label className="notes-date-field">
                                    <span>Thread Date</span>
                                    <input
                                        type="date"
                                        value={toDateInputValue(selectedTopicNote.created_at)}
                                        onChange={(e) => {
                                            const nextCreatedAt = dateInputToIso(e.target.value);
                                            if (!nextCreatedAt) return;
                                            updateSelectedTopicNoteDraft({ created_at: nextCreatedAt }, { syncList: false });
                                        }}
                                        onBlur={() => void handleSaveTopicNote()}
                                    />
                                </label>
                                <button type="button" className="link-btn danger-link" onClick={handleDeleteTopicNote}>
                                    Delete
                                </button>
                            </div>
                        </header>
                        <div className="note-editor-wrapper">
                            <TiptapEditor
                                content={selectedTopicNote.content || ''}
                                onChange={(html) => updateSelectedTopicNoteDraft({ content: html })}
                                onRequestSave={handleSaveTopicNote}
                                placeholder="Review and refine the saved email thread here…"
                            />
                        </div>
                    </>
                ) : (
                    <div className="notes-empty-state">
                        <div className="notes-empty-icon" aria-hidden="true">📝</div>
                        <p>Select a thread note from the sidebar.</p>
                    </div>
                )}
            </section>
        </div>
    );
};

export default NotesPage;
