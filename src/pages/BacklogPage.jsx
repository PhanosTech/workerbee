import React, { useMemo, useState, useEffect } from 'react';
import { api } from '../api';
import TaskModal from '../components/TaskModal';
import TiptapEditor from '../components/TiptapEditor';

const LABEL_COLOR_PRESETS = [
    '#89b4fa',
    '#74c7ec',
    '#94e2d5',
    '#a6e3a1',
    '#f9e2af',
    '#fab387',
    '#eba0ac',
    '#f38ba8',
    '#cba6f7',
    '#b4befe',
];

const STORAGE_DEFAULT_FOLDER_KEY = 'wb-default-folder-id';
const STORAGE_COLLAPSED_FOLDERS_KEY = 'wb-folders-collapsed';

const BacklogPage = ({ focus }) => {
    const [categories, setCategories] = useState([]);
    const [categoriesLoaded, setCategoriesLoaded] = useState(false);
    const [tasks, setTasks] = useState([]);
    const [notes, setNotes] = useState([]); // Label Notes

    const [selectedCategoryId, setSelectedCategoryId] = useState(null);
    const [selectedTask, setSelectedTask] = useState(null);
    const [activeTab, setActiveTab] = useState('tasks'); // tasks | notes
    const [noteTypeFilter, setNoteTypeFilter] = useState('work_notes'); // email, meeting_notes, review_notes, work_notes
    const [includeSubLabels, setIncludeSubLabels] = useState(false);

    // UI state
    const [showCreateCat, setShowCreateCat] = useState(false);
    const [newCatName, setNewCatName] = useState('');
    const [showCreateTask, setShowCreateTask] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [draggingCategory, setDraggingCategory] = useState(null); // { id, parent_id }

    const [defaultCategoryId, setDefaultCategoryId] = useState(() => {
        if (typeof window === 'undefined') return null;
        const raw = window.localStorage.getItem(STORAGE_DEFAULT_FOLDER_KEY);
        const parsed = raw ? Number(raw) : null;
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    });

    const [collapsedCategories, setCollapsedCategories] = useState(() => {
        if (typeof window === 'undefined') return new Set();
        try {
            const raw = window.localStorage.getItem(STORAGE_COLLAPSED_FOLDERS_KEY);
            const ids = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(ids)) return new Set();
            return new Set(
                ids
                    .map((id) => Number(id))
                    .filter((id) => Number.isFinite(id) && id > 0)
            );
        } catch {
            return new Set();
        }
    });

    // Label Settings
    const [showLabelSettings, setShowLabelSettings] = useState(false);
    const [labelDraft, setLabelDraft] = useState({ id: null, parent_id: null, name: '', color: '#89b4fa' });

    // Label Note Modal
    const [showNoteModal, setShowNoteModal] = useState(false);
    const [activeLabelNote, setActiveLabelNote] = useState(null);
    const [noteDraftTitle, setNoteDraftTitle] = useState('');
    const [noteDraftContent, setNoteDraftContent] = useState('');
    const [noteDraftType, setNoteDraftType] = useState(noteTypeFilter);

    useEffect(() => {
        loadCategories();
    }, []);

    useEffect(() => {
        if (!categoriesLoaded) return;
        if (selectedCategoryId) return;
        if (focus?.taskId) return;
        if (!defaultCategoryId) return;

        const exists = findCategoryById(categories, defaultCategoryId);
        if (exists) {
            setSelectedCategoryId(defaultCategoryId);
            setActiveTab('tasks');
            return;
        }

        window.localStorage.removeItem(STORAGE_DEFAULT_FOLDER_KEY);
        setDefaultCategoryId(null);
    }, [categoriesLoaded, categories, selectedCategoryId, defaultCategoryId, focus?.taskId]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(STORAGE_COLLAPSED_FOLDERS_KEY, JSON.stringify(Array.from(collapsedCategories)));
    }, [collapsedCategories]);

    useEffect(() => {
        if (!focus?.taskId) return;
        if (focus.categoryId) setSelectedCategoryId(focus.categoryId);
        setActiveTab('tasks');
        setSelectedTask({ id: focus.taskId });
    }, [focus?.nonce]);

    const findCategoryById = (nodes, id) => {
        if (!id) return null;
        for (const node of nodes) {
            if (node.id === id) return node;
            const inChild = findCategoryById(node.children || [], id);
            if (inChild) return inChild;
        }
        return null;
    };

    const selectedCategory = useMemo(
        () => findCategoryById(categories, selectedCategoryId),
        [categories, selectedCategoryId]
    );

    useEffect(() => {
        if (selectedCategory) {
            if (activeTab === 'tasks') {
                loadTasks(selectedCategory.id);
            } else {
                loadNotes(selectedCategory.id, noteTypeFilter);
            }
        } else {
            setTasks([]);
            setNotes([]);
        }
    }, [selectedCategoryId, activeTab, noteTypeFilter, categories, includeSubLabels]);

    const loadCategories = async () => {
        const data = await api.getCategories();
        const tree = buildTree(data);
        setCategories(tree);
        setCategoriesLoaded(true);
    };

    const buildTree = (cats) => {
        const map = {};
        const roots = [];
        cats.forEach(c => map[c.id] = { ...c, children: [] });
        cats.forEach(c => {
            if (c.parent_id && map[c.parent_id]) {
                map[c.parent_id].children.push(map[c.id]);
            } else {
                roots.push(map[c.id]);
            }
        });
        return roots;
    };

    const loadTasks = async (catId) => {
        const filters = { category_id: catId };
        if (includeSubLabels) filters.include_descendants = '1';
        const data = await api.getTasks(filters);
        setTasks(data);
    };

    const loadNotes = async (catId, type) => {
        const data = await api.getLabelNotes(catId, type);
        setNotes(data);
    };

    const handleCreateCategory = async (e) => {
        e.preventDefault();
        const parentId = selectedCategoryId || null;
        await api.createCategory(parentId, newCatName, '#89b4fa');
        setNewCatName('');
        setShowCreateCat(false);
        loadCategories();
    };

    const handleCreateTask = async (e) => {
        e.preventDefault();
        if (!selectedCategory) return;
        await api.createTask(selectedCategory.id, newTaskTitle, '', '');
        setNewTaskTitle('');
        setShowCreateTask(false);
        loadTasks(selectedCategory.id);
    };

    const handleArchiveCategory = async (id) => {
        if (confirm('Delete this folder and all its contents?')) {
            await api.archiveCategory(id);
            if (defaultCategoryId === id) {
                window.localStorage.removeItem(STORAGE_DEFAULT_FOLDER_KEY);
                setDefaultCategoryId(null);
            }
            if (selectedCategoryId === id) setSelectedCategoryId(null);
            loadCategories();
        }
    };

    const handleArchiveTask = async (e, task) => {
        e.stopPropagation();
        if (!confirm('Archive this task?')) return;
        await api.archiveTask(task.id);
        if (selectedCategory) loadTasks(selectedCategory.id);
    };

    const handleStartTask = async (e, task) => {
        e.stopPropagation();
        await api.updateTask(task.id, { status: 'STARTED' });
        loadTasks(selectedCategory.id);
    };

    // Note Handlers
    const htmlToPlainText = (html) =>
        (html || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();

    const hasMeaningfulText = (html) => htmlToPlainText(html).length > 0;

    const openLabelNoteModal = (note) => {
        setActiveLabelNote(note || null);
        setNoteDraftTitle(note?.title || '');
        setNoteDraftContent(note?.content || '');
        setNoteDraftType(note?.type || noteTypeFilter);
        setShowNoteModal(true);
    };

    const closeLabelNoteModal = () => {
        setShowNoteModal(false);
        setActiveLabelNote(null);
        setNoteDraftTitle('');
        setNoteDraftContent('');
        setNoteDraftType(noteTypeFilter);
    };

    const handleSaveNote = async () => {
        if (!selectedCategory) return;
        if (!hasMeaningfulText(noteDraftContent)) return;

        if (activeLabelNote?.id) {
            await api.updateLabelNote(activeLabelNote.id, noteDraftTitle, noteDraftContent);
        } else {
            await api.addLabelNote(selectedCategory.id, noteDraftTitle, noteDraftContent, noteDraftType || noteTypeFilter);
        }

        closeLabelNoteModal();
        loadNotes(selectedCategory.id, noteTypeFilter);
    };

    const handleDeleteNote = async (id) => {
        if (!selectedCategory) return;
        if (confirm('Delete this note?')) {
            await api.deleteLabelNote(id);
            if (activeLabelNote?.id === id) closeLabelNoteModal();
            loadNotes(selectedCategory.id, noteTypeFilter);
        }
    };

    const openLabelSettingsFor = (node) => {
        setLabelDraft({
            id: node.id,
            parent_id: node.parent_id ?? null,
            name: node.name || '',
            color: node.color || '#89b4fa',
        });
        setShowLabelSettings(true);
    };

    const handleSaveLabelSettings = async () => {
        if (!labelDraft.id) return;
        await api.updateCategory(labelDraft.id, labelDraft.parent_id, labelDraft.name, labelDraft.color);
        setShowLabelSettings(false);
        loadCategories();
    };

    const handleDeleteLabel = async () => {
        if (!labelDraft.id) return;
        await handleArchiveCategory(labelDraft.id);
        setShowLabelSettings(false);
    };

    const handleToggleDefaultFolder = () => {
        if (!labelDraft.id) return;
        if (defaultCategoryId === labelDraft.id) {
            window.localStorage.removeItem(STORAGE_DEFAULT_FOLDER_KEY);
            setDefaultCategoryId(null);
            return;
        }
        window.localStorage.setItem(STORAGE_DEFAULT_FOLDER_KEY, String(labelDraft.id));
        setDefaultCategoryId(labelDraft.id);
    };

    const toggleCategoryCollapsed = (id) => {
        setCollapsedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleDragStart = (e, node) => {
        setDraggingCategory({ id: node.id, parent_id: node.parent_id ?? null });
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(node.id));
    };

    const handleDropOnSibling = async (e, parentId, targetId, siblings) => {
        e.preventDefault();
        if (!draggingCategory?.id) return;
        if ((draggingCategory.parent_id ?? null) !== (parentId ?? null)) return;
        if (draggingCategory.id === targetId) return;

        const orderedIds = siblings.map((n) => n.id);
        const fromIndex = orderedIds.indexOf(draggingCategory.id);
        const toIndex = orderedIds.indexOf(targetId);
        if (fromIndex === -1 || toIndex === -1) return;

        const next = orderedIds.slice();
        const [moved] = next.splice(fromIndex, 1);
        const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
        next.splice(insertIndex, 0, moved);

        await api.reorderCategories(parentId ?? null, next);
        setDraggingCategory(null);
        loadCategories();
    };

    const renderTree = (nodes, parentId = null) => (
        <ul className="cat-tree">
            {nodes.map((node) => (
                <li
                    key={node.id}
                    onDragOver={(e) => {
                        if (!draggingCategory) return;
                        if ((draggingCategory.parent_id ?? null) !== (parentId ?? null)) return;
                        e.preventDefault();
                    }}
                    onDrop={(e) => handleDropOnSibling(e, parentId, node.id, nodes)}
                >
                    <div
                        className={`cat-item ${selectedCategoryId === node.id ? 'selected' : ''}`}
                        onClick={() => setSelectedCategoryId(node.id)}
                    >
                        <span
                            className="drag-handle"
                            title="Drag to reorder"
                            draggable
                            onDragStart={(e) => handleDragStart(e, node)}
                            onClick={(e) => e.stopPropagation()}
                        >
                            ⋮⋮
                        </span>
                        {node.children.length > 0 ? (
                            <button
                                type="button"
                                className="icon-btn tree-toggle"
                                title={collapsedCategories.has(node.id) ? 'Expand folder' : 'Collapse folder'}
                                aria-label={collapsedCategories.has(node.id) ? 'Expand folder' : 'Collapse folder'}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleCategoryCollapsed(node.id);
                                }}
                            >
                                {collapsedCategories.has(node.id) ? '▸' : '▾'}
                            </button>
                        ) : (
                            <span className="tree-toggle-spacer" aria-hidden="true" />
                        )}
                        <span className="cat-color-dot" style={{ backgroundColor: node.color || '#89b4fa' }} />
                        <span className="cat-name">{node.name}</span>
                        {defaultCategoryId === node.id && (
                            <span className="default-folder-star" title="Default folder" aria-label="Default folder">
                                ★
                            </span>
                        )}
                        <button
                            type="button"
                            className="icon-btn"
                            title="Folder settings"
                            onClick={(e) => {
                                e.stopPropagation();
                                openLabelSettingsFor(node);
                            }}
                        >
                            ⚙️
                        </button>
                    </div>
                    {node.children.length > 0 && !collapsedCategories.has(node.id) && renderTree(node.children, node.id)}
                </li>
            ))}
        </ul>
    );

    return (
        <div className="page backlog-page">
            <div className="backlog-sidebar">
                <div className="sidebar-header">
                    <h3>Folders</h3>
                    <button onClick={() => setShowCreateCat(true)} title="New Folder">+</button>
                </div>

                {showCreateCat && (
                    <form onSubmit={handleCreateCategory} className="mini-form">
                        <input
                            autoFocus
                            placeholder="Folder Name"
                            value={newCatName}
                            onChange={e => setNewCatName(e.target.value)}
                        />
                    </form>
                )}

                <div className="tree-container">
                    {renderTree(categories)}
                </div>
            </div>

            <div className="backlog-content">
                <header className="page-header">
                    <h2>{selectedCategory ? selectedCategory.name : 'Select a Folder'}</h2>
                    {selectedCategory && (
                        <div className="controls">
                            {activeTab === 'tasks' && (
                                <label className="checkbox-inline">
	                                    <input
	                                        type="checkbox"
	                                        checked={includeSubLabels}
	                                        onChange={(e) => setIncludeSubLabels(e.target.checked)}
	                                    />
                                    Include sub-folders
                                </label>
                            )}
                            <button onClick={() => openLabelSettingsFor(selectedCategory)} className="primary-btn">Manage Folder</button>
                        </div>
                    )}
                </header>

                {selectedCategory && (
                    <div className="tabs-header">
                        <button
                            className={`tab-btn ${activeTab === 'tasks' ? 'active' : ''}`}
                            onClick={() => setActiveTab('tasks')}
                        >
                            Tasks
                        </button>
                        <button
                            className={`tab-btn ${activeTab === 'notes' ? 'active' : ''}`}
                            onClick={() => setActiveTab('notes')}
                        >
                            Notes
                        </button>
                    </div>
                )}

                {selectedCategory && activeTab === 'tasks' && (
                    <>
                        {showCreateTask ? (
                            <form onSubmit={handleCreateTask} className="task-create-form">
                                <input
                                    autoFocus
                                    placeholder="Task Title"
                                    value={newTaskTitle}
                                    onChange={e => setNewTaskTitle(e.target.value)}
                                />
                                <button type="submit" className="primary-btn">Create</button>
                                <button type="button" onClick={() => setShowCreateTask(false)}>Cancel</button>
                            </form>
                        ) : (
                            <button onClick={() => setShowCreateTask(true)} style={{ marginBottom: '12px' }}>+ New Task</button>
                        )}

                        <div className="tasks-table-wrap">
                            <table className="tasks-table">
                                <thead>
                                    <tr>
                                        <th>Task</th>
                                        <th>Description</th>
                                        <th>Todos</th>
                                        <th>Status</th>
                                        <th style={{ width: 140 }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tasks.map((task) => {
                                        const total = Number(task.todo_total || 0);
                                        const completed = Number(task.todo_completed || 0);
                                        const pct = total ? Math.round((completed / total) * 100) : null;

                                        return (
                                            <tr key={task.id} className="tasks-row" onClick={() => setSelectedTask(task)}>
                                                <td className="tasks-title">{task.title}</td>
                                                <td className="tasks-desc">{task.description || '—'}</td>
                                                <td className="tasks-todos">
                                                    {total ? (
                                                        <span className="todo-badge">{completed}/{total} ({pct}%)</span>
                                                    ) : (
                                                        '—'
                                                    )}
                                                </td>
                                                <td className="tasks-status">
                                                    {task.status === 'BACKLOG' && <span className="status-badge">Backlog</span>}
                                                    {task.status === 'STARTED' && <span className="status-badge active">Started</span>}
                                                    {task.status === 'DOING' && <span className="status-badge active">Doing</span>}
                                                    {task.status === 'DONE' && <span className="status-badge done">Done</span>}
                                                </td>
                                                <td className="tasks-actions" onClick={(e) => e.stopPropagation()}>
                                                    {task.status === 'BACKLOG' && (
                                                        <button onClick={(e) => handleStartTask(e, task)}>Start</button>
                                                    )}
                                                    <button onClick={() => setSelectedTask(task)} className="primary-btn">Open</button>
                                                    <button className="danger" onClick={(e) => handleArchiveTask(e, task)}>Archive</button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {tasks.length === 0 && <p className="empty-state">No tasks in this folder.</p>}
                        </div>
                    </>
                )}

                {selectedCategory && activeTab === 'notes' && (
                    <div className="notes-view">
                        <div className="notes-toolbar">
                            <div className="notes-filters">
                                {['work_notes', 'email', 'meeting_notes', 'review_notes'].map(type => (
                                    <button
                                        key={type}
                                        className={`filter-btn ${noteTypeFilter === type ? 'active' : ''}`}
                                        onClick={() => setNoteTypeFilter(type)}
                                    >
                                        {type.replace('_', ' ')}
                                    </button>
                                ))}
                            </div>

                            <button className="primary-btn" onClick={() => openLabelNoteModal(null)}>+ New Note</button>
                        </div>

                        <ul className="notes-list label-notes-list">
                            {notes.map(note => (
                                <li key={note.id} className="label-note-row" onClick={() => openLabelNoteModal(note)}>
                                    <div className="label-note-row-top">
                                        <div className="label-note-row-title">
                                            {note.title?.trim() ? note.title : `Note #${note.id}`}
                                        </div>
                                        <div className="label-note-row-actions" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                type="button"
                                                className="icon-btn"
                                                title="Edit note"
                                                onClick={() => openLabelNoteModal(note)}
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                type="button"
                                                className="icon-btn"
                                                title="Delete note"
                                                onClick={() => handleDeleteNote(note.id)}
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                    <div className="label-note-row-preview">
                                        {htmlToPlainText(note.content).slice(0, 140) || 'Empty note'}
                                    </div>
                                    <div className="label-note-row-meta">
                                        {new Date(note.updated_at).toLocaleString()}
                                    </div>
                                </li>
                            ))}
                            {notes.length === 0 && <li className="notes-empty">No notes found.</li>}
                        </ul>
                    </div>
                )}
            </div>

            {selectedTask && (
                <TaskModal
                    taskId={selectedTask.id}
                    onClose={() => setSelectedTask(null)}
                    onUpdate={() => loadTasks(selectedCategory.id)}
                />
            )}

            {showNoteModal && (
                <div
                    className="modal-overlay note-modal-overlay"
                    onMouseDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        closeLabelNoteModal();
                    }}
                >
                    <div className="modal-content note-modal">
                        <div className="modal-header">
                            <h3 style={{ margin: 0 }}>{activeLabelNote ? 'Edit Note' : 'New Note'}</h3>
                            <button className="close-btn" onClick={closeLabelNoteModal}>&times;</button>
                        </div>

                        <input
                            type="text"
                            placeholder="Title (e.g. From Alice, Meeting recap, Link...)"
                            value={noteDraftTitle}
                            onChange={(e) => setNoteDraftTitle(e.target.value)}
                            style={{ marginBottom: 10 }}
                        />

                        <TiptapEditor
                            content={noteDraftContent}
                            onChange={setNoteDraftContent}
                            placeholder={
                                {
                                    work_notes: 'Work notes…',
                                    email: 'Paste an email…',
                                    meeting_notes: 'Meeting notes…',
                                    review_notes: 'Review notes…'
                                }[noteDraftType || noteTypeFilter] || 'Write notes…'
                            }
                            onRequestSave={handleSaveNote}
                        />

                        <div className="modal-actions">
                            <button onClick={closeLabelNoteModal}>Cancel</button>
                            {activeLabelNote?.id && (
                                <button onClick={() => handleDeleteNote(activeLabelNote.id)}>Delete</button>
                            )}
                            <button className="primary-btn" onClick={handleSaveNote} disabled={!hasMeaningfulText(noteDraftContent)}>
                                Save Note
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showLabelSettings && (
                <div
                    className="modal-overlay"
                    onMouseDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        setShowLabelSettings(false);
                    }}
                >
                    <div className="modal-content label-modal">
                        <div className="modal-header">
                            <h3 style={{ margin: 0 }}>Folder Settings</h3>
                            <button className="close-btn" onClick={() => setShowLabelSettings(false)}>&times;</button>
                        </div>

                        <div className="label-form">
                            <label>Name</label>
                            <input
                                type="text"
                                value={labelDraft.name}
                                onChange={(e) => setLabelDraft({ ...labelDraft, name: e.target.value })}
                            />

                            <label>Color</label>
                            <div className="color-swatches" role="list" aria-label="Quick colors">
                                {LABEL_COLOR_PRESETS.map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        className={`color-swatch ${String(labelDraft.color || '').toLowerCase() === color ? 'selected' : ''}`}
                                        style={{ backgroundColor: color }}
                                        title={color}
                                        aria-label={`Use color ${color}`}
                                        onClick={() => setLabelDraft({ ...labelDraft, color })}
                                    />
                                ))}
                            </div>
                            <input
                                type="color"
                                value={labelDraft.color || '#89b4fa'}
                                onChange={(e) => setLabelDraft({ ...labelDraft, color: e.target.value })}
                                style={{ width: '140px', height: '42px', padding: 0 }}
                            />
                        </div>

                        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <button className="danger" onClick={handleDeleteLabel}>Delete Folder</button>
                                <button type="button" onClick={handleToggleDefaultFolder} title="Default folder for Backlog">
                                    {defaultCategoryId === labelDraft.id ? '★ Default' : '☆ Set Default'}
                                </button>
                            </div>
                            <div>
                                <button onClick={() => setShowLabelSettings(false)}>Cancel</button>
                                <button className="primary-btn" onClick={handleSaveLabelSettings} disabled={!labelDraft.name.trim()}>
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BacklogPage;
