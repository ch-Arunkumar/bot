import { defaultNseClient } from './nseApiClient.js';
import { parseHistoricalList, extract12MonthsAgoHigh } from './historicalParser.js';

export class HistoricalCacheService {
    constructor(client = defaultNseClient) {
        this.client = client;
        this.cache = new Map(); // symbol -> { referenceHigh, referenceDate, fetchedDate, ttl }
        this.ttlMs = 24 * 60 * 60 * 1000; // 24 hours
    }

    getCacheKey(symbol) {
        return symbol.toUpperCase().trim();
    }

    hasValidCache(symbol, todayStr) {
        const key = this.getCacheKey(symbol);
        const cached = this.cache.get(key);
        if (!cached) return false;
        if (cached.fetchedTradingDate !== todayStr) return false;
        if (Date.now() - cached.timestamp > this.ttlMs) return false;
        return true;
    }

    getCachedReference(symbol) {
        const key = this.getCacheKey(symbol);
        return this.cache.get(key) || null;
    }

    setCachedReference(symbol, data, tradingDate) {
        const key = this.getCacheKey(symbol);
        this.cache.set(key, {
            ...data,
            fetchedTradingDate: tradingDate,
            timestamp: Date.now()
        });
    }

    /**
     * Get or fetch 12 months ago reference for a symbol
     */
    async get12MonthsAgoReference(symbol, currentDate = new Date()) {
        const key = this.getCacheKey(symbol);
        const todayStr = currentDate.toISOString().split('T')[0];

        if (this.hasValidCache(key, todayStr)) {
            return {
                success: true,
                fromCache: true,
                data: this.getCachedReference(key)
            };
        }

        // Calculate date window 12 months ago (fetch 380 days ago to 340 days ago)
        const targetDate = new Date(currentDate.getTime());
        targetDate.setFullYear(targetDate.getFullYear() - 1);

        const startWindow = new Date(targetDate.getTime());
        startWindow.setDate(startWindow.getDate() - 20);

        const endWindow = new Date(targetDate.getTime());
        endWindow.setDate(endWindow.getDate() + 20);

        const dateStart = startWindow.toISOString().split('T')[0];
        const dateEnd = endWindow.toISOString().split('T')[0];

        const res = await this.client.getHistoricalData(key, dateStart, dateEnd);
        if (!res.success) {
            return {
                success: false,
                symbol: key,
                error: res.error
            };
        }

        const candles = parseHistoricalList(res.data);
        const ref = extract12MonthsAgoHigh(candles, currentDate);

        if (!ref) {
            return {
                success: false,
                symbol: key,
                error: `No candle found near 12 months ago (${dateStart} to ${dateEnd})`
            };
        }

        this.setCachedReference(key, ref, todayStr);

        return {
            success: true,
            fromCache: false,
            data: ref
        };
    }

    clearCache() {
        this.cache.clear();
    }
}

export const defaultHistoryCache = new HistoricalCacheService();
