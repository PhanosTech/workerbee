import React, { useState, useEffect } from 'react';
import { api } from '../api';

const ReportsPage = () => {
    const [logs, setLogs] = useState([]);
    const [completedTasks, setCompletedTasks] = useState([]);
    const [startDate, setStartDate] = useState(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    );
    const [endDate, setEndDate] = useState(
        new Date().toISOString().split('T')[0]
    );

    useEffect(() => {
        loadReports();
    }, [startDate, endDate]);

    const loadReports = async () => {
        const data = await api.getReportSummary(startDate, endDate);
        setLogs(data.logs || []);
        setCompletedTasks(data.completedTasks || []);
    };

    const handleExport = () => {
        let text = `Work Report (${startDate} to ${endDate})\n\n`;

        if (completedTasks.length > 0) {
            text += `# Completed Tasks\n`;
            completedTasks.forEach(task => {
                const when = task.done_at ? new Date(task.done_at).toLocaleDateString() : '';
                const label = task.category_name ? ` (${task.category_name})` : '';
                text += `- [${when}] ${task.title}${label}\n`;
            });
            text += '\n';
        }

        text += `# Work Logs\n\n`;

        const grouped = {};

        // Group by Task
        logs.forEach(log => {
            if (!grouped[log.task_title]) grouped[log.task_title] = [];
            grouped[log.task_title].push(log);
        });

        for (const [taskTitle, taskLogs] of Object.entries(grouped)) {
            text += `## ${taskTitle}\n`;
            taskLogs.forEach(log => {
                text += `- [${new Date(log.timestamp).toLocaleDateString()}] ${log.content}\n`;
            });
            text += '\n';
        }

        navigator.clipboard.writeText(text);
        alert('Report copied to clipboard!');
    };

    return (
        <div className="page reports-page">
            <header className="page-header">
                <h2>Reports</h2>
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
                    <button className="primary-btn" onClick={handleExport}>Copy (Markdown)</button>
                </div>
            </header>

            <div className="reports-body">
                <section className="report-section">
                    <h3 className="report-section-title">Completed Tasks</h3>
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

                <section className="report-section">
                    <h3 className="report-section-title">Work Logs</h3>
                    <div className="report-list">
                        {logs.map(log => (
                            <div key={log.id} className="report-item">
                                <div className="report-meta">
                                    <span className="date">{new Date(log.timestamp).toLocaleString()}</span>
                                    <span className="task-ref">{log.task_title}</span>
                                    {log.category_name && <span className="cat-badge">{log.category_name}</span>}
                                </div>
                                <div className="report-content">
                                    {log.content}
                                </div>
                            </div>
                        ))}
                        {logs.length === 0 && <p className="empty-state">No logs found for this period.</p>}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default ReportsPage;
