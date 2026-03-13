import React, { useMemo, useState, useEffect, useRef } from 'react';
import { api, Category, Task, LabelNote } from '../api';
import { BacklogFocus } from '../App';
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

interface CategoryNode extends Category {
    children: CategoryNode[];
}

interface BacklogPageProps {
    focus: BacklogFocus | null;
    onOpenSearch: () => void;
}

type TaskView = 'active' | 'done' | 'archived';

const moveBefore = <T extends { id: number }>(items: T[], movingId: number, targetId: number): T[] => {
    const fromIndex = items.findIndex((item) => item.id === movingId);
    const toIndex = items.findIndex((item) => item.id === targetId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return items;

    const next = items.slice();
    const [moved] = next.splice(fromIndex, 1);
    const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    next.splice(insertIndex, 0, moved);
    return next;
};

const moveToEnd = <T extends { id: number }>(items: T[], movingId: number): T[] => {
    const fromIndex = items.findIndex((item) => item.id === movingId);
    if (fromIndex === -1 || fromIndex === items.length - 1) return items;
    const next = items.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.push(moved);
    return next;
};

const taskTypeLabel = (value: string | null | undefined): string => {
    const normalized = String(value || 'NONE').trim().toUpperCase();
    if (normalized === 'FOLLOW_UP') return 'Follow Up';
    if (normalized === 'MEETING') return 'Meeting';
    if (normalized === 'ISSUE') return 'Issue';
    return 'None';
};

const BacklogPage: React.FC<BacklogPageProps> = ({ focus, onOpenSearch }) => {
    const [categories, setCategories] = useState<CategoryNode[]>([]);
    const [categoriesLoaded, setCategoriesLoaded] = useState(false);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [notes, setNotes] = useState<LabelNote[]>([]); // Label Notes

    const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
    const [selectedTask, setSelectedTask] = useState<{ id: number } | null>(null);
    const [activeTab, setActiveTab] = useState<'tasks' | 'notes'>('tasks'); // tasks | notes
    const [taskView, setTaskView] = useState<TaskView>('active');
    const [noteTypeFilter, setNoteTypeFilter] = useState('work_notes'); // email, meeting_notes, review_notes, work_notes
    const [includeSubLabels, setIncludeSubLabels] = useState(false);

    // UI state
    const [showCreateCat, setShowCreateCat] = useState(false);
    const [newCatName, setNewCatName] = useState('');
    const [showCreateTask, setShowCreateTask] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [draggingCategory, setDraggingCategory] = useState<{ id: number; parent_id: number | null } | null>(null); // { id, parent_id }
    const [dragOverCategoryId, setDragOverCategoryId] = useState<number | null>(null);
    const [dragTaskId, setDragTaskId] = useState<number | null>(null);

    const createCatInputRef = useRef<HTMLInputElement>(null);
    const createTaskInputRef = useRef<HTMLInputElement>(null);

    const [defaultCategoryId, setDefaultCategoryId] = useState<number | null>(() => {
        if (typeof window === 'undefined') return null;
        const raw = window.localStorage.getItem(STORAGE_DEFAULT_FOLDER_KEY);
        const parsed = raw ? Number(raw) : null;
        return Number.isFinite(parsed) && parsed && parsed > 0 ? parsed : null;
    });

    const [collapsedCategories, setCollapsedCategories] = useState<Set<number>>(() => {
        if (typeof window === 'undefined') return new Set();
        try {
            const raw = window.localStorage.getItem(STORAGE_COLLAPSED_FOLDERS_KEY);
            const ids = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(ids)) return new Set();
            return new Set(
                ids
                    .map((id: any) => Number(id))
                    .filter((id: number) => Number.isFinite(id) && id > 0)
            );
        } catch {
            return new Set();
        }
    });

    // Label Settings
    const [showLabelSettings, setShowLabelSettings] = useState(false);
    const [labelDraft, setLabelDraft] = useState<{ id: number | null; parent_id: number | null; name: string; color: string }>({ id: null, parent_id: null, name: '', color: '#89b4fa' });

    // Label Note Modal
    const [showNoteModal, setShowNoteModal] = useState(false);
    const [activeLabelNote, setActiveLabelNote] = useState<LabelNote | null>(null);
    const [noteDraftTitle, setNoteDraftTitle] = useState('');
    const [noteDraftContent, setNoteDraftContent] = useState('');
    const [noteDraftType, setNoteDraftType] = useState(noteTypeFilter);

    useEffect(() => {
        loadCategories();
    }, []);

    useEffect(() => {
        if (!showCreateCat) return;
        const raf = window.requestAnimationFrame(() => {
            createCatInputRef.current?.focus?.();
        });
        return () => window.cancelAnimationFrame(raf);
    }, [showCreateCat]);

    useEffect(() => {
        if (!showCreateTask) return;
        const raf = window.requestAnimationFrame(() => {
            createTaskInputRef.current?.focus?.();
        });
        return () => window.cancelAnimationFrame(raf);
    }, [showCreateTask]);

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

    const findCategoryById = (nodes: CategoryNode[], id: number | null): CategoryNode | null => {
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

    const categoryById = useMemo(() => {
        const map = new Map<number, CategoryNode>();
        const walk = (nodes: CategoryNode[]) => {
            nodes.forEach((node) => {
                map.set(node.id, node);
                if (node.children?.length) walk(node.children);
            });
        };
        walk(categories);
        return map;
    }, [categories]);

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
    }, [selectedCategoryId, activeTab, noteTypeFilter, categories, includeSubLabels, taskView]);

    const loadCategories = async () => {
        const data = await api.getCategories();
        const tree = buildTree(data);
        setCategories(tree);
        setCategoriesLoaded(true);
    };

    const buildTree = (cats: Category[]): CategoryNode[] => {
        const map: Record<number, CategoryNode> = {};
        const roots: CategoryNode[] = [];
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

    const loadTasks = async (catId: number) => {
        const filters: any = { category_id: catId };
        if (includeSubLabels) filters.include_descendants = '1';
        if (taskView === 'active') {
            filters.statuses = ['BACKLOG', 'STARTED', 'DOING'];
        } else if (taskView === 'done') {
            filters.statuses = ['DONE'];
        } else {
            filters.archived = 'only';
        }
        const data = await api.getTasks(filters);
        setTasks(data);
    };

    const loadNotes = async (catId: number, type: string) => {
        const data = await api.getLabelNotes(catId, type);
        setNotes(data);
    };

    const openCreateCategory = () => {
        setNewCatName('');
        setShowCreateCat(true);
    };

    const handleCreateCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        const parentId = selectedCategoryId || null;
        if (!newCatName.trim()) return;
        await api.createCategory(parentId, newCatName, '#89b4fa');
        setNewCatName('');
        setShowCreateCat(false);
        loadCategories();
    };

    const handleCreateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCategory) return;
        await api.createTask(selectedCategory.id, newTaskTitle, '', '');
        setNewTaskTitle('');
        setShowCreateTask(false);
        loadTasks(selectedCategory.id);
    };

    const handleArchiveCategory = async (id: number) => {
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

    const handleArchiveTask = async (e: React.MouseEvent, task: Task) => {
        e.stopPropagation();
        if (!confirm('Archive this task?')) return;
        await api.archiveTask(task.id);
        if (selectedCategory) loadTasks(selectedCategory.id);
    };

    const handleStartTask = async (e: React.MouseEvent, task: Task) => {
        e.stopPropagation();
        await api.updateTask(task.id, { ...task, status: 'STARTED' });
        if (selectedCategory) loadTasks(selectedCategory.id);
    };

    const parseDragTaskId = (e: React.DragEvent): number | null => {
        const raw = e.dataTransfer?.getData?.('text/plain');
        const id = Number(raw || dragTaskId);
        return Number.isFinite(id) && id > 0 ? id : null;
    };

    const canManuallySortTasks = !!selectedCategory && !includeSubLabels;

    const handleDropTaskOn = async (e: React.DragEvent, targetId: number) => {
        e.preventDefault();
        e.stopPropagation();
        if (!selectedCategory || !canManuallySortTasks) return;
        const movingId = parseDragTaskId(e);
        if (!movingId || movingId === targetId) return;
        const next = moveBefore(tasks, movingId, targetId);
        setTasks(next);
        setDragTaskId(null);
        await api.reorderTasksInCategory(selectedCategory.id, next.map((task) => task.id));
    };

    const handleDropTaskToEnd = async (e: React.DragEvent) => {
        e.preventDefault();
        if (!selectedCategory || !canManuallySortTasks) return;
        const movingId = parseDragTaskId(e);
        if (!movingId) return;
        const next = moveToEnd(tasks, movingId);
        setTasks(next);
        setDragTaskId(null);
        await api.reorderTasksInCategory(selectedCategory.id, next.map((task) => task.id));
    };

    // Note Handlers
    const htmlToPlainText = (html: string | null) =>
        (html || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();

    const hasMeaningfulText = (html: string | null) => htmlToPlainText(html).length > 0;

    const openLabelNoteModal = (note: LabelNote | null) => {
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

    const handleDeleteNote = async (id: number) => {
        if (!selectedCategory) return;
        if (confirm('Delete this note?')) {
            await api.deleteLabelNote(id);
            if (activeLabelNote?.id === id) closeLabelNoteModal();
            loadNotes(selectedCategory.id, noteTypeFilter);
        }
    };

    const openLabelSettingsFor = (node: CategoryNode) => {
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

    const toggleCategoryCollapsed = (id: number) => {
        setCollapsedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const parseDragCategoryId = (e: React.DragEvent): number | null => {
        const raw = e.dataTransfer?.getData?.('text/plain');
        const id = Number(raw || draggingCategory?.id);
        return Number.isFinite(id) && id > 0 ? id : null;
    };

    const getCategoryParentId = (categoryId: number | null): number | null => {
        if (categoryId === null) return null;
        const node = categoryById.get(categoryId);
        return node?.parent_id ?? null;
    };

    const wouldCreateCycle = (movingId: number, newParentId: number | null): boolean => {
        if (!newParentId) return false;
        let current = categoryById.get(newParentId);
        while (current) {
            if (current.id === movingId) return true;
            current = current.parent_id ? categoryById.get(current.parent_id) : undefined;
        }
        return false;
    };

    const handleDragStart = (e: React.DragEvent, node: CategoryNode) => {
        setDraggingCategory({ id: node.id, parent_id: node.parent_id ?? null });
        setDragOverCategoryId(null);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(node.id));
    };

    const handleDragEnd = () => {
        setDraggingCategory(null);
        setDragOverCategoryId(null);
    };

    const handleDropOnSibling = async (e: React.DragEvent, parentId: number | null, targetId: number, siblings: CategoryNode[]) => {
        e.preventDefault();
        e.stopPropagation();
        const movingId = parseDragCategoryId(e);
        if (!movingId) return;
        if ((getCategoryParentId(movingId) ?? null) !== (parentId ?? null)) return;
        if (movingId === targetId) return;

        const orderedIds = siblings.map((n) => n.id);
        const fromIndex = orderedIds.indexOf(movingId);
        const toIndex = orderedIds.indexOf(targetId);
        if (fromIndex === -1 || toIndex === -1) return;

        const next = orderedIds.slice();
        const [moved] = next.splice(fromIndex, 1);
        const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
        next.splice(insertIndex, 0, moved);

        await api.reorderCategories(parentId ?? null, next);
        setDraggingCategory(null);
        setDragOverCategoryId(null);
        loadCategories();
    };

    const handleMoveCategory = async (e: React.DragEvent, newParentId: number | null) => {
        e.preventDefault();
        e.stopPropagation();
        const movingId = parseDragCategoryId(e);
        if (!movingId) return;
        if ((newParentId ?? null) === movingId) return;
        if (wouldCreateCycle(movingId, newParentId)) return;

        const movingNode = categoryById.get(movingId) || findCategoryById(categories, movingId);
        if (!movingNode) return;

        const currentParentId = movingNode.parent_id ?? null;
        if ((currentParentId ?? null) === (newParentId ?? null)) {
            setDraggingCategory(null);
            setDragOverCategoryId(null);
            return;
        }

        const siblings =
            newParentId == null
                ? categories
                : categoryById.get(newParentId)?.children || [];
        const nextPosition =
            siblings.reduce((m, node) => Math.max(m, Number(node.position ?? 0)), -1) + 1;

        await api.updateCategory(
            movingId,
            newParentId ?? null,
            movingNode.name,
            movingNode.color,
            nextPosition
        );
        setDraggingCategory(null);
        setDragOverCategoryId(null);
        loadCategories();
    };

    const renderTree = (nodes: CategoryNode[], parentId: number | null = null) => (
        <ul className="cat-tree">
            {nodes.map((node) => (
                <li key={node.id}>
                    <div
                        className={`cat-item ${selectedCategoryId === node.id ? 'selected' : ''} ${dragOverCategoryId === node.id ? 'drag-target' : ''}`}
                        onClick={() => setSelectedCategoryId(node.id)}
                        onDragOver={(e) => {
                            if (!draggingCategory) return;
                            const movingId = parseDragCategoryId(e);
                            if (!movingId) return;
                            if (movingId === node.id) return;
                            if (wouldCreateCycle(movingId, node.id)) return;
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'move';
                            setDragOverCategoryId(node.id);
                        }}
                        onDragLeave={() => {
                            setDragOverCategoryId((prev) => (prev === node.id ? null : prev));
                        }}
                        onDrop={(e) => handleMoveCategory(e, node.id)}
                    >
                        <span
                            className="drag-handle"
                            title="Drag to reorder (drop on handle) or move into a folder"
                            draggable
                            onDragStart={(e) => handleDragStart(e, node)}
                            onDragEnd={handleDragEnd}
                            onDragOver={(e) => {
                                if (!draggingCategory) return;
                                const movingId = parseDragCategoryId(e);
                                if (!movingId) return;
                                if ((getCategoryParentId(movingId) ?? null) !== (parentId ?? null)) return;
                                if (movingId === node.id) return;
                                e.preventDefault();
                                e.stopPropagation();
                                e.dataTransfer.dropEffect = 'move';
                            }}
                            onDrop={(e) => handleDropOnSibling(e, parentId, node.id, nodes)}
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
                        {Number(node.task_count_total ?? node.task_count ?? 0) > 0 && (
                            <span
                                className="cat-count"
                                title={`${Number(node.task_count_total ?? node.task_count ?? 0)} tasks (incl. sub-folders)`}
                                aria-label={`${Number(node.task_count_total ?? node.task_count ?? 0)} tasks (including sub-folders)`}
                            >
                                {Number(node.task_count_total ?? node.task_count ?? 0)}
                            </span>
                        )}
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
                    <button type="button" onClick={openCreateCategory} title="New Folder">+</button>
                </div>

                {showCreateCat && (
                    <form onSubmit={handleCreateCategory} className="mini-form">
                        <input
                            ref={createCatInputRef}
                            autoFocus
                            placeholder="Folder Name"
                            value={newCatName}
                            onChange={e => setNewCatName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                    setShowCreateCat(false);
                                    setNewCatName('');
                                }
                            }}
                        />
                    </form>
                )}

                <div
                    className="tree-container"
                    onDragOver={(e) => {
                        if (!draggingCategory) return;
                        const movingId = parseDragCategoryId(e);
                        if (!movingId) return;
                        if ((getCategoryParentId(movingId) ?? null) === null) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDragOverCategoryId(null);
                    }}
                    onDrop={(e) => handleMoveCategory(e, null)}
                >
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
                        <div className="backlog-task-toolbar">
                            <div className="backlog-view-switch" role="tablist" aria-label="Task view">
                                <button
                                    type="button"
                                    className={`filter-btn ${taskView === 'active' ? 'active' : ''}`}
                                    onClick={() => setTaskView('active')}
                                >
                                    Backlog + Doing
                                </button>
                                <button
                                    type="button"
                                    className={`filter-btn ${taskView === 'done' ? 'active' : ''}`}
                                    onClick={() => setTaskView('done')}
                                >
                                    Done
                                </button>
                                <button
                                    type="button"
                                    className={`filter-btn ${taskView === 'archived' ? 'active' : ''}`}
                                    onClick={() => setTaskView('archived')}
                                >
                                    Archived
                                </button>
                            </div>
                            {!canManuallySortTasks && (
                                <div className="muted" style={{ fontSize: '0.8rem' }}>
                                    Manual sort works per folder. Turn off sub-folder mode to reorder.
                                </div>
                            )}
                        </div>

                        {showCreateTask ? (
                            <form onSubmit={handleCreateTask} className="task-create-form">
                                <input
                                    ref={createTaskInputRef}
                                    autoFocus
                                    placeholder="Task Title"
                                    value={newTaskTitle}
                                    onChange={e => setNewTaskTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Escape') {
                                            setShowCreateTask(false);
                                            setNewTaskTitle('');
                                        }
                                    }}
                                />
                                <button type="submit" className="primary-btn">Create</button>
                                <button type="button" onClick={() => setShowCreateTask(false)}>Cancel</button>
                            </form>
                        ) : (
                            <button onClick={() => setShowCreateTask(true)} style={{ marginBottom: '12px' }}>+ New Task</button>
                        )}

                        <div className="tasks-table-wrap">
                            <table className="tasks-table backlog-tasks-table" onDragOver={(e) => canManuallySortTasks && e.preventDefault()} onDrop={handleDropTaskToEnd}>
                                <thead>
                                    <tr>
                                        <th style={{ width: 40 }} />
                                        <th>Task</th>
                                        <th style={{ width: 120 }}>Priority</th>
                                        <th>Status</th>
                                        <th style={{ width: 140 }}>Type</th>
                                        <th style={{ width: 170 }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tasks.map((task) => {
                                        return (
                                            <tr
                                                key={task.id}
                                                className={`tasks-row backlog-task-row task-type-${String(task.task_type || 'NONE').toLowerCase().replaceAll('_', '-')}`}
                                                draggable={canManuallySortTasks}
                                                onDragStart={(e) => {
                                                    if (!canManuallySortTasks) return;
                                                    setDragTaskId(task.id);
                                                    e.dataTransfer.effectAllowed = 'move';
                                                    e.dataTransfer.setData('text/plain', String(task.id));
                                                }}
                                                onDragEnd={() => setDragTaskId(null)}
                                                onDrop={(e) => handleDropTaskOn(e, task.id)}
                                                onClick={() => setSelectedTask(task)}
                                            >
                                                <td className="tasks-handle-cell" onClick={(e) => e.stopPropagation()}>
                                                    <span className={`drag-handle ${canManuallySortTasks ? '' : 'disabled'}`} title={canManuallySortTasks ? 'Drag to reorder' : 'Sorting disabled while showing sub-folders'}>
                                                        ⋮⋮
                                                    </span>
                                                </td>
                                                <td className="tasks-title">
                                                    <span>{task.title}</span>
                                                    {task.description?.trim() ? (
                                                        <span className="task-desc-tooltip" title={task.description}>
                                                            ⓘ
                                                        </span>
                                                    ) : null}
                                                </td>
                                                <td>
                                                    <span className={`priority-badge priority-${String(task.priority || 'NORMAL').toLowerCase()}`}>
                                                        {String(task.priority || 'NORMAL').toLowerCase().replace(/^\w/, (m) => m.toUpperCase())}
                                                    </span>
                                                </td>
                                                <td className="tasks-status">
                                                    {task.status === 'BACKLOG' && <span className="status-badge">Backlog</span>}
                                                    {task.status === 'STARTED' && <span className="status-badge active">Started</span>}
                                                    {task.status === 'DOING' && <span className="status-badge active">Doing</span>}
                                                    {task.status === 'DONE' && <span className="status-badge done">Done</span>}
                                                </td>
                                                <td>
                                                    <span className="task-type-pill">{taskTypeLabel(task.task_type)}</span>
                                                </td>
                                                <td className="tasks-actions" onClick={(e) => e.stopPropagation()}>
                                                    {taskView === 'active' && task.status === 'BACKLOG' && (
                                                        <button onClick={(e) => handleStartTask(e, task)}>Start</button>
                                                    )}
                                                    <button onClick={() => setSelectedTask(task)} className="primary-btn">Open</button>
                                                    {taskView !== 'archived' && <button className="danger" onClick={(e) => handleArchiveTask(e, task)}>Archive</button>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {tasks.length === 0 && <p className="empty-state">No tasks in this view.</p>}
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
                    onUpdate={() => selectedCategory && loadTasks(selectedCategory.id)}
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
                                ({
                                    work_notes: 'Work notes…',
                                    email: 'Paste an email…',
                                    meeting_notes: 'Meeting notes…',
                                    review_notes: 'Review notes…'
                                } as Record<string, string>)[noteDraftType || noteTypeFilter] || 'Write notes…'
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
