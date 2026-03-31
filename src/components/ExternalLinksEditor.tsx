import React from 'react';
import type { ExternalLink } from '../api';
import { MAX_EXTERNAL_LINKS, getExternalLinkLabel, openExternalUrl } from '../utils/linkUtils';

interface ExternalLinksEditorProps {
    links?: ExternalLink[];
    onChange: (links: ExternalLink[]) => void;
}

const ExternalLinksEditor: React.FC<ExternalLinksEditorProps> = ({ links = [], onChange }) => {
    const drafts = Array.isArray(links) ? links.slice(0, MAX_EXTERNAL_LINKS) : [];

    const handleChange = (index: number, field: keyof ExternalLink, value: string) => {
        const next = drafts.slice();
        next[index] = {
            label: field === 'label' ? value : String(next[index]?.label || ''),
            url: field === 'url' ? value : String(next[index]?.url || ''),
        };
        onChange(next);
    };

    const handleAdd = () => {
        if (drafts.length >= MAX_EXTERNAL_LINKS) return;
        onChange([...drafts, { label: '', url: '' }]);
    };

    const handleRemove = (index: number) => {
        onChange(drafts.filter((_, draftIndex) => draftIndex !== index));
    };

    return (
        <div className="external-links-editor">
            {drafts.length > 0 ? (
                <div className="external-links-list">
                    {drafts.map((link, index) => (
                        <div key={index} className="external-link-row">
                            <div className="external-link-grid">
                                <input
                                    type="text"
                                    value={link.label || ''}
                                    onChange={(e) => handleChange(index, 'label', e.target.value)}
                                    placeholder={`Label ${index + 1}`}
                                />
                                <input
                                    type="text"
                                    value={link.url || ''}
                                    onChange={(e) => handleChange(index, 'url', e.target.value)}
                                    placeholder="https://example.com"
                                />
                            </div>
                            <div className="external-link-actions">
                                <button
                                    type="button"
                                    className="link-btn"
                                    disabled={!String(link.url || '').trim()}
                                    onClick={() => openExternalUrl(link.url)}
                                    title={`Open ${getExternalLinkLabel(link, `Link ${index + 1}`)}`}
                                >
                                    Open
                                </button>
                                <button
                                    type="button"
                                    className="link-btn danger-link"
                                    onClick={() => handleRemove(index)}
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="muted" style={{ fontSize: '0.82rem' }}>
                    No links added yet.
                </div>
            )}

            <div className="external-links-footer">
                <button type="button" onClick={handleAdd} disabled={drafts.length >= MAX_EXTERNAL_LINKS}>
                    + Add Link
                </button>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                    Up to {MAX_EXTERNAL_LINKS}. Short labels work best for quick tags.
                </div>
            </div>
        </div>
    );
};

export default ExternalLinksEditor;
