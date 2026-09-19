/**
 * Historical Data Parser for NSE API
 *
 * Fields in raw NSE Historical response:
 * chSymbol, chOpeningPrice, chTradeHighPrice, chTradeLowPrice,
 * chClosingPrice, chPreviousClsPrice, chTotTradedQty, chTotTradedVal,
 * chTotalTrades, vwap, mtimestamp
 */

export function parseHistoricalRow(row) {
    if (!row) return null;

    const open = parseFloat(row.chOpeningPrice ?? row.OPEN ?? row.open ?? 0);
    const high = parseFloat(row.chTradeHighPrice ?? row.HIGH ?? row.high ?? 0);
    const low = parseFloat(row.chTradeLowPrice ?? row.LOW ?? row.low ?? 0);
    const close = parseFloat(row.chClosingPrice ?? row.CLOSE ?? row.close ?? 0);
    const prevClose = parseFloat(row.chPreviousClsPrice ?? row.PREVCLOSE ?? row.previousClose ?? 0);
    const volume = parseInt(row.chTotTradedQty ?? row.VOLUME ?? row.totTradedQty ?? row.volume ?? 0, 10);
    const totalTrades = parseInt(row.chTotalTrades ?? row.trades ?? 0, 10);
    const totalVal = parseFloat(row.chTotTradedVal ?? row.totalTradedValue ?? 0);
    const vwap = parseFloat(row.vwap ?? row.VWAP ?? 0);

    // parse timestamp or date string
    const dateStr = row.mtimestamp || row.TIMESTAMP || row.CH_TIMESTAMP || row.date || '';

    return {
        symbol: row.chSymbol || row.symbol,
        open,
        high,
        low,
        close,
        prevClose,
        volume,
        totalTrades,
        totalVal,
        vwap,
        date: dateStr,
        raw: row
    };
}

export function parseHistoricalList(rawData) {
    if (!rawData) return [];
    let list = [];
    if (Array.isArray(rawData)) {
        if (rawData.length > 0 && Array.isArray(rawData[0]?.data)) {
            list = rawData[0].data;
        } else {
            list = rawData;
        }
    } else if (Array.isArray(rawData.data)) {
        list = rawData.data;
    } else if (Array.isArray(rawData.items)) {
        list = rawData.items;
    } else if (Array.isArray(rawData.value) && Array.isArray(rawData.value[0]?.data)) {
        list = rawData.value[0].data;
    }
    return list.map(parseHistoricalRow).filter(item => item !== null && !isNaN(item.open) && item.date);
}

/**
 * Chartink expression semantics for `12 months ago high` have not yet been independently verified.
 * This implementation uses the historical daily candle approximately 12 months before the reference trading date.
 * (Isolated behind this dedicated function so it can be changed later without rewriting the scanner).
 */
export function getTwelveMonthsAgoHigh(parsedCandles, referenceDate = new Date()) {
    return extract12MonthsAgoHigh(parsedCandles, referenceDate);
}

export function extract12MonthsAgoHigh(parsedCandles, referenceDate = new Date()) {
    if (!parsedCandles || parsedCandles.length === 0) return null;

    // Target date 12 months ago (approx 365 days)
    const targetDate = new Date(referenceDate.getTime());
    targetDate.setFullYear(targetDate.getFullYear() - 1);

    // Sort candles chronologically
    const sorted = [...parsedCandles].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Find the candle on or closest before the 12-month ago target date
    let closestCandle = null;
    let minDiff = Infinity;

    for (const candle of sorted) {
        const cDate = new Date(candle.date);
        const diff = Math.abs(cDate.getTime() - targetDate.getTime());

        // We accept candles within a 15-day window around 12 months ago
        const daysDiff = diff / (1000 * 60 * 60 * 24);
        if (daysDiff <= 15 && diff < minDiff) {
            minDiff = diff;
            closestCandle = candle;
        }
    }

    // Fallback: If exact window not found, take the oldest available candle if it's ~12 months old
    if (!closestCandle && sorted.length > 0) {
        const oldest = sorted[0];
        const oldestDate = new Date(oldest.date);
        const daysAgo = (referenceDate.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysAgo >= 300) {
            closestCandle = oldest;
        }
    }

    if (closestCandle) {
        return {
            referenceHigh: closestCandle.high,
            referenceDate: closestCandle.date,
            referenceVolume: closestCandle.volume,
            candle: closestCandle
        };
    }

    return null;
}
