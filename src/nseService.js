import { NseIndia } from 'stock-nse-india';

const nseIndia = new NseIndia();

/**
 * Get current NSE market status (open/closed, timing, etc.)
 */
export async function getMarketStatus() {
    try {
        const status = await nseIndia.getDataByEndpoint('/api/marketStatus');
        return { success: true, data: status };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get all available equity stock symbols on NSE
 */
export async function getAllSymbols() {
    try {
        const symbols = await nseIndia.getAllStockSymbols();
        return { success: true, count: symbols.length, data: symbols };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get detailed equity quote for a given symbol (e.g., 'RELIANCE', 'TCS', 'HDFCBANK')
 */
export async function getEquityQuote(symbol) {
    try {
        const cleanSymbol = symbol.toUpperCase().trim();
        const details = await nseIndia.getEquityDetails(cleanSymbol);
        let tradeInfo = null;
        try {
            tradeInfo = await nseIndia.getEquityTradeInfo(cleanSymbol);
        } catch {
            // tradeInfo might not always be accessible for some symbols
        }

        return {
            success: true,
            symbol: cleanSymbol,
            info: details?.info || {},
            metadata: details?.metadata || {},
            priceInfo: details?.priceInfo || {},
            securityInfo: details?.securityInfo || {},
            tradeInfo: tradeInfo || null
        };
    } catch (error) {
        return { success: false, symbol, error: error.message };
    }
}

/**
 * Get list of Major Indices with live prices (e.g. NIFTY 50, NIFTY BANK)
 */
export async function getAllIndices() {
    try {
        const indices = await nseIndia.getDataByEndpoint('/api/allIndices');
        return { success: true, data: indices?.data || [] };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get Gainers & Losers from an index (e.g., 'NIFTY 50', 'NIFTY BANK', 'NIFTY AUTO')
 */
export async function getGainersAndLosers(indexSymbol = 'NIFTY 50') {
    try {
        const data = await nseIndia.getDataByEndpoint(`/api/equity-stockIndices?index=${encodeURIComponent(indexSymbol)}`);
        
        if (data && data.data) {
            const stocks = data.data.filter(item => item.symbol && item.symbol !== indexSymbol);
            const sortedByChange = [...stocks].sort((a, b) => (b.pChange || 0) - (a.pChange || 0));

            return {
                success: true,
                index: indexSymbol,
                gainers: sortedByChange.slice(0, 5),
                losers: sortedByChange.slice(-5).reverse()
            };
        }
        return { success: false, error: 'No index data found' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get Historical price data for an equity symbol
 */
export async function getHistorical(symbol, days = 30) {
    try {
        const cleanSymbol = symbol.toUpperCase().trim();
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days);

        const range = {
            start: startDate,
            end: endDate
        };

        const data = await nseIndia.getEquityHistoricalData(cleanSymbol, range);
        return { success: true, symbol: cleanSymbol, range, data };
    } catch (error) {
        return { success: false, symbol, error: error.message };
    }
}

export default {
    getMarketStatus,
    getAllSymbols,
    getEquityQuote,
    getAllIndices,
    getGainersAndLosers,
    getHistorical
};
