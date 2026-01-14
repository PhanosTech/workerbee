import React, { useEffect, useMemo, useState } from 'react';
import TiptapEditor from '../components/TiptapEditor';

const API_BASE = import.meta.env.VITE_API_BASE || `http://${window.location.hostname}:9339/api`;

const NOTE_TYPE = 'work_notes';
const MODAL_SCHEME_PREFIX = 'workbee://note/';
const EXPANDED_FOLDERS_STORAGE_KEY = 'wb-notes-expanded-folders-v1';

const sortByPositionThenName = (a, b) => {
    const ap = Number(a?.position ?? 0);
    const bp = Number(b?.position ?? 0);
    if (ap !== bp) return ap - bp;
    return String(a?.name ?? '').localeCompare(String(b?.name ?? ''), undefined, { sensitivity: 'base' });
};

const copyText = async (text) => {
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

const buildNoteUrl = (noteId) => {
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}#/notes/${noteId}`;
};

const buildModalLink = (noteId) => `${MODAL_SCHEME_PREFIX}${noteId}`;

function NotesPage({ focus, onOpenSearch }) {
    const [categories, setCategories] = useState([]);
    const [notesMap, setNotesMap] = useState({}); // { categoryId: [notes] }
    const [selectedNote, setSelectedNote] = useState(null); // { id, title, content, category_id }
    const [expandedCategories, setExpandedCategories] = useState(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [modalNote, setModalNote] = useState(null); // { id, title, content, category_id }
    const [modalError, setModalError] = useState(null);
    const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
    const [archiveStart, setArchiveStart] = useState('');
    const [archiveEnd, setArchiveEnd] = useState('');
    const [archiveWeeks, setArchiveWeeks] = useState('4');
    const [archiveResults, setArchiveResults] = useState(null); // { startDate, endDate, tasks, notes }
    const [archiveLoading, setArchiveLoading] = useState(false);

    const categoryById = useMemo(() => {
        const map = new Map();
        categories.forEach((c) => map.set(c.id, c));
        return map;
    }, [categories]);

    const childrenByParentId = useMemo(() => {
        const map = new Map();
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
            const next = new Set();
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

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const res = await fetch(`${API_BASE}/categories`);
                if (!res.ok) throw new Error('Failed to fetch categories');
                const data = await res.json();
                setCategories(data);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchCategories();
    }, []);

    const fetchNotesForCategory = async (categoryId) => {
        try {
            const res = await fetch(`${API_BASE}/categories/${categoryId}/notes?type=${encodeURIComponent(NOTE_TYPE)}`);
            if (!res.ok) throw new Error('Failed to fetch notes');
            const data = await res.json();
            setNotesMap((prev) => ({ ...prev, [categoryId]: data }));
        } catch (err) {
            console.error(err);
        }
    };

    const fetchNoteById = async (noteId) => {
        const res = await fetch(`${API_BASE}/label_notes/${noteId}`);
        if (!res.ok) return null;
        return res.json();
    };

    const fetchArchive = async ({ startDate, endDate, weeks }) => {
        const params = new URLSearchParams();
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        if (weeks) params.set('weeks', weeks);
        const res = await fetch(`${API_BASE}/archive?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch archive');
        return res.json();
    };

    const toggleCategory = (categoryId) => {
        setExpandedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(categoryId)) {
                next.delete(categoryId);
            } else {
                next.add(categoryId);
                if (!notesMap[categoryId]) fetchNotesForCategory(categoryId);
            }
            return next;
        });
    };

    const expandAncestors = (categoryId) => {
        setExpandedCategories((prev) => {
            const next = new Set(prev);
            let current = categoryById.get(categoryId);
            const seen = new Set();
            while (current && !seen.has(current.id)) {
                next.add(current.id);
                seen.add(current.id);
                current = current.parent_id ? categoryById.get(current.parent_id) : null;
            }
            return next;
        });
    };

    const handleSelectNote = (note) => {
        setSelectedNote(note);
        if (note?.category_id) expandAncestors(note.category_id);
        if (note?.id) {
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
    }, [focus?.nonce]);

    const handleCreateNote = async (categoryId) => {
        const title = window.prompt('Note Title:');
        if (!title) return;

        try {
            const res = await fetch(`${API_BASE}/categories/${categoryId}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content: '', type: NOTE_TYPE }),
            });
            if (!res.ok) throw new Error('Failed to create note');
            const result = await res.json();

            const newNote = {
                id: result.lastInsertRowid,
                title,
                content: '',
                category_id: categoryId,
                type: NOTE_TYPE,
            };

            setNotesMap((prev) => ({
                ...prev,
                [categoryId]: [newNote, ...(prev[categoryId] || [])],
            }));
            expandAncestors(categoryId);
            handleSelectNote(newNote);
        } catch (err) {
            console.error(err);
            window.alert('Error creating note');
        }
    };

    const handleSaveNote = async () => {
        if (!selectedNote) return;
        try {
            await fetch(`${API_BASE}/label_notes/${selectedNote.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: selectedNote.title,
                    content: selectedNote.content,
                }),
            });

            setNotesMap((prev) => {
                const list = prev[selectedNote.category_id] || [];
                return {
                    ...prev,
                    [selectedNote.category_id]: list.map((n) => (n.id === selectedNote.id ? selectedNote : n)),
                };
            });
        } catch (err) {
            console.error(err);
        }
    };

    const openModalNote = async (noteId) => {
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

    const handleEditorClickCapture = (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        const anchor = target.closest?.('a');
        if (!(anchor instanceof HTMLAnchorElement)) return;
        const href = anchor.getAttribute('href') || '';
        if (!href.startsWith(MODAL_SCHEME_PREFIX)) return;
        const id = Number(href.slice(MODAL_SCHEME_PREFIX.length));
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        openModalNote(id);
    };

    const handleDeleteNote = async (noteId, categoryId) => {
        if (!window.confirm('Delete this note?')) return;
        try {
            await fetch(`${API_BASE}/label_notes/${noteId}`, { method: 'DELETE' });
            setNotesMap((prev) => ({
                ...prev,
                [categoryId]: (prev[categoryId] || []).filter((n) => n.id !== noteId),
            }));
            if (selectedNote?.id === noteId) setSelectedNote(null);
        } catch (err) {
            console.error(err);
        }
    };

    const handleArchiveNote = async (noteId, categoryId) => {
        if (!window.confirm('Archive this note?')) return;
        try {
            await fetch(`${API_BASE}/label_notes/${noteId}/archive`, { method: 'POST' });
            setNotesMap((prev) => ({
                ...prev,
                [categoryId]: (prev[categoryId] || []).filter((n) => n.id !== noteId),
            }));
            if (selectedNote?.id === noteId) setSelectedNote(null);
        } catch (err) {
            console.error(err);
        }
    };

    const handleUnarchiveNote = async (noteId) => {
        try {
            await fetch(`${API_BASE}/label_notes/${noteId}/unarchive`, { method: 'POST' });
            setArchiveResults((prev) => {
                if (!prev) return prev;
                return { ...prev, notes: (prev.notes || []).filter((n) => n.id !== noteId) };
            });
        } catch (err) {
            console.error(err);
        }
    };

    const renderCategoryTree = (parentId = null, depth = 0) => {
        const nodes = childrenByParentId.get(parentId) || [];
        if (!nodes.length) return null;

        return nodes.map((cat) => {
            const isOpen = expandedCategories.has(cat.id);
            const notes = notesMap[cat.id] || [];

            return (
                <div key={cat.id}>
                    <div className="notes-tree-row notes-tree-category" style={{ paddingLeft: depth * 16 }}>
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
                            className="notes-tree-action"
                            onClick={() => handleCreateNote(cat.id)}
                            title="New note"
                            aria-label="New note"
                        >
                            +
                        </button>
                    </div>

                    {isOpen && (
                        <div className="notes-tree-children">
                            {notes.map((note) => (
                                <button
                                    key={note.id}
                                    type="button"
                                    className={`notes-tree-row notes-tree-note ${selectedNote?.id === note.id ? 'active' : ''}`}
                                    onClick={() => handleSelectNote(note)}
                                    style={{ paddingLeft: depth * 16 + 20 }}
                                >
                                    <span className="notes-tree-icon" aria-hidden="true">
                                        📝
                                    </span>
                                    <span className="notes-tree-title">{note.title}</span>
                                </button>
                            ))}
                            {notesMap[cat.id] && notes.length === 0 && (
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
                                value={selectedNote.title}
                                onChange={(e) => setSelectedNote({ ...selectedNote, title: e.target.value })}
                                onBlur={handleSaveNote}
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
                                <button
                                    type="button"
                                    className="btn danger"
                                    onClick={() => handleArchiveNote(selectedNote.id, selectedNote.category_id)}
                                >
                                    Archive
                                </button>
                                <button
                                    type="button"
                                    className="link-btn danger-link"
                                    onClick={() => handleDeleteNote(selectedNote.id, selectedNote.category_id)}
                                    title="Permanently delete this note"
                                >
                                    Delete
                                </button>
                            </div>
                        </header>
                        <div className="note-editor-wrapper" onClickCapture={handleEditorClickCapture}>
                            <TiptapEditor
                                content={selectedNote.content}
                                onChange={(html) => setSelectedNote((prev) => ({ ...prev, content: html }))}
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
