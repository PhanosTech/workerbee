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

export const toDateInputValue = (value: string | null | undefined): string => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const dateInputToIso = (value: string | null | undefined): string | null => {
    const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toISOString();
};
