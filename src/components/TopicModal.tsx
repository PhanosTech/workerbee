import React, { useState, useEffect } from 'react';
import { api, Topic, TopicTodo, TopicLog, TopicNote } from '../api';
import TiptapEditor from './TiptapEditor';

interface TopicModalProps {
    topicId: number | null;
    onClose: () => void;
    onUpdate: () => void;
}

const TopicModal: React.FC<TopicModalProps> = ({ topicId, onClose, onUpdate }) => {
    const [topic, setTopic] = useState<Partial<Topic> | null>(null);
    const [activeTab, setActiveTab] = useState<'details' | 'todos' | 'logs' | 'notes'>('details');
    const [todos, setTodos] = useState<TopicTodo[]>([]);
    const [logs, setLogs] = useState<TopicLog[]>([]);
    const [notes, setNotes] = useState<TopicNote[]>([]);
    const [newTodo, setNewTodo] = useState('');
    const [newLog, setNewLog] = useState('');
    const [showNoteModal, setShowNoteModal] = useState(false);
    const [activeNote, setActiveNote] = useState<TopicNote | null>(null);
    const [noteTitleDraft, setNoteTitleDraft] = useState('');
    const [noteDraft, setNoteDraft] = useState('');

    useEffect(() => {
        if (topicId) {
            loadTopicData();
        } else {
            setTopic({
                title: '',
                description: '',
                status: 'BACKLOG',
                tags: ''
            });
        }
    }, [topicId]);

    const loadTopicData = async () => {
        if (!topicId) return;
        try {
            const data = await api.getTopic(topicId);
            setTopic(data);
            const [t, l, n] = await Promise.all([
                api.getTopicTodos(topicId),
                api.getTopicLogs(topicId),
                api.getTopicNotes(topicId)
            ]);
            setTodos(t || []);
            setLogs(l || []);
            setNotes(n || []);
        } catch (err) {
            console.error(err);
        }
    };

    const handleSave = async () => {
        if (!topic) return;
        try {
            if (topic.id) {
                await api.updateTopic(topic.id, topic);
            } else {
                await api.createTopic(topic);
            }
            onUpdate();
            onClose();
        } catch (err) {
            console.error(err);
        }
    };

    const handleDelete = async () => {
        if (!topic || !topic.id) return;
        if (!confirm('Delete this topic?')) return;
        await api.deleteTopic(topic.id);
        onUpdate();
        onClose();
    };

    const handleAddTodo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTodo || !topic || !topic.id) return;
        await api.addTopicTodo(topic.id, newTodo);
        setNewTodo('');
        const t = await api.getTopicTodos(topic.id);
        setTodos(t || []);
    };

    const handleToggleTodo = async (todo: TopicTodo) => {
        if (!topic || !topic.id) return;
        const nextCompleted = !todo.completed;
        await api.updateTopicTodo(todo.id, todo.text, nextCompleted);
        const t = await api.getTopicTodos(topic.id);
        setTodos(t || []);
    };

    const handleDeleteTodo = async (id: number) => {
        if (!topic || !topic.id) return;
        if (!confirm('Delete this todo?')) return;
        await api.deleteTopicTodo(id);
        const t = await api.getTopicTodos(topic.id);
        setTodos(t || []);
    };

    const handleAddLog = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newLog || !topic || !topic.id) return;
        await api.addTopicLog(topic.id, newLog);
        setNewLog('');
        const l = await api.getTopicLogs(topic.id);
        setLogs(l || []);
    };

    const openNoteModal = (note: TopicNote | null) => {
        setActiveNote(note || null);
        setNoteTitleDraft(note?.title || '');
        setNoteDraft(note?.content || '');
        setShowNoteModal(true);
    };

    const handleSaveNote = async () => {
        if (!topic || !topic.id) return;
        if (activeNote?.id) {
            await api.updateTopicNote(activeNote.id, noteTitleDraft, noteDraft);
        } else {
            await api.addTopicNote(topic.id, noteTitleDraft, noteDraft, 'rich_text');
        }
        setShowNoteModal(false);
        const n = await api.getTopicNotes(topic.id);
        setNotes(n || []);
    };

    const handleDeleteNote = async (id: number) => {
        if (!topic || !topic.id) return;
        if (!confirm('Delete this note?')) return;
        await api.deleteTopicNote(id);
        setShowNoteModal(false);
        const n = await api.getTopicNotes(topic.id);
        setNotes(n || []);
    };

    if (!topic) return null;

    return (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal-content task-modal">
                <div className="modal-header">
                    <input
                        className="title-input"
                        value={topic.title || ''}
                        onChange={(e) => setTopic({ ...topic, title: e.target.value })}
                        placeholder="Topic Title"
                    />
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <div className="tabs-header" style={{ marginBottom: 14 }}>
                    <button className={`tab-btn ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>Details</button>
                    {topic.id && (
                        <>
                            <button className={`tab-btn ${activeTab === 'todos' ? 'active' : ''}`} onClick={() => setActiveTab('todos')}>Todos</button>
                            <button className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>Worklog</button>
                            <button className={`tab-btn ${activeTab === 'notes' ? 'active' : ''}`} onClick={() => setActiveTab('notes')}>Notes</button>
                        </>
                    )}
                </div>

                <div className="modal-body" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {activeTab === 'details' && (
                        <div className="task-col-properties" style={{ flex: 1, overflow: 'auto' }}>
                            <section>
                                <label>Description</label>
                                <textarea
                                    value={topic.description || ''}
                                    onChange={(e) => setTopic({ ...topic, description: e.target.value })}
                                />
                            </section>
                            <section>
                                <label>Status</label>
                                <select
                                    value={topic.status || 'BACKLOG'}
                                    onChange={(e) => setTopic({ ...topic, status: e.target.value })}
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
                                    onChange={(e) => setTopic({ ...topic, tags: e.target.value })}
                                />
                            </section>
                        </div>
                    )}

                    {activeTab === 'todos' && (
                        <div className="task-panel" style={{ flex: 1 }}>
                            <form onSubmit={handleAddTodo} className="task-panel-form">
                                <input
                                    placeholder="Add todo..."
                                    value={newTodo}
                                    onChange={(e) => setNewTodo(e.target.value)}
                                />
                            </form>
                            <div className="task-panel-scroll">
                                <ul className="todo-list">
                                    {todos.map(todo => (
                                        <li key={todo.id} className="todo-row">
                                            <label className="todo-item">
                                                <input
                                                    type="checkbox"
                                                    checked={!!todo.completed}
                                                    onChange={() => handleToggleTodo(todo)}
                                                />
                                                <span>{todo.text}</span>
                                            </label>
                                            <button className="icon-btn" onClick={() => handleDeleteTodo(todo.id)}>🗑</button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}

                    {activeTab === 'logs' && (
                        <div className="task-panel" style={{ flex: 1 }}>
                            <div className="task-panel-scroll">
                                {logs.map(log => (
                                    <div key={log.id} className="log-entry">
                                        <div className="log-time">{new Date(log.timestamp).toLocaleString()}</div>
                                        <div className="log-content">{log.content}</div>
                                    </div>
                                ))}
                            </div>
                            <form onSubmit={handleAddLog} className="task-panel-form">
                                <textarea
                                    placeholder="Log work..."
                                    value={newLog}
                                    onChange={(e) => setNewLog(e.target.value)}
                                />
                                <button type="submit">Log</button>
                            </form>
                        </div>
                    )}

                    {activeTab === 'notes' && (
                        <div className="task-panel" style={{ flex: 1 }}>
                            <div className="task-panel-header">
                                <label>Notes</label>
                                <button onClick={() => openNoteModal(null)}>+ New</button>
                            </div>
                            <div className="task-panel-scroll">
                                <ul className="notes-list">
                                    {notes.map(note => (
                                        <li key={note.id} onClick={() => openNoteModal(note)}>
                                            <div className="note-row-title">{note.title || `Note #${note.id}`}</div>
                                            <div className="note-row-preview">
                                                {(note.content || '').replace(/<[^>]*>/g, ' ').slice(0, 100)}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}
                </div>

                <div className="task-modal-footer">
                    <div className="task-modal-actions">
                        {topic.id && <button className="danger" onClick={handleDelete}>Delete Topic</button>}
                        <button className="primary-btn" onClick={handleSave}>Save</button>
                    </div>
                </div>
            </div>

            {showNoteModal && (
                <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowNoteModal(false)}>
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
                            onRequestSave={handleSaveNote}
                        />
                        <div className="modal-actions">
                            <button onClick={() => setShowNoteModal(false)}>Cancel</button>
                            {activeNote && <button onClick={() => handleDeleteNote(activeNote.id)}>Delete</button>}
                            <button className="primary-btn" onClick={handleSaveNote}>Save Note</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TopicModal;
