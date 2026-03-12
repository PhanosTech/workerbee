import React, { useEffect, useMemo, useRef, useState } from 'react';
import TiptapEditor from '../components/TiptapEditor';
import { api, Category, LabelNote, ArchiveData, Task, Note } from '../api';
import { NotesFocus } from '../App';

type UnifiedNote = (LabelNote & { task_id?: never }) | (Note & { category_id?: number; task_id: number; created_at?: string; updated_at?: string; archived?: number; archived_at?: string | null });

const NOTE_TYPE = 'work_notes';
const MODAL_SCHEME_PREFIX = 'workbee://note/';
const EXPANDED_FOLDERS_STORAGE_KEY = 'wb-notes-expanded-folders-v1';
const DEFAULT_FOLDER_STORAGE_KEY = 'wb-default-folder-id';
const SHOW_SUBFOLDER_NOTES_STORAGE_KEY = 'wb-notes-show-subfolder-notes-v1';
const SELECTED_NOTE_STORAGE_KEY = 'wb-notes-selected-note-id';
const DEFAULT_FOLDER_COLOR = '#89b4fa';

const sortByPositionThenName = (a: Category, b: Category) => {
    const ap = Number(a?.position ?? 0);
    const bp = Number(b?.position ?? 0);
    if (ap !== bp) return ap - bp;
    return String(a?.name ?? '').localeCompare(String(b?.name ?? ''), undefined, { sensitivity: 'base' });
};

const copyText = async (text: string) => {
    try {
        await navigator.clipboard?.writeText(text);
        return true;
    } catch {
        // fallthrough
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-1000px';
        ta.style.top = '-1000px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
};

const buildNoteUrl = (noteId: number) => {
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}#/notes/${noteId}`;
};

const buildModalLink = (noteId: number) => `${MODAL_SCHEME_PREFIX}${noteId}`;

interface NotesPageProps {
    focus?: NotesFocus | null;
    onOpenSearch?: () => void;
}

const NotesPage: React.FC<NotesPageProps> = ({ focus, onOpenSearch }) => {
    const [categories, setCategories] = useState<Category[]>([]);
    const [notesMap, setNotesMap] = useState<Record<number, LabelNote[]>>({}); // { categoryId: [notes] }
    const [tasksMap, setTasksMap] = useState<Record<number, Task[]>>({}); // { categoryId: [tasks] }
    const [taskNotesMap, setTaskNotesMap] = useState<Record<number, Note[]>>({}); // { taskId: [notes] }
    const [selectedNote, setSelectedNote] = useState<UnifiedNote | null>(null);
    const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
    const [defaultCategoryId, setDefaultCategoryId] = useState<number | null>(() => {
        if (typeof window === 'undefined') return null;
        const raw = window.localStorage.getItem(DEFAULT_FOLDER_STORAGE_KEY);
        const parsed = raw ? Number(raw) : null;
        return Number.isFinite(parsed) && parsed !== null && parsed > 0 ? parsed : null;
    });
    const [showSubfolderNotes, setShowSubfolderNotes] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        const raw = window.localStorage.getItem(SHOW_SUBFOLDER_NOTES_STORAGE_KEY);
        if (!raw) return false;
        try {
            return Boolean(JSON.parse(raw));
        } catch {
            return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
        }
    });
    const [createNoteForCategoryId, setCreateNoteForCategoryId] = useState<number | null>(null);
    const [createNoteTitle, setCreateNoteTitle] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [modalNote, setModalNote] = useState<UnifiedNote | null>(null);
    const [modalError, setModalError] = useState<string | null>(null);
    const [archiveDialogOpen, setArchiveDialogOpen] = useState<boolean>(false);
    const [archiveStart, setArchiveStart] = useState<string>('');
    const [archiveEnd, setArchiveEnd] = useState<string>('');
    const [archiveWeeks, setArchiveWeeks] = useState<string>('4');
    const [archiveResults, setArchiveResults] = useState<ArchiveData | null>(null); // { startDate, endDate, tasks, notes }
    const [archiveLoading, setArchiveLoading] = useState<boolean>(false);
    const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
    const [folderMenuId, setFolderMenuId] = useState<number | null>(null);
    const [folderDraft, setFolderDraft] = useState<{
        id: number | null;
        parent_id: number | null;
        position: number;
        name: string;
        color: string;
    }>({
        id: null,
        parent_id: null,
        position: 0,
        name: '',
        color: DEFAULT_FOLDER_COLOR,
    });
    const [noteDirty, setNoteDirty] = useState<boolean>(false);

    const createNoteInputRef = useRef<HTMLInputElement>(null);
    const didApplyDefaultFolderRef = useRef<boolean>(false);
    const didApplyStoredSubfolderExpandRef = useRef<boolean>(false);
    const notesFetchSeqRef = useRef<Map<number, number>>(new Map());
    const folderMenuRef = useRef<HTMLDivElement>(null);
    const autoSaveTimerRef = useRef<number | null>(null);
    const selectedNoteRef = useRef<UnifiedNote | null>(null);
    const noteDirtyRef = useRef<boolean>(false);
    const isMountedRef = useRef<boolean>(true);

    const categoryById = useMemo(() => {
        const map = new Map<number, Category>();
        categories.forEach((c) => map.set(c.id, c));
        return map;
    }, [categories]);

    const childrenByParentId = useMemo(() => {
        const map = new Map<number | null, Category[]>();
        categories.forEach((c) => {
            const key = c.parent_id ?? null;
            const list = map.get(key) || [];
            list.push(c);
            map.set(key, list);
        });
        for (const [key, list] of map.entries()) {
            map.set(key, list.slice().sort(sortByPositionThenName));
        }
        return map;
    }, [categories]);

    const getDescendantCategoryIds = (rootId: number) => {
        const out: number[] = [];
        const stack = [rootId];
        const seen = new Set([rootId]);
        while (stack.length) {
            const currentId = stack.pop()!;
            const children = childrenByParentId.get(currentId) || [];
            for (const child of children) {
                if (!child?.id || seen.has(child.id)) continue;
                seen.add(child.id);
                out.push(child.id);
                stack.push(child.id);
            }
        }
        return out;
    };

    const getAncestorCategoryIds = (categoryId: number) => {
        const out: number[] = [];
        let current = categoryById.get(categoryId);
        const seen = new Set<number>();
        while (current && !seen.has(current.id)) {
            out.push(current.id);
            seen.add(current.id);
            current = current.parent_id ? categoryById.get(current.parent_id) : undefined;
        }
        return out;
    };

    const openCategory = (categoryId: number, { includeAncestors = false, includeDescendants = false } = {}) => {
        if (!categoryId) return;
        const ids = new Set<number>();
        if (includeAncestors) {
            getAncestorCategoryIds(categoryId).forEach((id) => ids.add(id));
        } else {
            ids.add(categoryId);
        }
        if (includeDescendants) {
            getDescendantCategoryIds(categoryId).forEach((id) => ids.add(id));
        }

        const idsArray = Array.from(ids);
        setExpandedCategories((prev) => {
            let changed = false;
            const next = new Set(prev);
            for (const id of idsArray) {
                if (!next.has(id)) {
                    next.add(id);
                    changed = true;
                }
            }
            return changed ? next : prev;
        });

        for (const id of idsArray) {
            if (!notesMap[id]) fetchNotesForCategory(id);
        }
    };

    const closeCategory = (categoryId: number, { includeDescendants = false } = {}) => {
        if (!categoryId) return;
        const ids = new Set<number>([categoryId]);
        if (includeDescendants) {
            getDescendantCategoryIds(categoryId).forEach((id) => ids.add(id));
        }

        setExpandedCategories((prev) => {
            let changed = false;
            const next = new Set(prev);
            for (const id of ids) {
                if (next.delete(id)) changed = true;
            }
            return changed ? next : prev;
        });

        if (createNoteForCategoryId && ids.has(createNoteForCategoryId)) {
            setCreateNoteForCategoryId(null);
            setCreateNoteTitle('');
        }
    };

    useEffect(() => {
        if (!createNoteForCategoryId) return;
        const raf = window.requestAnimationFrame(() => {
            createNoteInputRef.current?.focus?.();
            createNoteInputRef.current?.select?.();
        });
        return () => window.cancelAnimationFrame(raf);
    }, [createNoteForCategoryId]);

    useEffect(() => {
        selectedNoteRef.current = selectedNote;
    }, [selectedNote]);

    useEffect(() => {
        noteDirtyRef.current = noteDirty;
    }, [noteDirty]);

    useEffect(() => {
        if (!selectedNote) setNoteDirty(false);
    }, [selectedNote]);

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
            flushAutoSave(selectedNoteRef.current);
        };
    }, []);

    useEffect(() => {
        try {
            window.localStorage.setItem(SHOW_SUBFOLDER_NOTES_STORAGE_KEY, JSON.stringify(showSubfolderNotes));
        } catch {
            // ignore
        }
    }, [showSubfolderNotes]);

    useEffect(() => {
        try {
            if (defaultCategoryId) {
                window.localStorage.setItem(DEFAULT_FOLDER_STORAGE_KEY, String(defaultCategoryId));
            } else {
                window.localStorage.removeItem(DEFAULT_FOLDER_STORAGE_KEY);
            }
        } catch {
            // ignore
        }
    }, [defaultCategoryId]);

    useEffect(() => {
        try {
            if (selectedNote?.id) {
                window.localStorage.setItem(SELECTED_NOTE_STORAGE_KEY, String(selectedNote.id));
            } else {
                window.localStorage.removeItem(SELECTED_NOTE_STORAGE_KEY);
            }
        } catch {
            // ignore
        }
    }, [selectedNote?.id]);

    useEffect(() => {
        if (!folderMenuId) return;
        const handleClick = (event: MouseEvent) => {
            if (folderMenuRef.current?.contains(event.target as Node)) return;
            closeFolderMenu();
        };
        window.addEventListener('mousedown', handleClick);
        return () => window.removeEventListener('mousedown', handleClick);
    }, [folderMenuId]);

    useEffect(() => {
        if (!defaultCategoryId) return;
        if (!categories.length) return;
        if (categoryById.has(defaultCategoryId)) return;
        try {
            window.localStorage.removeItem(DEFAULT_FOLDER_STORAGE_KEY);
        } catch {
            // ignore
        }
        setDefaultCategoryId(null);
    }, [categories.length, defaultCategoryId, categoryById]);

    // Restore expanded folders from localStorage (best-effort).
    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(EXPANDED_FOLDERS_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return;
            const ids = parsed
                .map((v) => Number(v))
                .filter((v) => Number.isFinite(v) && v > 0);
            setExpandedCategories(new Set(ids));
        } catch {
            // ignore
        }
    }, []);

    // Drop stale expanded ids when categories change (e.g. after reload / archive).
    useEffect(() => {
        if (!categories.length) return;
        const valid = new Set(categories.map((c) => c.id));
        setExpandedCategories((prev) => {
            const next = new Set<number>();
            for (const id of prev) {
                if (valid.has(id)) next.add(id);
            }
            return next;
        });
    }, [categories]);

    // Persist expanded folder state.
    useEffect(() => {
        try {
            window.localStorage.setItem(EXPANDED_FOLDERS_STORAGE_KEY, JSON.stringify(Array.from(expandedCategories)));
        } catch {
            // ignore
        }
    }, [expandedCategories]);

    const fetchCategories = async () => {
        try {
            const data = await api.getCategories();
            setCategories(data);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchCategories();
    }, []);

    const fetchNotesForCategory = async (categoryId: number) => {
        const seq = (notesFetchSeqRef.current.get(categoryId) || 0) + 1;
        notesFetchSeqRef.current.set(categoryId, seq);
        try {
            const [labelNotes, tasks] = await Promise.all([
                api.getLabelNotes(categoryId, NOTE_TYPE),
                api.getTasks({ category_id: categoryId })
            ]);

            if (notesFetchSeqRef.current.get(categoryId) !== seq) return;
            setNotesMap((prev) => ({ ...prev, [categoryId]: labelNotes }));
            setTasksMap((prev) => ({ ...prev, [categoryId]: tasks }));

            // Fetch notes for each task
            tasks.forEach(async (task) => {
                try {
                    const tNotes = await api.getTaskNotes(task.id);
                    setTaskNotesMap((prev) => ({ ...prev, [task.id]: tNotes }));
                } catch (err) {
                    console.error(`Failed to fetch notes for task ${task.id}:`, err);
                }
            });
        } catch (err) {
            console.error(err);
        }
    };

    const fetchNoteById = async (noteId: number) => {
        return api.getLabelNote(noteId);
    };

    const fetchArchive = async ({ startDate, endDate, weeks }: { startDate: string; endDate: string; weeks: string }) => {
        return api.getArchive(startDate, endDate, weeks);
    };

    const toggleCategory = (categoryId: number) => {
        setActiveCategoryId(categoryId);
        const isOpen = expandedCategories.has(categoryId);
        if (isOpen) {
            closeCategory(categoryId, { includeDescendants: showSubfolderNotes });
            return;
        }
        openCategory(categoryId, { includeDescendants: showSubfolderNotes });
    };

    const expandAncestors = (categoryId: number) => {
        setExpandedCategories((prev) => {
            const next = new Set(prev);
            let current = categoryById.get(categoryId);
            const seen = new Set<number>();
            while (current && !seen.has(current.id)) {
                next.add(current.id);
                seen.add(current.id);
                current = current.parent_id ? categoryById.get(current.parent_id) : undefined;
            }
            return next;
        });
    };

    const openFolderMenu = (category: Category) => {
        if (!category?.id) return;
        setActiveCategoryId(category.id);
        setFolderMenuId(category.id);
        setFolderDraft({
            id: category.id,
            parent_id: category.parent_id ?? null,
            position: Number(category.position ?? 0),
            name: category.name || '',
            color: category.color || DEFAULT_FOLDER_COLOR,
        });
    };

    const closeFolderMenu = () => {
        setFolderMenuId(null);
        setFolderDraft({
            id: null,
            parent_id: null,
            position: 0,
            name: '',
            color: DEFAULT_FOLDER_COLOR,
        });
    };

    const handleSaveFolder = async () => {
        if (!folderDraft.id) return;
        const name = folderDraft.name.trim();
        if (!name) return;
        try {
            await api.updateCategory(
                folderDraft.id,
                folderDraft.parent_id,
                name,
                folderDraft.color,
                folderDraft.position
            );
            await fetchCategories();
            closeFolderMenu();
        } catch (err) {
            console.error(err);
            window.alert('Failed to update folder');
        }
    };

    const handleDeleteFolder = async () => {
        if (!folderDraft.id) return;
        if (!window.confirm('Delete this folder and its notes?')) return;
        try {
            await api.archiveCategory(folderDraft.id);
            if (defaultCategoryId === folderDraft.id) setDefaultCategoryId(null);
            if (selectedNote?.category_id === folderDraft.id) setSelectedNote(null);
            setNotesMap((prev) => {
                const next = { ...prev };
                if (folderDraft.id !== null) {
                   delete next[folderDraft.id];
                }
                return next;
            });
            closeFolderMenu();
            await fetchCategories();
        } catch (err) {
            console.error(err);
            window.alert('Failed to delete folder');
        }
    };

    const handleToggleDefaultFolder = (categoryId: number) => {
        if (!categoryId) return;
        setDefaultCategoryId((prev) => (prev === categoryId ? null : categoryId));
    };

    const flushAutoSave = (note: UnifiedNote | null) => {
        if (!noteDirtyRef.current) return;
        if (!note?.id) return;
        if (autoSaveTimerRef.current) {
            window.clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
        }
        handleSaveNote(note);
    };

    const handleSelectNote = (note: UnifiedNote | null) => {
        flushAutoSave(selectedNoteRef.current);
        setSelectedNote(note);
        setNoteDirty(false);
        if (note?.category_id) {
            setActiveCategoryId(note.category_id);
            expandAncestors(note.category_id);
            if (showSubfolderNotes) openCategory(note.category_id, { includeDescendants: true });
        }
        if (note?.id && !note.task_id) {
            const nextHash = `#/notes/${note.id}`;
            if (window.location.hash !== nextHash) {
                window.history.replaceState(null, '', nextHash);
            }
        }
    };

    useEffect(() => {
        const noteId = Number(focus?.noteId);
        if (!noteId) return;

        (async () => {
            const row = await fetchNoteById(noteId);
            if (!row) {
                try {
                    window.localStorage.removeItem(SELECTED_NOTE_STORAGE_KEY);
                } catch {
                    // ignore
                }
                return;
            }
            if (row.category_id) {
                expandAncestors(row.category_id);
                if (!notesMap[row.category_id]) {
                    await fetchNotesForCategory(row.category_id);
                }
            }
            handleSelectNote(row);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focus?.nonce]);

    useEffect(() => {
        if (focus?.noteId) return;
        if (selectedNote) return;
        if (!categories.length) return;
        const hash = String(window.location.hash || '');
        const match = hash.match(/#\/notes\/(\d+)/);
        const fromHash = match ? Number(match[1]) : null;
        let storedId: number | null = null;
        try {
            const raw = window.localStorage.getItem(SELECTED_NOTE_STORAGE_KEY);
            const parsed = raw ? Number(raw) : null;
            storedId = (parsed !== null && Number.isFinite(parsed)) ? parsed : null;
        } catch {
            storedId = null;
        }
        const noteId = fromHash || storedId;
        if (!noteId) return;

        (async () => {
            const row = await fetchNoteById(noteId);
            if (!row) return;
            if (row.category_id) {
                expandAncestors(row.category_id);
                if (!notesMap[row.category_id]) {
                    await fetchNotesForCategory(row.category_id);
                }
            }
            handleSelectNote(row);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focus?.noteId, categories.length, selectedNote, notesMap]);

    const createNote = async (categoryId: number, title: string) => {
        const trimmedTitle = String(title || '').trim();
        if (!trimmedTitle) return false;

        try {
            const result = await api.addLabelNote(categoryId, trimmedTitle, '', NOTE_TYPE);

            const newNote: LabelNote = {
                id: result.lastInsertRowid!,
                title: trimmedTitle,
                content: '',
                category_id: categoryId,
                type: NOTE_TYPE,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                archived: 0,
                archived_at: null,
            };

            setNotesMap((prev) => ({
                ...prev,
                [categoryId]: [newNote, ...(prev[categoryId] || [])],
            }));
            expandAncestors(categoryId);
            handleSelectNote(newNote);
            return true;
        } catch (err) {
            console.error(err);
            window.alert('Error creating note');
            return false;
        }
    };

    const startCreateNote = (categoryId: number) => {
        if (!categoryId) return;
        if (createNoteForCategoryId === categoryId) {
            setCreateNoteForCategoryId(null);
            setCreateNoteTitle('');
            return;
        }
        setActiveCategoryId(categoryId);
        setCreateNoteTitle('');
        setCreateNoteForCategoryId(categoryId);
        openCategory(categoryId, { includeDescendants: showSubfolderNotes });
    };

    const cancelCreateNote = () => {
        setCreateNoteForCategoryId(null);
        setCreateNoteTitle('');
    };

    const handleSubmitCreateNote = async (e: React.FormEvent) => {
        e.preventDefault();
        const categoryId = createNoteForCategoryId;
        if (!categoryId) return;
        const title = createNoteTitle.trim();
        if (!title) return;
        const ok = await createNote(categoryId, title);
        if (ok) cancelCreateNote();
    };

    const handleSaveNote = async (note: UnifiedNote | null = selectedNote) => {
        if (!note) return;
        try {
            if ('task_id' in note && note.task_id) {
                const taskId = note.task_id;
                await api.updateNote(note.id, note.title, note.content);
                if (isMountedRef.current) {
                    setTaskNotesMap((prev) => {
                        const list = prev[taskId] || [];
                        return {
                            ...prev,
                            [taskId]: list.map((n: Note) => (n.id === note.id ? note : n)),
                        };
                    });
                }
            } else if ('category_id' in note && note.category_id) {
                const categoryId = note.category_id;
                await api.updateLabelNote(note.id, note.title, note.content);
                if (isMountedRef.current) {
                    setNotesMap((prev) => {
                        const list = prev[categoryId] || [];
                        return {
                            ...prev,
                            [categoryId]: list.map((n: LabelNote) => (n.id === note.id ? (note as LabelNote) : n)),
                        };
                    });
                }
            }
            if (isMountedRef.current && selectedNote?.id === note.id) {
                setNoteDirty(false);
            }
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        if (!noteDirty || !selectedNote?.id) return;
        if (autoSaveTimerRef.current) {
            window.clearTimeout(autoSaveTimerRef.current);
        }
        autoSaveTimerRef.current = window.setTimeout(() => {
            handleSaveNote(selectedNote);
        }, 900);
        return () => {
            if (autoSaveTimerRef.current) {
                window.clearTimeout(autoSaveTimerRef.current);
                autoSaveTimerRef.current = null;
            }
        };
    }, [noteDirty, selectedNote?.id, selectedNote?.title, selectedNote?.content]);

    useEffect(() => {
        if (didApplyStoredSubfolderExpandRef.current) return;
        if (!categories.length) return;
        if (!showSubfolderNotes) {
            didApplyStoredSubfolderExpandRef.current = true;
            return;
        }

        didApplyStoredSubfolderExpandRef.current = true;
        const roots = Array.from(expandedCategories);
        if (!roots.length) return;
        const idsToOpen = new Set<number>();
        roots.forEach((id) => getDescendantCategoryIds(id).forEach((d) => idsToOpen.add(d)));
        if (!idsToOpen.size) return;

        setExpandedCategories((prev) => {
            let changed = false;
            const next = new Set(prev);
            for (const id of idsToOpen) {
                if (!next.has(id)) {
                    next.add(id);
                    changed = true;
                }
            }
            return changed ? next : prev;
        });

        for (const id of idsToOpen) {
            if (!notesMap[id]) fetchNotesForCategory(id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categories.length, showSubfolderNotes]);

    useEffect(() => {
        if (didApplyDefaultFolderRef.current) return;
        if (isLoading) return;
        if (!categories.length) return;
        if (selectedNote) {
            didApplyDefaultFolderRef.current = true;
            return;
        }
        if (focus?.noteId) {
            didApplyDefaultFolderRef.current = true;
            return;
        }
        if (!defaultCategoryId) {
            didApplyDefaultFolderRef.current = true;
            return;
        }
        if (!categoryById.has(defaultCategoryId)) {
            didApplyDefaultFolderRef.current = true;
            setDefaultCategoryId(null);
            return;
        }
        didApplyDefaultFolderRef.current = true;
        expandAncestors(defaultCategoryId);
        openCategory(defaultCategoryId, { includeDescendants: showSubfolderNotes });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, categories.length, selectedNote, focus?.noteId, defaultCategoryId, showSubfolderNotes, categoryById]);

    const openModalNote = async (noteId: number) => {
        setModalError(null);
        try {
            const row = await fetchNoteById(noteId);
            if (!row) {
                setModalError('Note not found');
                setModalNote(null);
                return;
            }
            setModalNote(row);
        } catch (err) {
            console.error(err);
            setModalError('Failed to load note');
            setModalNote(null);
        }
    };

    const closeModal = () => {
        setModalNote(null);
        setModalError(null);
    };

    const handleEditorClickCapture = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        const anchor = target.closest?.('a') as HTMLAnchorElement | null;
        if (!anchor) return;
        const href = anchor.getAttribute('href') || '';
        if (!href.startsWith(MODAL_SCHEME_PREFIX)) return;
        const id = Number(href.slice(MODAL_SCHEME_PREFIX.length));
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        openModalNote(id);
    };

    const handleDeleteNote = async (noteId: number, categoryId: number) => {
        if (!window.confirm('Delete this note?')) return;
        try {
            await api.deleteLabelNote(noteId);
            setNotesMap((prev) => ({
                ...prev,
                [categoryId]: (prev[categoryId] || []).filter((n) => n.id !== noteId),
            }));
            if (selectedNote?.id === noteId) {
                setSelectedNote(null);
                setNoteDirty(false);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleArchiveNote = async (noteId: number, categoryId: number) => {
        if (!window.confirm('Archive this note?')) return;
        try {
            await api.archiveLabelNote(noteId);
            setNotesMap((prev) => ({
                ...prev,
                [categoryId]: (prev[categoryId] || []).filter((n) => n.id !== noteId),
            }));
            if (selectedNote?.id === noteId) setSelectedNote(null);
        } catch (err) {
            console.error(err);
        }
    };

    const handleUnarchiveNote = async (noteId: number) => {
        try {
            await api.unarchiveLabelNote(noteId);
            setArchiveResults((prev) => {
                if (!prev) return prev;
                return { ...prev, notes: (prev.notes || []).filter((n) => n.id !== noteId) };
            });
        } catch (err) {
            console.error(err);
        }
    };

    const renderCategoryTree = (parentId: number | null = null, depth = 0): React.ReactNode => {
        const nodes = childrenByParentId.get(parentId) || [];
        if (!nodes.length) return null;

        return nodes.map((cat) => {
            const isOpen = expandedCategories.has(cat.id);
            const notes = notesMap[cat.id] || [];
            const tasks = tasksMap[cat.id] || [];
            const isActive = activeCategoryId === cat.id;
            const isMenuOpen = folderMenuId === cat.id;

            return (
                <div key={cat.id}>
                    <div
                        className={`notes-tree-row notes-tree-category ${isActive ? 'active' : ''}`}
                        style={{ paddingLeft: depth * 16 }}
                    >
                        <button
                            type="button"
                            className="notes-tree-main"
                            onClick={() => toggleCategory(cat.id)}
                            aria-expanded={isOpen}
                        >
                            <span className={`notes-tree-twist ${isOpen ? 'open' : ''}`} aria-hidden="true">
                                ▸
                            </span>
                            <span
                                className="notes-tree-dot"
                                style={{ backgroundColor: cat.color || 'var(--text-faint)' }}
                                aria-hidden="true"
                            />
                            <span className="notes-tree-icon" aria-hidden="true">
                                📁
                            </span>
                            <span className="notes-tree-title">{cat.name}</span>
                        </button>
                        <button
                            type="button"
                            className={`notes-tree-action ${isActive || isMenuOpen ? 'visible' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (isMenuOpen) {
                                    closeFolderMenu();
                                } else {
                                    openFolderMenu(cat);
                                }
                            }}
                            title="Folder settings"
                            aria-label="Folder settings"
                        >
                            ⋯
                        </button>
                        <button
                            type="button"
                            className="notes-tree-action"
                            onClick={(e) => {
                                e.stopPropagation();
                                startCreateNote(cat.id);
                            }}
                            title={createNoteForCategoryId === cat.id ? 'Cancel new note' : 'New note'}
                            aria-label={createNoteForCategoryId === cat.id ? 'Cancel new note' : 'New note'}
                        >
                            +
                        </button>
                        {isMenuOpen ? (
                            <div
                                ref={folderMenuRef}
                                className="notes-folder-menu"
                                role="menu"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="notes-folder-menu-title">Folder settings</div>
                                <label className="notes-folder-menu-label" htmlFor={`folder-name-${cat.id}`}>
                                    Name
                                </label>
                                <input
                                    id={`folder-name-${cat.id}`}
                                    type="text"
                                    value={folderDraft.name}
                                    onChange={(e) => setFolderDraft({ ...folderDraft, name: e.target.value })}
                                />
                                <label className="notes-folder-menu-label" htmlFor={`folder-color-${cat.id}`}>
                                    Color
                                </label>
                                <div className="notes-folder-menu-row">
                                    <input
                                        id={`folder-color-${cat.id}`}
                                        type="color"
                                        value={folderDraft.color || DEFAULT_FOLDER_COLOR}
                                        onChange={(e) => setFolderDraft({ ...folderDraft, color: e.target.value })}
                                    />
                                    <button
                                        type="button"
                                        className="link-btn"
                                        onClick={() => handleToggleDefaultFolder(cat.id)}
                                    >
                                        {defaultCategoryId === cat.id ? '★ Default' : '☆ Set default'}
                                    </button>
                                </div>
                                <div className="notes-folder-menu-actions">
                                    <button type="button" className="danger" onClick={handleDeleteFolder}>
                                        Delete
                                    </button>
                                </div>
                                <div className="notes-folder-menu-actions">
                                    <button type="button" onClick={closeFolderMenu}>
                                        Close
                                    </button>
                                    <button
                                        type="button"
                                        className="primary-btn"
                                        onClick={handleSaveFolder}
                                        disabled={!folderDraft.name.trim()}
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    {isOpen && (
                        <div className="notes-tree-children">
                            {createNoteForCategoryId === cat.id && (
                                <form
                                    className="notes-tree-create"
                                    style={{ paddingLeft: depth * 16 + 20 }}
                                    onSubmit={handleSubmitCreateNote}
                                >
                                    <span className="notes-tree-icon" aria-hidden="true">
                                        📝
                                    </span>
                                    <input
                                        ref={createNoteInputRef}
                                        value={createNoteTitle}
                                        onChange={(e) => setCreateNoteTitle(e.target.value)}
                                        placeholder="New note title"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Escape') cancelCreateNote();
                                        }}
                                    />
                                    <button type="submit" className="icon-btn" title="Create note" aria-label="Create note">
                                        ✓
                                    </button>
                                    <button
                                        type="button"
                                        className="icon-btn"
                                        title="Cancel"
                                        aria-label="Cancel"
                                        onClick={cancelCreateNote}
                                    >
                                        ×
                                    </button>
                                </form>
                            )}
                            {notes.map((note) => (
                                <button
                                    key={note.id}
                                    type="button"
                                    className={`notes-tree-row notes-tree-note ${selectedNote?.id === note.id && !selectedNote.task_id ? 'active' : ''}`}
                                    onClick={() => handleSelectNote(note)}
                                    style={{ paddingLeft: depth * 16 + 20 }}
                                >
                                    <span className="notes-tree-icon" aria-hidden="true">
                                        📝
                                    </span>
                                    <span className="notes-tree-title">{note.title}</span>
                                </button>
                            ))}
                            {tasks.filter(t => (taskNotesMap[t.id] || []).length > 0).map(task => (
                                <div key={`task-${task.id}`}>
                                    <div className="notes-tree-row notes-tree-task muted" style={{ paddingLeft: depth * 16 + 20, fontSize: '0.85rem', cursor: 'default' }}>
                                        <span className="notes-tree-icon" aria-hidden="true">
                                            📋
                                        </span>
                                        <span className="notes-tree-title" style={{ fontStyle: 'italic' }}>{task.title}</span>
                                    </div>
                                    {(taskNotesMap[task.id] || []).map(tn => (
                                        <button
                                            key={`tn-${tn.id}`}
                                            type="button"
                                            className={`notes-tree-row notes-tree-note ${selectedNote?.id === tn.id && selectedNote.task_id === tn.task_id ? 'active' : ''}`}
                                            onClick={() => handleSelectNote({ ...tn, category_id: cat.id })}
                                            style={{ paddingLeft: depth * 16 + 40 }}
                                        >
                                            <span className="notes-tree-icon" aria-hidden="true">
                                                📌
                                            </span>
                                            <span className="notes-tree-title">{tn.title || '(Untitled Task Note)'}</span>
                                        </button>
                                    ))}
                                </div>
                            ))}
                            {notesMap[cat.id] && notes.length === 0 && tasks.filter(t => (taskNotesMap[t.id] || []).length > 0).length === 0 && (
                                <div className="notes-tree-empty" style={{ paddingLeft: depth * 16 + 20 }}>
                                    No notes
                                </div>
                            )}
                            {renderCategoryTree(cat.id, depth + 1)}
                        </div>
                    )}
                </div>
            );
        });
    };

    return (
        <div className="notes-page">
            <aside className="notes-sidebar" aria-label="Notebooks">
                <div className="notes-sidebar-header">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <h2 style={{ margin: 0 }}>Notebooks</h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <button
                                type="button"
                                className="icon-btn"
                                title="Search"
                                aria-label="Search"
                                onClick={() => onOpenSearch?.()}
                            >
                                🔍
                            </button>
                            <button type="button" className="link-btn" onClick={() => setArchiveDialogOpen(true)}>
                                Archive…
                            </button>
                        </div>
                    </div>
                    <div className="controls" style={{ marginTop: 10, justifyContent: 'space-between' }}>
                        <label className="checkbox-inline" title="Automatically expand sub-folders to show their notes">
                            <input
                                type="checkbox"
                                checked={showSubfolderNotes}
                                onChange={(e) => {
                                    const next = Boolean(e.target.checked);
                                    setShowSubfolderNotes(next);
                                    if (!next) return;
                                    const roots = Array.from(expandedCategories);
                                    const idsToOpen = new Set<number>();
                                    roots.forEach((id) =>
                                        getDescendantCategoryIds(id).forEach((descId) => idsToOpen.add(descId))
                                    );
                                    if (!idsToOpen.size) return;
                                    setExpandedCategories((prev) => {
                                        let changed = false;
                                        const nextSet = new Set(prev);
                                        for (const id of idsToOpen) {
                                            if (!nextSet.has(id)) {
                                                nextSet.add(id);
                                                changed = true;
                                            }
                                        }
                                        return changed ? nextSet : prev;
                                    });
                                    for (const id of idsToOpen) {
                                        if (!notesMap[id]) fetchNotesForCategory(id);
                                    }
                                }}
                            />
                            Include sub-folders
                        </label>
                        <div className="muted" style={{ fontSize: '0.8rem' }}>
                            Folder settings → Set default
                        </div>
                    </div>
                </div>
                <div className="notes-sidebar-content">
                    {isLoading ? <div className="notes-tree-empty">Loading…</div> : renderCategoryTree(null)}
                </div>
            </aside>

            <section className="notes-editor-area" aria-label="Note editor">
                {selectedNote ? (
                    <>
                        <header className="note-header">
                            <input
                                className="note-title-input"
                                value={selectedNote.title || ''}
                                onChange={(e) => {
                                    setSelectedNote({ ...selectedNote, title: e.target.value });
                                    setNoteDirty(true);
                                }}
                                onBlur={() => handleSaveNote()}
                            />
                            <div className="note-header-actions">
                                <button
                                    type="button"
                                    className="link-btn"
                                    onClick={async () => {
                                        const ok = await copyText(buildNoteUrl(selectedNote.id));
                                        if (!ok) window.alert('Failed to copy');
                                    }}
                                    title="Copy a bookmarkable URL for this note"
                                >
                                    Copy URL
                                </button>
                                <button
                                    type="button"
                                    className="link-btn"
                                    onClick={async () => {
                                        const ok = await copyText(buildModalLink(selectedNote.id));
                                        if (!ok) window.alert('Failed to copy');
                                    }}
                                    title="Copy an internal link that opens as a popup"
                                >
                                    Copy popup link
                                </button>
                                {!selectedNote.task_id && (
                                    <>
                                        <button
                                            type="button"
                                            className="btn danger"
                                            onClick={() => handleArchiveNote(selectedNote.id, selectedNote.category_id!)}
                                        >
                                            Archive
                                        </button>
                                        <button
                                            type="button"
                                            className="link-btn danger-link"
                                            onClick={() => handleDeleteNote(selectedNote.id, selectedNote.category_id!)}
                                            title="Permanently delete this note"
                                        >
                                            Delete
                                        </button>
                                    </>
                                )}
                            </div>
                        </header>
                        <div className="note-editor-wrapper" onClickCapture={handleEditorClickCapture}>
                            <TiptapEditor
                                content={selectedNote.content || ''}
                                onChange={(html) => {
                                    setSelectedNote((prev) => prev ? ({ ...prev, content: html }) : null);
                                    setNoteDirty(true);
                                }}
                                onRequestSave={handleSaveNote}
                                placeholder="Start writing your note… (paste screenshots directly)"
                            />
                        </div>
                    </>
                ) : (
                    <div className="notes-empty-state">
                        <div className="notes-empty-icon" aria-hidden="true">
                            📝
                        </div>
                        <p>Select a note or create a new one to start writing.</p>
                    </div>
                )}
            </section>

            {modalNote || modalError ? (
                <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={closeModal}>
                    <div className="modal-content note-modal" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {modalNote?.title || 'Note'}
                                </div>
                                <div className="muted" style={{ marginTop: 4 }}>
                                    {modalNote?.id ? `ID ${modalNote.id}` : modalError}
                                </div>
                            </div>
                            <button
                                type="button"
                                className="link-btn"
                                disabled={!modalNote?.id}
                                onClick={() => {
                                    if (!modalNote?.id) return;
                                    handleSelectNote(modalNote);
                                    closeModal();
                                }}
                            >
                                Open
                            </button>
                            <button type="button" className="close-btn" onClick={closeModal}>
                                &times;
                            </button>
                        </div>

                        {modalNote?.content ? (
                            <TiptapEditor content={modalNote.content} editable={false} />
                        ) : (
                            <div className="muted" style={{ padding: 16 }}>
                                {modalError || 'Loading…'}
                            </div>
                        )}
                    </div>
                </div>
            ) : null}

            {archiveDialogOpen ? (
                <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={() => setArchiveDialogOpen(false)}>
                    <div className="modal-content" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
                        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 900 }}>Archived items</div>
                                <div className="muted" style={{ marginTop: 4 }}>
                                    Choose a date range or last N weeks.
                                </div>
                            </div>
                            <button type="button" className="close-btn" onClick={() => setArchiveDialogOpen(false)}>
                                &times;
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, padding: 16 }}>
                            <label>
                                <div className="muted" style={{ marginBottom: 6 }}>Start</div>
                                <input type="date" value={archiveStart} onChange={(e) => setArchiveStart(e.target.value)} />
                            </label>
                            <label>
                                <div className="muted" style={{ marginBottom: 6 }}>End</div>
                                <input type="date" value={archiveEnd} onChange={(e) => setArchiveEnd(e.target.value)} />
                            </label>
                            <label>
                                <div className="muted" style={{ marginBottom: 6 }}>Last weeks</div>
                                <select value={archiveWeeks} onChange={(e) => setArchiveWeeks(e.target.value)}>
                                    <option value="1">1</option>
                                    <option value="2">2</option>
                                    <option value="4">4</option>
                                    <option value="8">8</option>
                                    <option value="12">12</option>
                                </select>
                            </label>
                        </div>

                        <div style={{ padding: '0 16px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
                            <button
                                type="button"
                                onClick={async () => {
                                    setArchiveLoading(true);
                                    try {
                                        const result = await fetchArchive({
                                            startDate: archiveStart || '',
                                            endDate: archiveEnd || '',
                                            weeks: archiveStart || archiveEnd ? '' : archiveWeeks,
                                        });
                                        setArchiveResults(result);
                                    } catch (err) {
                                        console.error(err);
                                        window.alert('Failed to load archive');
                                    } finally {
                                        setArchiveLoading(false);
                                    }
                                }}
                            >
                                {archiveLoading ? 'Loading…' : 'Show'}
                            </button>
                            {archiveResults ? (
                                <div className="muted">
                                    Showing {archiveResults.startDate} → {archiveResults.endDate}
                                </div>
                            ) : null}
                        </div>

                        {archiveResults ? (
                            <div style={{ padding: '0 16px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div>
                                    <div style={{ fontWeight: 800, marginBottom: 8 }}>Archived notes</div>
                                    <div style={{ maxHeight: '50vh', overflow: 'auto', border: '1px solid var(--border-faint)', borderRadius: 10 }}>
                                        {(archiveResults.notes || []).map((n) => (
                                            <div key={n.id} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-faint)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {n.title || '(untitled)'}
                                                        </div>
                                                        <div className="muted" style={{ marginTop: 4, fontSize: '0.85rem' }}>
                                                            {n.category_name || 'Unknown folder'} · {String(n.archived_at || '').slice(0, 10)}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                        <button type="button" className="link-btn" onClick={() => openModalNote(n.id)}>
                                                            Preview
                                                        </button>
                                                        <button type="button" className="link-btn" onClick={() => handleUnarchiveNote(n.id)}>
                                                            Unarchive
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {(!archiveResults.notes || archiveResults.notes.length === 0) ? (
                                            <div className="notes-tree-empty">No archived notes in this range.</div>
                                        ) : null}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontWeight: 800, marginBottom: 8 }}>Archived tasks</div>
                                    <div style={{ maxHeight: '50vh', overflow: 'auto', border: '1px solid var(--border-faint)', borderRadius: 10 }}>
                                        {(archiveResults.tasks || []).map((t) => (
                                            <div key={t.id} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-faint)' }}>
                                                <div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {t.title}
                                                </div>
                                                <div className="muted" style={{ marginTop: 4, fontSize: '0.85rem' }}>
                                                    {String(t.archived_at || '').slice(0, 10)} · {t.status}
                                                </div>
                                            </div>
                                        ))}
                                        {(!archiveResults.tasks || archiveResults.tasks.length === 0) ? (
                                            <div className="notes-tree-empty">No archived tasks in this range.</div>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default NotesPage;
