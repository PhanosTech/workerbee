export const htmlToPlainText = (html: string | null | undefined): string =>
    String(html || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

export const escapeHtml = (text: string): string =>
    String(text || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

export const normalizeNoteContent = (content: string | null | undefined): string => {
    const trimmed = String(content || '').trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('<')) return String(content || '');
    return `<p>${escapeHtml(trimmed).replaceAll('\n', '<br />')}</p>`;
};

export const isEmptyHtml = (html: string | null | undefined): boolean =>
    htmlToPlainText(html).length === 0;

export const formatDateTime = (value: string | null | undefined): string => {
    if (!value) return 'No date';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'No date';
    return date.toLocaleString();
};
