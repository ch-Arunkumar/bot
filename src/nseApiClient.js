import axios from 'axios';
import { config } from './config.js';

/**
 * Custom Client to interact with local NSE API Server (http://127.0.0.1:3000)
 */
export class NseApiClient {
    constructor(baseUrl = config.nseApiBaseUrl, timeoutSeconds = config.timeoutSeconds) {
        this.client = axios.create({
            baseURL: baseUrl,
            timeout: timeoutSeconds * 1000,
            headers: {
                'Accept': 'application/json'
            }
        });
    }

    async executeWithRetry(apiFn, retries = 1, backoffMs = 500) {
        let lastErr = null;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await apiFn();
            } catch (err) {
                lastErr = err;
                // If it's a 404 (Stock not found), do not retry
                if (err.response?.status === 404) {
                    break;
                }
                if (attempt < retries) {
                    await new Promise(r => setTimeout(r, backoffMs * (attempt + 1)));
                }
            }
        }
        return {
            success: false,
            error: lastErr?.response?.data?.message || lastErr?.message || 'Network request failed'
        };
    }

    /**
     * Get Market Status (Open / Closed)
     */
    async getMarketStatus() {
        return this.executeWithRetry(async () => {
            const res = await this.client.get('/api/marketStatus');
            return { success: true, data: res.data };
        }, 1, 500);
    }

    /**
     * Get all symbols from NSE
     */
    async getAllStockSymbols() {
        return this.executeWithRetry(async () => {
            const res = await this.client.get('/api/equity/symbols');
            return { success: true, data: res.data };
        }, 1, 500);
    }

    /**
     * Get live equity details including priceInfo, securityInfo, etc.
     * GET /api/equity/:symbol
     */
    async getEquity(symbol) {
        const clean = symbol.toUpperCase().trim();
        const res = await this.executeWithRetry(async () => {
            const r = await this.client.get(`/api/equity/${encodeURIComponent(clean)}`);
            return { success: true, symbol: clean, data: r.data };
        }, 1, 500);

        if (!res.success) {
            res.symbol = clean;
        }
        return res;
    }

    /**
     * Get live trade info
     * GET /api/equity/tradeInfo/:symbol
     */
    async getTradeInfo(symbol) {
        const clean = symbol.toUpperCase().trim();
        const res = await this.executeWithRetry(async () => {
            const r = await this.client.get(`/api/equity/tradeInfo/${encodeURIComponent(clean)}`);
            return { success: true, symbol: clean, data: r.data };
        }, 1, 500);

        if (!res.success) {
            res.symbol = clean;
        }
        return res;
    }

    /**
     * Get historical candles for symbol
     * GET /api/equity/historical/:symbol?dateStart=YYYY-MM-DD&dateEnd=YYYY-MM-DD
     */
    async getHistoricalData(symbol, dateStart, dateEnd) {
        const clean = symbol.toUpperCase().trim();
        let url = `/api/equity/historical/${encodeURIComponent(clean)}`;
        const params = {};
        if (dateStart) params.dateStart = dateStart;
        if (dateEnd) params.dateEnd = dateEnd;

        const res = await this.executeWithRetry(async () => {
            const r = await this.client.get(url, { params });
            return { success: true, symbol: clean, data: r.data };
        }, 1, 500);

        if (!res.success) {
            res.symbol = clean;
        }
        return res;
    }

}

export const defaultNseClient = new NseApiClient();
