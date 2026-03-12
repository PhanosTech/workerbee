import React, { useState, useEffect } from 'react';
import { api, Topic } from '../api';
import TopicModal from '../components/TopicModal';

const TopicsPage: React.FC = () => {
    const [topics, setTopics] = useState<Topic[]>([]);
    const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
    const [showModal, setShowModal] = useState<boolean>(false);

    useEffect(() => {
        loadTopics();
    }, []);

    const loadTopics = async () => {
        try {
            const data = await api.getTopics();
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

    return (
        <div className="page topics-page">
            <header className="page-header">
                <h2>Topics</h2>
                <button className="primary-btn" onClick={handleAddTopic}>+ Add Topic</button>
            </header>

            <div className="tasks-table-wrap">
                <table className="tasks-table">
                    <thead>
                        <tr>
                            <th>Title</th>
                            <th>Status</th>
                            <th>Tags</th>
                            <th style={{ width: 100 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {topics.map((topic) => (
                            <tr key={topic.id} className="tasks-row" onClick={() => handleOpenTopic(topic.id)}>
                                <td className="tasks-title">{topic.title}</td>
                                <td className="tasks-status">
                                    <span className={`status-badge ${topic.status === 'IN_PROGRESS' ? 'active' : topic.status === 'DONE' ? 'done' : ''}`}>
                                        {topic.status}
                                    </span>
                                </td>
                                <td>{topic.tags || '—'}</td>
                                <td className="tasks-actions">
                                    <button className="primary-btn" onClick={(e) => { e.stopPropagation(); handleOpenTopic(topic.id); }}>Open</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {topics.length === 0 && <p className="empty-state">No topics found.</p>}
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
