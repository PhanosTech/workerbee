import React, { useEffect, useMemo, useState } from 'react';
import { api, Category, Task } from '../api';
import TaskModal from '../components/TaskModal';

interface Lane {
    key: string;
    title: string;
    help: string;
}

const LANES: Lane[] = [
    { key: 'STARTED', title: 'Started', help: 'Ready to work on' },
    { key: 'DOING', title: 'Doing', help: 'In progress' },
    { key: 'DONE', title: 'Done', help: 'Completed' },
];

const percent = (completed: number, total: number): number => {
    if (!total) return 0;
    return Math.round((completed / total) * 100);
};

const moveBefore = <T extends { id: number }>(items: T[], movingId: number, targetId: number): T[] => {
    const fromIndex = items.findIndex((t) => t.id === movingId);
    const toIndex = items.findIndex((t) => t.id === targetId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return items;

    const next = items.slice();
    const [moved] = next.splice(fromIndex, 1);
    const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    next.splice(insertIndex, 0, moved);
    return next;
};

const moveToEnd = <T extends { id: number }>(items: T[], movingId: number): T[] => {
    const fromIndex = items.findIndex((t) => t.id === movingId);
    if (fromIndex === -1 || fromIndex === items.length - 1) return items;
    const next = items.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.push(moved);
    return next;
};

const hexToRgb = (hex: string | null): string | null => {
    const cleaned = String(hex || '').trim();
    const match = cleaned.match(/^#?([0-9a-f]{6})$/i);
    if (!match) return null;
    const value = match[1];
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `${r}, ${g}, ${b}`;
};

const normalizeTaskType = (value: string | null): string =>
    String(value || '')
        .trim()
        .toUpperCase()
        .replaceAll(' ', '_');

interface TaskTypeMeta {
    className: string;
    icon: string;
    label: string;
}

const TASK_TYPE_META: Record<string, TaskTypeMeta> = {
    MEETING: { className: 'task-type-meeting', icon: '📅', label: 'Meeting' },
    FOLLOW_UP: { className: 'task-type-follow-up', icon: '❓', label: 'Follow Up' },
    ISSUE: { className: 'task-type-issue', icon: '🚨', label: 'Issue' },
};

const getTaskTypeMeta = (value: string | null): TaskTypeMeta | null => TASK_TYPE_META[normalizeTaskType(value)] || null;

interface ActivePageProps {
    onOpenInBacklog: (task: { id: number; category_id?: number | null }) => void;
}

const ActivePage: React.FC<ActivePageProps> = ({ onOpenInBacklog }) => {
    const [tasksByStatus, setTasksByStatus] = useState<Record<string, Task[]>>({ STARTED: [], DOING: [], DONE: [] });
    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [dragTaskId, setDragTaskId] = useState<number | null>(null);

    const categoryById = useMemo(() => {
        const map = new Map<number, Category>();
        categories.forEach((c) => map.set(c.id, c));
        return map;
    }, [categories]);

    const getCategoryTrail = (categoryId: number | null): Category[] => {
        if (!categoryId) return [];
        const parts: Category[] = [];
        const seen = new Set<number>();
        let current: Category | undefined = categoryById.get(categoryId);
        while (current && !seen.has(current.id)) {
            parts.unshift(current);
            seen.add(current.id);
            current = current.parent_id ? categoryById.get(current.parent_id) : undefined;
        }
        return parts;
    };

    useEffect(() => {
        loadBoard();
    }, []);

    const loadBoard = async () => {
        const [cats, started, doing, done] = await Promise.all([
            api.getCategories(),
            api.getTasks({ status: 'STARTED' }),
            api.getTasks({ status: 'DOING' }),
            api.getTasks({ status: 'DONE' }),
        ]);

        setCategories(cats);
        setTasksByStatus({
            STARTED: started,
            DOING: doing,
            DONE: done,
        });
    };

    const findTaskStatus = (taskId: number): string | null => {
        for (const lane of LANES) {
            if (tasksByStatus[lane.key]?.some((t) => t.id === taskId)) return lane.key;
        }
        return null;
    };

    const parseDragTaskId = (e: React.DragEvent): number | null => {
        const raw = e.dataTransfer.getData('text/plain');
        return Number(raw || dragTaskId);
    };

    const handleDropToLane = async (e: React.DragEvent, targetStatus: string) => {
        e.preventDefault();
        const taskId = parseDragTaskId(e);
        if (!taskId) return;

        const currentStatus = findTaskStatus(taskId);
        if (!currentStatus) return;

        if (currentStatus === targetStatus) {
            const laneTasks = tasksByStatus[targetStatus] || [];
            const nextLane = moveToEnd(laneTasks, taskId);
            setTasksByStatus((prev) => ({ ...prev, [targetStatus]: nextLane }));
            setDragTaskId(null);
            await api.reorderTasks(targetStatus, nextLane.map((t) => t.id));
            return;
        }

        const sourceLane = tasksByStatus[currentStatus] || [];
        const targetLane = tasksByStatus[targetStatus] || [];
        const movingTask = sourceLane.find((t) => t.id === taskId);
        if (!movingTask) return;
        const nextSourceLane = sourceLane.filter((t) => t.id !== taskId);
        const nextTargetLane = [...targetLane, { ...movingTask, status: targetStatus }];

        setTasksByStatus((prev) => ({
            ...prev,
            [currentStatus]: nextSourceLane,
            [targetStatus]: nextTargetLane,
        }));
        setDragTaskId(null);
        await api.updateTask(taskId, { ...movingTask, status: targetStatus });
        await api.reorderTasks(currentStatus, nextSourceLane.map((t) => t.id));
        await api.reorderTasks(targetStatus, nextTargetLane.map((t) => t.id));
        loadBoard();
    };

    const handleDropOnCard = async (e: React.DragEvent, laneStatus: string, targetId: number) => {
        e.preventDefault();
        e.stopPropagation();
        const taskId = parseDragTaskId(e);
        if (!taskId || taskId === targetId) return;

        const sourceStatus = findTaskStatus(taskId);
        if (!sourceStatus) return;

        if (sourceStatus === laneStatus) {
            const laneTasks = tasksByStatus[laneStatus] || [];
            const nextLane = moveBefore(laneTasks, taskId, targetId);
            setTasksByStatus((prev) => ({ ...prev, [laneStatus]: nextLane }));
            setDragTaskId(null);
            await api.reorderTasks(laneStatus, nextLane.map((t) => t.id));
            return;
        }

        const sourceLane = tasksByStatus[sourceStatus] || [];
        const targetLane = tasksByStatus[laneStatus] || [];
        const movingTask = sourceLane.find((t) => t.id === taskId);
        if (!movingTask) return;
        const nextSourceLane = sourceLane.filter((t) => t.id !== taskId);
        const insertIndex = targetLane.findIndex((t) => t.id === targetId);
        const nextTargetLane = targetLane.slice();
        nextTargetLane.splice(insertIndex === -1 ? nextTargetLane.length : insertIndex, 0, { ...movingTask, status: laneStatus });

        setTasksByStatus((prev) => ({
            ...prev,
            [sourceStatus]: nextSourceLane,
            [laneStatus]: nextTargetLane,
        }));
        setDragTaskId(null);
        await api.updateTask(taskId, { ...movingTask, status: laneStatus });
        await api.reorderTasks(sourceStatus, nextSourceLane.map((t) => t.id));
        await api.reorderTasks(laneStatus, nextTargetLane.map((t) => t.id));
        loadBoard();
    };

    const handleArchiveDone = async () => {
        if (!confirm('Archive all DONE tasks? (They will be removed from the board.)')) return;
        await api.archiveDoneTasks();
        loadBoard();
    };

    const handleOpenInBacklog = (e: React.MouseEvent, task: Task) => {
        e.stopPropagation();
        if (typeof onOpenInBacklog === 'function') onOpenInBacklog(task);
    };

    const handleArchiveTask = async (e: React.MouseEvent, task: Task) => {
        e.stopPropagation();
        if (!confirm('Archive this task?')) return;
        await api.archiveTask(task.id);
        loadBoard();
    };

    return (
        <div className="page active-page">
            <header className="page-header">
                <div>
                    <h2 style={{ margin: 0 }}>Kanban</h2>
                    <div className="muted" style={{ marginTop: 2 }}>Drag cards between lanes.</div>
                </div>
                <div className="controls">
                    <button onClick={handleArchiveDone}>Clear Done</button>
                </div>
            </header>

            <div className="kanban-board">
                {LANES.map((lane) => (
                    <section
                        key={lane.key}
                        className="kanban-lane"
                        data-status={lane.key}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDropToLane(e, lane.key)}
                    >
                        <div className="kanban-lane-header">
                            <div>
                                <div className="kanban-lane-title">
                                    {lane.title}{' '}
                                    <span className="kanban-count">
                                        {tasksByStatus[lane.key]?.length || 0}
                                    </span>
                                </div>
                                <div className="kanban-lane-help">{lane.help}</div>
                            </div>
                        </div>

                        <div className="kanban-lane-body">
                            {(tasksByStatus[lane.key] || []).map((task) => {
                                const catTrail = getCategoryTrail(task.category_id);
                                const catPath = catTrail.map((c) => c.name).join(' > ');
                                const leafColor = catTrail.length ? catTrail[catTrail.length - 1].color : null;
                                const labelColor = leafColor || '#89b4fa';
                                const labelRgb = hexToRgb(labelColor) || '137, 180, 250';
                                const hasTodos = Number(task.todo_total) > 0;
                                const p = percent(Number(task.todo_completed), Number(task.todo_total));
                                const taskType = getTaskTypeMeta(task.task_type);

                                return (
                                    <div
                                        key={task.id}
                                        className={`kanban-card priority-${String(task.priority || 'NORMAL').toLowerCase()} ${taskType?.className || ''}`}
                                        style={{ '--label-color': labelColor, '--label-rgb': labelRgb } as React.CSSProperties}
                                        draggable
                                        onDragStart={(e) => {
                                            setDragTaskId(task.id);
                                            e.dataTransfer.effectAllowed = 'move';
                                            e.dataTransfer.setData('text/plain', String(task.id));
                                        }}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={(e) => handleDropOnCard(e, lane.key, task.id)}
                                        onClick={() => setSelectedTask(task)}
                                        role="button"
                                        tabIndex={0}
                                    >
                                        <div className="kanban-card-header">
                                            <div className="kanban-card-title">
                                                {taskType && (
                                                    <span
                                                        className="task-type-icon"
                                                        title={taskType.label}
                                                        role="img"
                                                        aria-label={taskType.label}
                                                    >
                                                        {taskType.icon}
                                                    </span>
                                                )}
                                                <span className="kanban-card-title-text">{task.title}</span>
                                            </div>
                                            {catPath && (
                                                <button
                                                    type="button"
                                                    className="kanban-card-label-trail"
                                                    title={`${catPath} (open in backlog)`}
                                                    onClick={(e) => handleOpenInBacklog(e, task)}
                                                >
                                                    {catTrail.map((c, idx) => (
                                                        <React.Fragment key={c.id}>
                                                            <span
                                                                className="kanban-card-label-seg"
                                                                style={{ '--seg-color': c.color || '#89b4fa' } as React.CSSProperties}
                                                            >
                                                                {c.name}
                                                            </span>
                                                            {idx < catTrail.length - 1 && (
                                                                <span className="kanban-card-label-sep">›</span>
                                                            )}
                                                        </React.Fragment>
                                                    ))}
                                                </button>
                                            )}
                                        </div>
                                        {task.description && (
                                            <div className="kanban-card-desc">{task.description}</div>
                                        )}

                                        <div className="kanban-card-meta">
                                            {hasTodos && (
                                                <span className="todo-badge">
                                                    {task.todo_completed}/{task.todo_total} ({p}%)
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                className="icon-btn kanban-action-icon"
                                                onClick={(e) => handleOpenInBacklog(e, task)}
                                                title="Open in Backlog"
                                                aria-label="Open in Backlog"
                                            >
                                                📚
                                            </button>
                                            <button
                                                type="button"
                                                className="icon-btn kanban-action-icon danger-icon"
                                                onClick={(e) => handleArchiveTask(e, task)}
                                                title="Archive task"
                                                aria-label="Archive task"
                                            >
                                                🗄️
                                            </button>
                                        </div>

                                        {hasTodos && (
                                            <div className="todo-progress">
                                                <div className="todo-progress-bar" style={{ width: `${p}%` }} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {(tasksByStatus[lane.key] || []).length === 0 && (
                                <div className="kanban-empty">No tasks</div>
                            )}
                        </div>
                    </section>
                ))}
            </div>

            {selectedTask && (
                <TaskModal
                    taskId={selectedTask.id}
                    onClose={() => setSelectedTask(null)}
                    onUpdate={loadBoard}
                />
            )}
        </div>
    );
};

export default ActivePage;
