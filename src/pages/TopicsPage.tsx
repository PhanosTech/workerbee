import React, { useEffect, useState } from 'react';
import { api, Topic } from '../api';
import TopicModal from '../components/TopicModal';

type TopicView = 'active' | 'done' | 'archived';

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

const TopicsPage: React.FC = () => {
    const [topics, setTopics] = useState<Topic[]>([]);
    const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
    const [showModal, setShowModal] = useState<boolean>(false);
    const [view, setView] = useState<TopicView>('active');
    const [dragTopicId, setDragTopicId] = useState<number | null>(null);

    useEffect(() => {
        loadTopics();
    }, [view]);

    const loadTopics = async () => {
        try {
            const filters =
                view === 'done'
                    ? { statuses: ['DONE'] }
                    : view === 'archived'
                      ? { archived: 'only' as const }
                      : { statuses: ['BACKLOG', 'IN_PROGRESS'] };
            const data = await api.getTopics(filters);
            setTopics(data || []);
        } catch (err) {
            console.error(err);
        }
    };

    const handleOpenTopic = (id: number) => {
        setSelectedTopicId(id);
        setShowModal(true);
    };

    const handleAddTopic = () => {
        setSelectedTopicId(null);
        setShowModal(true);
    };

    const parseDragTopicId = (e: React.DragEvent): number | null => {
        const raw = e.dataTransfer.getData('text/plain');
        const value = Number(raw || dragTopicId);
        return Number.isFinite(value) ? value : null;
    };

    const canSort = view !== 'archived';

    const handleDropOnTopic = async (e: React.DragEvent, targetId: number) => {
        e.preventDefault();
        e.stopPropagation();
        if (!canSort) return;
        const movingId = parseDragTopicId(e);
        if (!movingId || movingId === targetId) return;
        const next = moveBefore(topics, movingId, targetId);
        setTopics(next);
        setDragTopicId(null);
        await api.reorderTopics(next.map((topic) => topic.id));
    };

    const handleDropToEnd = async (e: React.DragEvent) => {
        e.preventDefault();
        if (!canSort) return;
        const movingId = parseDragTopicId(e);
        if (!movingId) return;
        const next = moveToEnd(topics, movingId);
        setTopics(next);
        setDragTopicId(null);
        await api.reorderTopics(next.map((topic) => topic.id));
    };

    return (
        <div className="page topics-page">
            <header className="page-header">
                <div>
                    <h2>Topics</h2>
                    <div className="notes-filters" style={{ marginTop: 10 }}>
                        <button type="button" className={`filter-btn ${view === 'active' ? 'active' : ''}`} onClick={() => setView('active')}>
                            Backlog + In Progress
                        </button>
                        <button type="button" className={`filter-btn ${view === 'done' ? 'active' : ''}`} onClick={() => setView('done')}>
                            Done
                        </button>
                        <button type="button" className={`filter-btn ${view === 'archived' ? 'active' : ''}`} onClick={() => setView('archived')}>
                            Archived
                        </button>
                    </div>
                </div>
                <button className="primary-btn" onClick={handleAddTopic}>+ Add Topic</button>
            </header>

            <div className="tasks-table-wrap">
                <table className="tasks-table" onDragOver={(e) => canSort && e.preventDefault()} onDrop={handleDropToEnd}>
                    <thead>
                        <tr>
                            <th style={{ width: 40 }} />
                            <th>Title</th>
                            <th>Status</th>
                            <th>Tags</th>
                            <th style={{ width: 120 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {topics.map((topic) => (
                            <tr
                                key={topic.id}
                                className="tasks-row"
                                draggable={canSort}
                                onDragStart={(e) => {
                                    if (!canSort) return;
                                    setDragTopicId(topic.id);
                                    e.dataTransfer.effectAllowed = 'move';
                                    e.dataTransfer.setData('text/plain', String(topic.id));
                                }}
                                onDragEnd={() => setDragTopicId(null)}
                                onDrop={(e) => handleDropOnTopic(e, topic.id)}
                                onClick={() => handleOpenTopic(topic.id)}
                            >
                                <td onClick={(e) => e.stopPropagation()}>
                                    <span className={`drag-handle ${canSort ? '' : 'disabled'}`}>⋮⋮</span>
                                </td>
                                <td className="tasks-title">{topic.title}</td>
                                <td className="tasks-status">
                                    <span className={`status-badge ${topic.status === 'IN_PROGRESS' ? 'active' : topic.status === 'DONE' ? 'done' : ''}`}>
                                        {topic.status === 'IN_PROGRESS' ? 'In Progress' : topic.status}
                                    </span>
                                </td>
                                <td>{topic.tags || '—'}</td>
                                <td className="tasks-actions" onClick={(e) => e.stopPropagation()}>
                                    <button className="primary-btn" onClick={() => handleOpenTopic(topic.id)}>Open</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {topics.length === 0 && <p className="empty-state">No topics in this view.</p>}
            </div>

            {showModal && (
                <TopicModal
                    topicId={selectedTopicId}
                    onClose={() => setShowModal(false)}
                    onUpdate={loadTopics}
                />
            )}
        </div>
    );
};

export default TopicsPage;
