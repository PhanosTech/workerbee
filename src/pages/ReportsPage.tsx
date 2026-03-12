import React, { useState, useEffect } from 'react';
import { api, ReportLog, Task } from '../api';

const ReportsPage: React.FC = () => {
    // Data States
    const [logs, setLogs] = useState<ReportLog[]>([]);
    const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
    const [activeTasks, setActiveTasks] = useState<Task[]>([]);

    // Filter States
    const [startDate, setStartDate] = useState(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    );
    const [endDate, setEndDate] = useState(
        new Date().toISOString().split('T')[0]
    );

    // UI States
    const [activeTab, setActiveTab] = useState<'worklog' | 'completed' | 'remaining'>('worklog');
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportFormat, setExportFormat] = useState<'html' | 'markdown'>('html');

    useEffect(() => {
        loadReportData();
    }, [startDate, endDate]);

    const loadReportData = async () => {
        try {
            const data = await api.getReportSummary(startDate, endDate);
            setLogs(data.logs || []);
            setCompletedTasks(data.completedTasks || []);

            // We need to fetch active tasks separately or modify getReportSummary.
            const allTasks = await api.getTasks();
            const remaining = allTasks.filter(t => t.status !== 'DONE' && !t.archived);
            setActiveTasks(remaining);
        } catch (err) {
            console.error("Failed to load reports", err);
        }
    };

    const getExportContent = () => {
        if (exportFormat === 'markdown') {
            return generateMarkdown();
        } else {
            return generateHtml();
        }
    };

    const generateMarkdown = () => {
        let text = `# Work Report (${startDate} to ${endDate})\n\n`;

        // Remaining Work
        text += `## Remaining Work\n`;
        if (activeTasks.length === 0) text += "_No active tasks._\n";
        activeTasks.forEach(t => {
            const due = t.due_date ? ` (Due: ${t.due_date.split('T')[0]})` : '';
            text += `- **${t.title}**${due}\n  ${t.description ? t.description.replace(/\n/g, ' ') : ''}\n`;
        });
        text += '\n';

        // Completed Tasks
        text += `## Completed Tasks\n`;
        if (completedTasks.length === 0) text += "_No tasks completed in this period._\n";
        completedTasks.forEach(t => {
            const done = t.done_at ? new Date(t.done_at).toLocaleDateString() : '';
            text += `- [${done}] **${t.title}**\n`;
        });
        text += '\n';

        // Work Log
        text += `## Work Logs\n`;
        if (logs.length === 0) text += "_No logs in this period._\n";
        
        const grouped: Record<string, ReportLog[]> = {};
        logs.forEach(l => {
            const title = l.task_title || l.topic_title || 'Untitled';
            if (!grouped[title]) grouped[title] = [];
            grouped[title].push(l);
        });

        for (const [title, entries] of Object.entries(grouped)) {
            const isTopic = entries[0].topic_title ? ' (Follow-up)' : '';
            text += `### ${title}${isTopic}\n`;
            entries.forEach(e => {
                text += `- ${new Date(e.timestamp).toLocaleDateString()}: ${e.content}\n`;
            });
            text += '\n';
        }

        return text;
    };

    const generateHtml = () => {
        let html = `<h2>Work Report (${startDate} to ${endDate})</h2>`;

        // Remaining Work
        html += `<h3>Remaining Work</h3>`;
        if (activeTasks.length > 0) {
            html += `<table border="1" style="border-collapse: collapse; width: 100%;">
                <thead>
                    <tr style="background: #f0f0f0;">
                        <th style="padding: 8px;">Task</th>
                        <th style="padding: 8px;">Status</th>
                        <th style="padding: 8px;">Due Date</th>
                    </tr>
                </thead>
                <tbody>`;
            activeTasks.forEach(t => {
                const due = t.due_date ? t.due_date.split('T')[0] : '-';
                html += `<tr>
                    <td style="padding: 8px;"><strong>${t.title}</strong><br/><small>${t.description || ''}</small></td>
                    <td style="padding: 8px;">${t.status}</td>
                    <td style="padding: 8px;">${due}</td>
                </tr>`;
            });
            html += `</tbody></table>`;
        } else {
            html += `<p><em>No active tasks.</em></p>`;
        }

        // Completed
        html += `<h3>Completed Tasks</h3>`;
        if (completedTasks.length > 0) {
            html += `<ul>`;
            completedTasks.forEach(t => {
                const done = t.done_at ? new Date(t.done_at).toLocaleDateString() : '';
                html += `<li>[${done}] <strong>${t.title}</strong></li>`;
            });
            html += `</ul>`;
        } else {
            html += `<p><em>No tasks completed.</em></p>`;
        }

        // Work Logs
        html += `<h3>Work Logs</h3>`;
        if (logs.length > 0) {
            const grouped: Record<string, ReportLog[]> = {};
            logs.forEach(l => {
                const title = l.task_title || l.topic_title || 'Untitled';
                if (!grouped[title]) grouped[title] = [];
                grouped[title].push(l);
            });

            html += `<ul>`;
            for (const [title, entries] of Object.entries(grouped)) {
                const isTopic = entries[0].topic_title ? ' <small style="color: #666;">(Follow-up)</small>' : '';
                html += `<li><strong>${title}</strong>${isTopic}
                    <ul>`;
                entries.forEach(e => {
                    html += `<li>${new Date(e.timestamp).toLocaleDateString()}: ${e.content}</li>`;
                });
                html += `</ul></li>`;
            }
            html += `</ul>`;
        } else {
            html += `<p><em>No logs.</em></p>`;
        }

        return html;
    };

    const handleCopy = () => {
        const content = getExportContent();
        navigator.clipboard.writeText(content);
        alert("Copied to clipboard!");
        setShowExportModal(false);
    };

    return (
        <div className="page reports-page">
            <header className="page-header">
                <div>
                    <h2>Reports</h2>
                </div>
                <div className="controls">
                    <input
                        type="date"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                    />
                    <span>to</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                    />
                    <button className="primary-btn" onClick={() => setShowExportModal(true)}>Export Report</button>
                </div>
            </header>

            <div className="tabs-header" style={{ padding: '0 16px', marginTop: 10 }}>
                <button
                    className={`tab-btn ${activeTab === 'worklog' ? 'active' : ''}`}
                    onClick={() => setActiveTab('worklog')}
                >
                    Work Log
                </button>
                <button
                    className={`tab-btn ${activeTab === 'completed' ? 'active' : ''}`}
                    onClick={() => setActiveTab('completed')}
                >
                    Completed Tasks
                </button>
                <button
                    className={`tab-btn ${activeTab === 'remaining' ? 'active' : ''}`}
                    onClick={() => setActiveTab('remaining')}
                >
                    Remaining Work
                </button>
            </div>

            <div className="reports-body" style={{ marginTop: 0 }}>
                {activeTab === 'worklog' && (
                    <section className="report-section">
                        <div className="report-list">
                            {logs.map(log => (
                                <div key={log.id} className="report-item">
                                    <div className="report-meta">
                                        <span className="date">{new Date(log.timestamp).toLocaleString()}</span>
                                        <span className="task-ref">{log.task_title || log.topic_title}</span>
                                        {log.category_name && <span className="cat-badge">{log.category_name}</span>}
                                        {log.topic_title && <span className="cat-badge" style={{ background: 'var(--accent-color)', color: '#fff' }}>Follow-up</span>}
                                    </div>
                                    <div className="report-content">
                                        {log.content}
                                    </div>
                                </div>
                            ))}
                            {logs.length === 0 && <p className="empty-state">No logs found for this period.</p>}
                        </div>
                    </section>
                )}

                {activeTab === 'completed' && (
                    <section className="report-section">
                        <div className="report-list">
                            {completedTasks.map(task => (
                                <div key={task.id} className="report-item">
                                    <div className="report-meta">
                                        <span className="date">{task.done_at ? new Date(task.done_at).toLocaleString() : '—'}</span>
                                        <span className="task-ref">{task.title}</span>
                                        {task.category_name && <span className="cat-badge">{task.category_name}</span>}
                                    </div>
                                    <div className="report-content">
                                        {task.description || <span style={{ opacity: 0.6 }}>No description</span>}
                                    </div>
                                </div>
                            ))}
                            {completedTasks.length === 0 && <p className="empty-state">No tasks completed for this period.</p>}
                        </div>
                    </section>
                )}

                {activeTab === 'remaining' && (
                    <section className="report-section">
                        <div className="report-list">
                            {activeTasks.map(task => (
                                <div key={task.id} className="report-item">
                                    <div className="report-meta">
                                        <span className="status-badge" style={{ marginRight: 8 }}>{task.status}</span>
                                        <span className="task-ref">{task.title}</span>
                                        {task.due_date && <span className="date" style={{ color: 'var(--accent-color)' }}>Due: {task.due_date.split('T')[0]}</span>}
                                    </div>
                                    <div className="report-content">
                                        {task.description || <span style={{ opacity: 0.6 }}>No description</span>}
                                    </div>
                                </div>
                            ))}
                            {activeTasks.length === 0 && <p className="empty-state">No active tasks (Backlog/Doing).</p>}
                        </div>
                    </section>
                )}
            </div>

            {showExportModal && (
                <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setShowExportModal(false) }}>
                    <div className="modal-content" style={{ width: '800px', height: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="modal-header">
                            <h3>Export Report</h3>
                            <button className="close-btn" onClick={() => setShowExportModal(false)}>&times;</button>
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <div className="notes-tabbar">
                                <button
                                    className={`notes-tab ${exportFormat === 'html' ? 'active' : ''}`}
                                    onClick={() => setExportFormat('html')}
                                >
                                    HTML (Outlook)
                                </button>
                                <button
                                    className={`notes-tab ${exportFormat === 'markdown' ? 'active' : ''}`}
                                    onClick={() => setExportFormat('markdown')}
                                >
                                    Markdown
                                </button>
                            </div>
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', background: 'var(--input-bg)', padding: 16, borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', margin: 0 }}>
                                {getExportContent()}
                            </pre>
                        </div>
                        <div className="modal-actions" style={{ justifyContent: 'flex-end', marginTop: 16, display: 'flex', gap: 10 }}>
                            <button onClick={() => setShowExportModal(false)}>Close</button>
                            <button className="primary-btn" onClick={handleCopy}>Copy to Clipboard</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReportsPage;
