import React, { useEffect, useMemo, useState } from 'react';
import { api, WeeklyNote } from '../api';
import TiptapEditor from '../components/TiptapEditor';
import { WeeklyFocus } from '../App';

const dateOnlyTodayLocal = (): string => {
    const d = new Date();
    const tz = d.getTimezoneOffset() * 60_000;
    return new Date(d.getTime() - tz).toISOString().split('T')[0];
};

const addDays = (dateOnly: string, days: number): string => {
    const match = String(dateOnly || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return dateOnlyTodayLocal();
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() + Number(days || 0));
    return d.toISOString().split('T')[0];
};

const weekEndFromStart = (weekStart: string): string => addDays(weekStart, 6);

interface WeeklyStatusPageProps {
    focus: WeeklyFocus | null;
}

export default function WeeklyStatusPage({ focus }: WeeklyStatusPageProps) {
    const [selectedDate, setSelectedDate] = useState<string>(dateOnlyTodayLocal);
    const [note, setNote] = useState<WeeklyNote | null>(null); // { id, week_start, content, updated_at }
    const [content, setContent] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [saving, setSaving] = useState<boolean>(false);
    const [dirty, setDirty] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

    const weekStart = String(note?.week_start || '').trim();
    const weekEnd = useMemo(() => (weekStart ? weekEndFromStart(weekStart) : ''), [weekStart]);

    useEffect(() => {
        const next = String(focus?.date || '').trim();
        if (!next) return;
        setSelectedDate(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focus?.nonce]);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            setLoading(true);
            setError(null);
            try {
                const row = await api.getWeeklyNote(selectedDate);
                if (cancelled) return;
                setNote(row || null);
                setContent(String(row?.content || ''));
                setDirty(false);
                setLastSavedAt(row?.updated_at ? new Date(row.updated_at) : null);
            } catch (err) {
                if (cancelled) return;
                setNote(null);
                setContent('');
                setDirty(false);
                setError('Failed to load weekly note');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [selectedDate]);

    const save = async () => {
        if (!note?.id) return;
        if (!dirty) return;
        setSaving(true);
        setError(null);
        try {
            const result = await api.updateWeeklyNote(note.id, content);
            const updated = result.note;
            setNote(updated || note);
            setDirty(false);
            setLastSavedAt(updated?.updated_at ? new Date(updated.updated_at) : new Date());
        } catch (err) {
            setError('Failed to save');
        } finally {
            setSaving(false);
        }
    };

    // Debounced auto-save while typing.
    useEffect(() => {
        if (!note?.id) return;
        if (!dirty) return;
        const handle = window.setTimeout(() => {
            save();
        }, 1200);
        return () => window.clearTimeout(handle);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [content, dirty, note?.id]);

    return (
        <div className="page weekly-page">
            <header className="page-header weekly-header">
                <div style={{ minWidth: 0 }}>
                    <h2>Weekly Status</h2>
                    <div className="muted" style={{ marginTop: 4 }}>
                        {weekStart ? (
                            <>
                                Week of {weekStart} → {weekEnd}
                                {dirty ? ' • Unsaved changes' : ''}
                                {lastSavedAt && !dirty ? ` • Saved ${lastSavedAt.toLocaleString()}` : ''}
                            </>
                        ) : (
                            'Pick a date to view that week'
                        )}
                    </div>
                </div>

                <div className="controls weekly-controls">
                    <button
                        type="button"
                        className="icon-btn"
                        title="Previous week"
                        aria-label="Previous week"
                        onClick={() => setSelectedDate((d) => addDays(d, -7))}
                    >
                        ◀
                    </button>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        aria-label="Pick a date in the week"
                    />
                    <button
                        type="button"
                        className="icon-btn"
                        title="Next week"
                        aria-label="Next week"
                        onClick={() => setSelectedDate((d) => addDays(d, 7))}
                    >
                        ▶
                    </button>
                    <button
                        type="button"
                        className="primary-btn"
                        onClick={save}
                        disabled={!note?.id || !dirty || saving}
                        title={dirty ? 'Save (Ctrl+S)' : 'Saved'}
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </header>

            {error ? <div className="muted" style={{ color: '#f38ba8', marginBottom: 8 }}>{error}</div> : null}

            <div className="note-editor-wrapper weekly-editor-wrapper">
                {loading ? (
                    <div className="notes-empty-state">
                        <div className="notes-empty-icon" aria-hidden="true">
                            📅
                        </div>
                        <p>Loading weekly status…</p>
                    </div>
                ) : (
                    <TiptapEditor
                        content={content}
                        onChange={(html) => {
                            setContent(html);
                            setDirty(true);
                        }}
                        onRequestSave={save}
                        placeholder="Write your weekly status…"
                    />
                )}
            </div>
        </div>
    );
}
