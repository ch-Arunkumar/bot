const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function parseNseDateToIso(str) {
    if (!str) return null;
    const parts = String(str).trim().split('-');
    if (parts.length === 3) {
        // e.g. "11-Sep-2026"
        const day = parts[0].padStart(2, '0');
        const mIdx = MONTHS.findIndex(m => m.toLowerCase() === parts[1].toLowerCase());
        const year = parts[2];
        if (mIdx !== -1) {
            const mStr = String(mIdx + 1).padStart(2, '0');
            return `${year}-${mStr}-${day}`;
        }
    }
    const d = new Date(str);
    return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : null;
}

/**
 * Find exact daily candle for a given target date (e.g., '2026-09-11' or '11-Sep-2026')
 */
export function findCandleForDate(candles, targetDateStr) {
    if (!candles || candles.length === 0 || !targetDateStr) return null;

    const targetIso = parseNseDateToIso(targetDateStr);

    for (const c of candles) {
        if (!c || !c.date) continue;
        const cIso = parseNseDateToIso(c.date);

        if (cIso && targetIso && cIso === targetIso) {
            return c;
        }

        // Direct case-insensitive string match fallback
        if (String(c.date).toLowerCase().includes(String(targetDateStr).toLowerCase())) {
            return c;
        }
    }

    return null;
}

