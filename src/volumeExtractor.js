/**
 * Helper to extract current-day live volume and open price from NSE /api/equity/:symbol
 * or /api/equity/tradeInfo/:symbol
 */

export function extractCurrentDayData(equityData, tradeInfoData = null) {
    if (!equityData) {
        return {
            open: 0,
            volume: 0,
            lastPrice: 0,
            stockName: '',
            tradingDate: ''
        };
    }

    const priceInfo = equityData.priceInfo || {};
    const securityInfo = equityData.securityInfo || {};
    const info = equityData.info || {};
    const preOpenMarket = equityData.preOpenMarket || {};

    // 1. Daily Open
    const open = parseFloat(priceInfo.open ?? preOpenMarket.finalPrice ?? 0);

    // 2. Cumulative Day Volume (Intraday cumulative volume, NOT pre-open volume)
    // In NSE API, cumulative volume can be found in:
    // - tradeInfo.marketDeptOrderBook.tradeInfo.totalTradedVolume
    // - priceInfo.totalTradedVolume
    // - securityInfo.issuedSize or trade volume indicators
    // - preOpenMarket.totalTradedVolume is only pre-open, so we prefer the complete day quantity
    let volume = 0;

    if (tradeInfoData && tradeInfoData.marketDeptOrderBook?.tradeInfo?.totalTradedVolume) {
        volume = parseInt(tradeInfoData.marketDeptOrderBook.tradeInfo.totalTradedVolume, 10);
    } else if (equityData.tradeInfo?.marketDeptOrderBook?.tradeInfo?.totalTradedVolume) {
        volume = parseInt(equityData.tradeInfo.marketDeptOrderBook.tradeInfo.totalTradedVolume, 10);
    } else if (priceInfo.totalTradedVolume) {
        volume = parseInt(priceInfo.totalTradedVolume, 10);
    } else if (equityData.securityWiseTradeInfo?.quantityTraded) {
        volume = parseInt(equityData.securityWiseTradeInfo.quantityTraded, 10);
    } else if (priceInfo.intraDayHighLow?.max) {
        // fallback to standard traded volume if available in quote payload
        volume = parseInt(equityData.totalTradedVolume ?? 0, 10);
    }

    const lastPrice = parseFloat(priceInfo.lastPrice ?? 0);
    const stockName = info.companyName || equityData.symbol || '';
    const tradingDate = equityData.metadata?.lastUpdateTime || new Date().toISOString().split('T')[0];

    return {
        open,
        volume,
        lastPrice,
        stockName,
        tradingDate,
        dayHigh: parseFloat(priceInfo.intraDayHighLow?.max ?? 0),
        dayLow: parseFloat(priceInfo.intraDayHighLow?.min ?? 0)
    };
}
