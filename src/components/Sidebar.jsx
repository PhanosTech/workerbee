import React from 'react';

const Sidebar = ({ activeTab, setActiveTab }) => {
    return (
        <nav className="sidebar">
            <div className="logo-container">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <img src="/logo.png" alt="WorkerBee Logo" style={{ width: '24px', height: '24px' }} />
                    <h1 className="logo">WorkerBee</h1>
                </div>
            </div>
            <ul>
                <li
                    className={activeTab === 'notes' ? 'active' : ''}
                    onClick={() => setActiveTab('notes')}
                >
                    <span className="icon">📝</span> Notes
                </li>
                <li
                    className={activeTab === 'kanban' ? 'active' : ''}
                    onClick={() => setActiveTab('kanban')}
                >
                    <span className="icon">⚡</span> Kanban
                </li>
                <li
                    className={activeTab === 'backlog' ? 'active' : ''}
                    onClick={() => setActiveTab('backlog')}
                >
                    <span className="icon">📚</span> Backlog
                </li>
                <li
                    className={activeTab === 'reports' ? 'active' : ''}
                    onClick={() => setActiveTab('reports')}
                >
                    <span className="icon">📊</span> Reports
                </li>
            </ul>
        </nav>
    );
};

export default Sidebar;
