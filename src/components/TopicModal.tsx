import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { api, Topic, TopicLog, TopicNote } from '../api';
import TiptapEditor from './TiptapEditor';
import { formatDateTime, htmlToPlainText, normalizeNoteContent } from '../utils/noteUtils';

interface TopicModalProps {
    topicId: number | null;
    onClose: () => void;
    onUpdate: () => void;
}

type TopicTab = 'notes' | 'details' | 'logs';

const EMPTY_TOPIC_DRAFT: Partial<Topic> = {
    title: '',
    description: '',
    status: 'BACKLOG',
    tags: '',
};

const TopicModal: React.FC<TopicModalProps> = ({ topicId, onClose, onUpdate }) => {
    const [topic, setTopic] = useState<Partial<Topic> | null>(null);
    const [topicDirty, setTopicDirty] = useState(false);
    const [activeTab, setActiveTab] = useState<TopicTab>('notes');
    const [loading, setLoading] = useState(true);
    const [logs, setLogs] = useState<TopicLog[]>([]);
    const [notes, setNotes] = useState<TopicNote[]>([]);
    const [selectedNote, setSelectedNote] = useState<TopicNote | null>(null);
    const [noteDirty, setNoteDirty] = useState(false);
    const [newLog, setNewLog] = useState('');
    const [editingLogId, setEditingLogId] = useState<number | null>(null);

    const topicRef = useRef<Partial<Topic> | null>(null);
    const selectedNoteRef = useRef<TopicNote | null>(null);
    const noteDirtyRef = useRef(false);
    const pendingCreateRef = useRef<Promise<Topic | null> | null>(null);
    const autoSaveTimerRef = useRef<number | null>(null);

    useEffect(() => {
        topicRef.current = topic;
    }, [topic]);

    useEffect(() => {
        selectedNoteRef.current = selectedNote;
    }, [selectedNote]);

    useEffect(() => {
        noteDirtyRef.current = noteDirty;
    }, [noteDirty]);

    const refreshTopicLogs = async (id: number) => {
        const data = await api.getTopicLogs(id);
        setLogs(data || []);
    };

    const refreshTopicNotes = async (id: number, preferredNoteId?: number | null) => {
        const data = await api.getTopicNotes(id);
        const normalized = (data || []).map((note) => ({
            ...note,
            content: normalizeNoteContent(note.content),
        }));
        setNotes(normalized);
        setSelectedNote((prev) => {
            const targetId = preferredNoteId ?? prev?.id ?? null;
            if (!normalized.length) return null;
            if (targetId) {
                return normalized.find((note) => note.id === targetId) || normalized[0];
            }
            return normalized[0];
        });
    };

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setActiveTab('notes');
            setTopicDirty(false);
            setNoteDirty(false);
            setNewLog('');
            setEditingLogId(null);

            if (!topicId) {
                setTopic({ ...EMPTY_TOPIC_DRAFT });
                setLogs([]);
                setNotes([]);
                setSelectedNote(null);
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                const [topicData, topicLogs, topicNotes] = await Promise.all([
                    api.getTopic(topicId),
                    api.getTopicLogs(topicId),
                    api.getTopicNotes(topicId),
                ]);
                if (cancelled) return;

                const normalizedNotes = (topicNotes || []).map((note) => ({
                    ...note,
                    content: normalizeNoteContent(note.content),
                }));

                setTopic(topicData || { ...EMPTY_TOPIC_DRAFT });
                setLogs(topicLogs || []);
                setNotes(normalizedNotes);
                setSelectedNote(normalizedNotes[0] || null);
                setTopicDirty(false);
            } catch (err) {
                if (!cancelled) console.error(err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void load();

        return () => {
            cancelled = true;
            if (autoSaveTimerRef.current) {
                window.clearTimeout(autoSaveTimerRef.current);
                autoSaveTimerRef.current = null;
            }
        };
    }, [topicId]);

    const updateTopicDraft = (updates: Partial<Topic>) => {
        setTopic((prev) => (prev ? { ...prev, ...updates } : prev));
        setTopicDirty(true);
    };

    const ensureTopicPersisted = async (): Promise<Topic | null> => {
        const current = topicRef.current;
        if (!current) return null;
        if (current.id) return current as Topic;
        if (pendingCreateRef.current) return pendingCreateRef.current;

        pendingCreateRef.current = (async () => {
            try {
                const result = await api.createTopic(current);
                const createdId = Number(result.lastInsertRowid);
                if (!createdId) return null;
                const created = await api.getTopic(createdId);
                if (!created) return null;
                setTopic(created);
                setTopicDirty(false);
                onUpdate();
                return created;
            } catch (err) {
                console.error(err);
                return null;
            } finally {
                pendingCreateRef.current = null;
            }
        })();

        return pendingCreateRef.current;
    };

    const persistSelectedNoteIfDirty = async () => {
        if (!noteDirtyRef.current || !selectedNoteRef.current) return;
        await handleSaveNote(selectedNoteRef.current);
    };

    const handleSaveTopicAndClose = async () => {
        try {
            await persistSelectedNoteIfDirty();
            const current = topicRef.current;
            if (!current) {
                onClose();
                return;
            }

            if (current.id) {
                if (topicDirty) {
                    await api.updateTopic(current.id, current);
                    const refreshed = await api.getTopic(current.id);
                    if (refreshed) setTopic(refreshed);
                    setTopicDirty(false);
                    onUpdate();
                }
            } else {
                const created = await ensureTopicPersisted();
                if (created) onUpdate();
            }

            onClose();
        } catch (err) {
            console.error(err);
        }
    };

    const handleRequestClose = async () => {
        try {
            await persistSelectedNoteIfDirty();
        } catch (err) {
            console.error(err);
        } finally {
            onClose();
        }
    };

    const handleDelete = async () => {
        if (!topic?.id) return;
        if (!confirm('Delete this topic?')) return;
        await api.deleteTopic(topic.id);
        onUpdate();
        onClose();
    };

    const handleArchive = async () => {
        if (!topic?.id) return;
        if (!confirm('Archive this topic?')) return;
        await api.archiveTopic(topic.id);
        onUpdate();
        onClose();
    };

    const handleStartEditLog = (log: TopicLog) => {
        setEditingLogId(log.id);
        setNewLog(log.content || '');
        setActiveTab('logs');
    };

    const handleCancelEditLog = () => {
        setEditingLogId(null);
        setNewLog('');
    };

    const handleSaveLog = async (e: FormEvent) => {
        e.preventDefault();
        const draft = newLog.trim();
        if (!draft) return;
        const currentTopic = await ensureTopicPersisted();
        if (!currentTopic?.id) return;

        if (editingLogId) {
            await api.updateTopicLog(editingLogId, draft);
        } else {
            await api.addTopicLog(currentTopic.id, draft);
        }
        handleCancelEditLog();
        await refreshTopicLogs(currentTopic.id);
    };

    const handleDeleteLog = async (log: TopicLog) => {
        if (!confirm('Delete this work log?')) return;
        await api.deleteTopicLog(log.id);
        if (editingLogId === log.id) handleCancelEditLog();
        if (topic?.id) {
            await refreshTopicLogs(topic.id);
        }
    };

    const handleSelectNote = (note: TopicNote | null) => {
        if (noteDirtyRef.current && selectedNoteRef.current) {
            void handleSaveNote(selectedNoteRef.current);
        }
        setSelectedNote(note);
        setNoteDirty(false);
    };

    const updateSelectedNoteDraft = (updates: Partial<TopicNote>) => {
        const currentId = selectedNoteRef.current?.id;
        if (!currentId) return;
        setSelectedNote((prev) => (prev ? { ...prev, ...updates } : prev));
        setNotes((prev) =>
            prev.map((note) => (note.id === currentId ? { ...note, ...updates } : note))
        );
        setNoteDirty(true);
    };

    const handleCreateNote = async () => {
        const currentTopic = await ensureTopicPersisted();
        if (!currentTopic?.id) return;
        const result = await api.addTopicNote(currentTopic.id, '', '', 'rich_text');
        await refreshTopicNotes(currentTopic.id, Number(result.lastInsertRowid));
        setActiveTab('notes');
    };

    const handleSaveNote = async (note: TopicNote | null = selectedNoteRef.current) => {
        if (!note?.id) return;
        await api.updateTopicNote(note.id, note.title ?? null, note.content ?? null);
        const updatedAt = new Date().toISOString();
        const nextNote = { ...note, updated_at: updatedAt };
        setNotes((prev) => prev.map((entry) => (entry.id === note.id ? nextNote : entry)));
        setSelectedNote((prev) => (prev?.id === note.id ? nextNote : prev));
        setNoteDirty(false);
    };

    const handleDeleteNote = async () => {
        if (!selectedNote?.id) return;
        if (!confirm('Delete this note?')) return;
        await api.deleteTopicNote(selectedNote.id);
        const remaining = notes.filter((note) => note.id !== selectedNote.id);
        setNotes(remaining);
        setSelectedNote(remaining[0] || null);
        setNoteDirty(false);
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

    if (loading || !topic) {
        return (
            <div className="modal-overlay">
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
                void handleRequestClose();
            }}
        >
            <div className="modal-content task-modal">
                <div className="modal-header">
                    <input
                        className="title-input"
                        value={topic.title || ''}
                        onChange={(e) => updateTopicDraft({ title: e.target.value })}
                        placeholder="Topic title"
                    />
                    <button className="close-btn" onClick={() => void handleRequestClose()}>&times;</button>
                </div>

                <div className="tabs-header" style={{ marginBottom: 14 }}>
                    <button className={`tab-btn ${activeTab === 'notes' ? 'active' : ''}`} onClick={() => setActiveTab('notes')}>
                        Notes
                    </button>
                    <button className={`tab-btn ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>
                        Details
                    </button>
                    <button className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
                        Worklog
                    </button>
                </div>

                <div className="modal-body" style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {activeTab === 'notes' ? (
                        <div className="topic-notes-workspace">
                            <aside className="notes-sidebar" aria-label="Topic notes">
                                <div className="notes-sidebar-header">
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                        <h3 style={{ margin: 0 }}>Topic Notes</h3>
                                        <button type="button" onClick={() => void handleCreateNote()}>
                                            + New
                                        </button>
                                    </div>
                                    <div className="muted" style={{ marginTop: 8 }}>
                                        {notes.length ? `${notes.length} saved note${notes.length === 1 ? '' : 's'}` : 'Capture each email thread as its own note.'}
                                    </div>
                                </div>
                                <div className="notes-sidebar-content">
                                    {notes.length > 0 ? (
                                        <ul className="notes-list topic-notes-list">
                                            {notes.map((note) => (
                                                <li key={note.id}>
                                                    <button
                                                        type="button"
                                                        className={`topic-note-list-item ${selectedNote?.id === note.id ? 'active' : ''}`}
                                                        onClick={() => handleSelectNote(note)}
                                                    >
                                                        <div className="note-row-title">
                                                            {note.title?.trim() ? note.title : `Note #${note.id}`}
                                                        </div>
                                                        <div className="note-row-meta">{formatDateTime(note.created_at)}</div>
                                                        <div className="note-row-preview">
                                                            {htmlToPlainText(note.content).slice(0, 110) || 'Empty note'}
                                                        </div>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div className="topic-notes-empty">
                                            <p>No topic notes yet.</p>
                                            <button type="button" className="primary-btn" onClick={() => void handleCreateNote()}>
                                                Create First Note
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </aside>

                            <section className="notes-editor-area" aria-label="Topic note editor">
                                {selectedNote ? (
                                    <>
                                        <header className="note-header">
                                            <div className="note-header-meta">
                                                <div className="muted">
                                                    {topic.title || 'Topic'} · Created {formatDateTime(selectedNote.created_at)}
                                                </div>
                                                <input
                                                    className="note-title-input"
                                                    value={selectedNote.title || ''}
                                                    onChange={(e) => updateSelectedNoteDraft({ title: e.target.value })}
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
                                                onChange={(html) => updateSelectedNoteDraft({ content: html })}
                                                onRequestSave={handleSaveNote}
                                                placeholder="Paste the email thread, key decisions, and follow-up context here…"
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="notes-empty-state">
                                        <div className="notes-empty-icon" aria-hidden="true">📝</div>
                                        <p>Select a topic note from the list or create a new one.</p>
                                        <button type="button" className="primary-btn" onClick={() => void handleCreateNote()}>
                                            Create First Note
                                        </button>
                                    </div>
                                )}
                            </section>
                        </div>
                    ) : null}

                    {activeTab === 'details' ? (
                        <div className="task-col task-col-properties" style={{ flex: 1 }}>
                            <section>
                                <label>Description</label>
                                <textarea
                                    value={topic.description || ''}
                                    onChange={(e) => updateTopicDraft({ description: e.target.value })}
                                    placeholder="What is this thread or follow-up about?"
                                />
                            </section>
                            <section>
                                <label>Status</label>
                                <select
                                    value={topic.status || 'BACKLOG'}
                                    onChange={(e) => updateTopicDraft({ status: e.target.value })}
                                >
                                    <option value="BACKLOG">Backlog</option>
                                    <option value="IN_PROGRESS">In Progress</option>
                                    <option value="DONE">Done</option>
                                </select>
                            </section>
                            <section>
                                <label>Tags (comma separated)</label>
                                <input
                                    type="text"
                                    value={topic.tags || ''}
                                    onChange={(e) => updateTopicDraft({ tags: e.target.value })}
                                    placeholder="email, client, escalation"
                                />
                            </section>
                        </div>
                    ) : null}

                    {activeTab === 'logs' ? (
                        <section className="task-panel" style={{ flex: 1 }}>
                            <div className="task-panel-header">
                                <label>Worklog</label>
                            </div>
                            <div className="task-panel-scroll" role="region" aria-label="Topic worklog">
                                {logs.map((log) => (
                                    <div key={log.id} className={`log-entry ${editingLogId === log.id ? 'editing' : ''}`}>
                                        <div className="log-entry-header">
                                            <div className="log-time">{formatDateTime(log.timestamp)}</div>
                                            <div className="log-entry-actions">
                                                <button type="button" className="link-btn" onClick={() => handleStartEditLog(log)}>
                                                    Edit
                                                </button>
                                                <button type="button" className="link-btn danger-link" onClick={() => void handleDeleteLog(log)}>
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                        <div className="log-content">{log.content || 'Empty work log'}</div>
                                    </div>
                                ))}
                                {logs.length === 0 && <div className="muted">No work logs yet.</div>}
                            </div>
                            <form onSubmit={handleSaveLog} className="task-panel-form log-form">
                                <textarea
                                    placeholder={editingLogId ? 'Update this work log…' : 'What did you work on?'}
                                    value={newLog}
                                    onChange={(e) => setNewLog(e.target.value)}
                                />
                                <div className="log-form-actions">
                                    {editingLogId ? (
                                        <button type="button" onClick={handleCancelEditLog}>
                                            Cancel
                                        </button>
                                    ) : null}
                                    <button type="submit" disabled={!newLog.trim()}>
                                        {editingLogId ? 'Save Edit' : 'Log Work'}
                                    </button>
                                </div>
                            </form>
                        </section>
                    ) : null}
                </div>

                <div className="task-modal-footer">
                    <div className="task-modal-actions">
                        {topic.id ? <button onClick={handleArchive}>Archive</button> : null}
                        {topic.id ? <button className="danger" onClick={handleDelete}>Delete Topic</button> : null}
                        <button className="primary-btn" onClick={() => void handleSaveTopicAndClose()}>
                            Save & Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TopicModal;
