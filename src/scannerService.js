import pLimit from 'p-limit';
import { defaultNseClient } from './nseApiClient.js';
import { defaultHistoryCache } from './historyCache.js';
import { extractCurrentDayData } from './volumeExtractor.js';
import { evaluateVolumeBreakoutRule, RULE_NAME } from './scannerRule.js';
import { parseHistoricalList } from './historicalParser.js';
import { findCandleForDate } from './historicalDateMatcher.js';
import { defaultSignalManager } from './signalManager.js';
import { defaultWatchlist } from './watchlistService.js';
import { defaultAlertDispatcher } from './alertDispatcher.js';
import { defaultValidationManager } from './validationManager.js';
import { config } from './config.js';

export class ScannerService {
    constructor({
        client = defaultNseClient,
        historyCache = defaultHistoryCache,
        signalManager = defaultSignalManager,
        watchlist = defaultWatchlist,
        alertDispatcher = defaultAlertDispatcher,
        validationManager = defaultValidationManager,
        intervalSeconds = config.scannerIntervalSeconds,
        concurrency = config.concurrency
    } = {}) {
        this.client = client;
        this.historyCache = historyCache;
        this.signalManager = signalManager;
        this.watchlist = watchlist;
        this.alertDispatcher = alertDispatcher;
        this.validationManager = validationManager;
        this.intervalSeconds = intervalSeconds;
        this.concurrency = concurrency;

        this.enabled = config.scannerEnabled;
        this.running = false;
        this.timer = null;
        this.isScanning = false;

        this.lastScanAt = null;
        this.lastSuccessAt = null;
        this.lastError = null;
        this.symbolsScanned = 0;
        this.signalsFound = 0;
        this.marketStatus = 'UNKNOWN';
        this.nextScanAt = null;
    }

    async updateMarketStatus() {
        try {
            const res = await this.client.getMarketStatus();
            if (res.success && res.data?.marketState) {
                const capitalMarket = res.data.marketState.find(m => m.market === 'Capital Market') || res.data.marketState[0];
                this.marketStatus = capitalMarket.marketStatus || 'UNKNOWN';
            } else {
                this.marketStatus = 'CLOSED';
            }
        } catch {
            this.marketStatus = 'UNAVAILABLE';
        }
        return this.marketStatus;
    }

    async scanSymbol(symbol) {
        try {
            // 1. Fetch live quote
            const eqRes = await this.client.getEquity(symbol);
            if (!eqRes.success) {
                const errResult = { success: false, symbol, error: eqRes.error || 'Quote fetch failed' };
                this.validationManager.recordResult({ symbol, error: eqRes.error });
                return errResult;
            }

            // 2. Extract current day data
            const dayData = extractCurrentDayData(eqRes.data);

            // 3. Obtain cached 12 months ago reference high
            const refRes = await this.historyCache.get12MonthsAgoReference(symbol);
            if (!refRes.success) {
                const errResult = { success: false, symbol, error: refRes.error || '12M Reference fetch failed' };
                this.validationManager.recordResult({
                    symbol,
                    stockName: dayData.stockName,
                    dayData,
                    error: refRes.error
                });
                return errResult;
            }

            const referenceHigh = refRes.data.referenceHigh;

            // 4. Evaluate Scanner Rule: Abs(Daily Open) > 100 AND daily volume > 12 months ago high
            const evaluation = evaluateVolumeBreakoutRule({
                dailyOpen: dayData.open,
                dailyVolume: dayData.volume,
                referenceHigh: referenceHigh
            });

            const meta = this.watchlist.getMetadata(symbol);
            const resolvedStockName = dayData.stockName || meta?.stockName || symbol;

            if (evaluation.matched) {
                const signal = this.signalManager.addSignal({
                    symbol,
                    stockName: resolvedStockName,
                    tradingDate: dayData.tradingDate,
                    dailyOpen: dayData.open,
                    dailyVolume: dayData.volume,
                    referenceHigh: referenceHigh,
                    ruleName: RULE_NAME
                });

                if (signal) {
                    this.signalsFound++;
                    await this.alertDispatcher.dispatch(signal);
                }
            }

            // Record into Validation Manager
            this.validationManager.recordResult({
                symbol,
                stockName: resolvedStockName,
                dayData,
                referenceHigh,
                evaluation
            });

            return {
                success: true,
                symbol,
                matched: evaluation.matched,
                evaluation,
                dayData,
                referenceHigh
            };
        } catch (err) {
            this.validationManager.recordResult({ symbol, error: err.message });
            return { success: false, symbol, error: err.message };
        }
    }

    /**
     * Historical Validation for a single symbol against a specific historical trading date
     */
    async validateHistoricalSymbol(symbol, targetDateStr) {
        try {
            const targetDate = new Date(targetDateStr);
            if (isNaN(targetDate.getTime())) {
                const err = `Invalid validation date: ${targetDateStr}`;
                this.validationManager.recordResult({ symbol, error: err, validationDate: targetDateStr });
                return { success: false, symbol, error: err };
            }

            // Fetch target date candle window (+/- 5 days)
            const winStart = new Date(targetDate.getTime() - 7 * 86400000).toISOString().split('T')[0];
            const winEnd = new Date(targetDate.getTime() + 7 * 86400000).toISOString().split('T')[0];

            const histRes = await this.client.getHistoricalData(symbol, winStart, winEnd);
            if (!histRes.success) {
                this.validationManager.recordResult({ symbol, error: histRes.error, validationDate: targetDateStr });
                return { success: false, symbol, error: histRes.error };
            }

            const candles = parseHistoricalList(histRes.data);
            const targetCandle = findCandleForDate(candles, targetDateStr);

            if (!targetCandle) {
                const err = `Missing historical daily candle on ${targetDateStr}`;
                this.validationManager.recordResult({ symbol, error: err, validationDate: targetDateStr });
                return { success: false, symbol, error: err };
            }

            // Extract daily data from historical candle
            const dayData = {
                open: targetCandle.open,
                high: targetCandle.high,
                low: targetCandle.low,
                close: targetCandle.close,
                volume: targetCandle.volume,
                tradingDate: targetCandle.date,
                stockName: targetCandle.symbol
            };

            // Fetch 12 months ago reference relative to the historical target date
            const refRes = await this.historyCache.get12MonthsAgoReference(symbol, targetDate);
            if (!refRes.success) {
                this.validationManager.recordResult({
                    symbol,
                    stockName: dayData.stockName,
                    dayData,
                    error: refRes.error,
                    validationDate: targetDateStr
                });
                return { success: false, symbol, error: refRes.error };
            }

            const referenceHigh = refRes.data.referenceHigh;

            // Evaluate Rule: Abs(Daily Open) > 100 AND Daily Volume > 12 Months Ago High
            const evaluation = evaluateVolumeBreakoutRule({
                dailyOpen: dayData.open,
                dailyVolume: dayData.volume,
                referenceHigh: referenceHigh
            });

            const meta = this.watchlist.getMetadata(symbol);
            const resolvedStockName = meta?.stockName || dayData.stockName || symbol;

            this.validationManager.recordResult({
                symbol,
                stockName: resolvedStockName,
                dayData,
                referenceHigh,
                evaluation,
                validationDate: targetDateStr
            });

            return {
                success: true,
                symbol,
                matched: evaluation.matched,
                evaluation,
                dayData,
                referenceHigh
            };
        } catch (err) {
            this.validationManager.recordResult({ symbol, error: err.message, validationDate: targetDateStr });
            return { success: false, symbol, error: err.message };
        }
    }

    /**
     * Run complete historical validation against a specified date across all watchlist symbols
     */
    async runHistoricalValidation(targetDateStr = '2026-09-11') {
        if (this.isScanning) {
            console.log('⏳ Another scan is currently in progress...');
            return this.validationManager.getSummary();
        }

        this.isScanning = true;
        this.lastScanAt = new Date().toISOString();
        this.lastError = null;

        try {
            let symbols = this.watchlist.getSymbols();
            if (symbols === null || symbols === undefined || (symbols.length === 0 && !this.watchlist.lastLoaded)) {
                symbols = await this.watchlist.loadWatchlist();
            }

            console.log(`\n🔍 [HISTORICAL VALIDATION] Starting validation for ${symbols.length} symbols on date: ${targetDateStr} (Concurrency: ${this.concurrency})...`);
            this.validationManager.startValidation(symbols.length, targetDateStr);

            const limit = pLimit(this.concurrency);
            let count = 0;

            const promises = symbols.map(symbol =>
                limit(async () => {
                    const result = await this.validateHistoricalSymbol(symbol, targetDateStr);
                    count++;
                    if (count % 100 === 0 || count === symbols.length) {
                        console.log(`⏳ [HISTORICAL VALIDATION] Processed ${count} / ${symbols.length} symbols...`);
                    }
                    return result;
                })
            );

            const results = await Promise.all(promises);
            this.symbolsScanned = count;
            this.lastSuccessAt = new Date().toISOString();

            const summary = this.validationManager.finishValidation();
            const matchedCount = results.filter(r => r && r.matched).length;
            console.log(`✅ [HISTORICAL VALIDATION] Completed for ${targetDateStr}. Scanned: ${count}, Matches: ${matchedCount}, Duration: ${summary.scanDurationFormatted}`);
            return summary;
        } catch (err) {
            this.lastError = err.message;
            console.error('❌ [HISTORICAL VALIDATION ERROR]', err.message);
            throw err;
        } finally {
            this.isScanning = false;
        }
    }

    async runScan() {
        if (this.isScanning) {
            console.log('⏳ Scan already in progress, skipping iteration...');
            return;
        }

        this.isScanning = true;
        this.lastScanAt = new Date().toISOString();
        this.lastError = null;

        try {
            await this.updateMarketStatus();

            let symbols = this.watchlist.getSymbols();
            if (symbols === null || symbols === undefined || (symbols.length === 0 && !this.watchlist.lastLoaded)) {
                symbols = await this.watchlist.loadWatchlist();
            }

            console.log(`\n🔍 [SCANNER] Starting scan of ${symbols.length} symbols (Concurrency: ${this.concurrency})...`);
            this.validationManager.startValidation(symbols.length);

            const limit = pLimit(this.concurrency);
            let count = 0;

            const promises = symbols.map(symbol =>
                limit(async () => {
                    if (!this.running && !this.enabled) {
                        return null;
                    }
                    const result = await this.scanSymbol(symbol);
                    count++;
                    if (count % 200 === 0 || count === symbols.length) {
                        console.log(`⏳ [SCANNER PROGRESS] Processed ${count} / ${symbols.length} symbols...`);
                    }
                    return result;
                })
            );

            const results = await Promise.all(promises);
            this.symbolsScanned = count;
            this.lastSuccessAt = new Date().toISOString();

            if (this.running || this.enabled) {
                this.validationManager.finishValidation();
            }

            const matchedCount = results.filter(r => r && r.matched).length;
            console.log(`✅ [SCANNER] Completed scan. Scanned: ${count}, Matches: ${matchedCount}, Duration: ${this.validationManager.getSummary().scan_duration}`);
        } catch (err) {
            this.lastError = err.message;
            console.error('❌ [SCANNER ERROR]', err.message);
        } finally {
            this.isScanning = false;
            if (this.running) {
                this.scheduleNextScan();
            }
        }
    }

    scheduleNextScan() {
        if (this.timer) clearTimeout(this.timer);
        const intervalMs = this.intervalSeconds * 1000;
        this.nextScanAt = new Date(Date.now() + intervalMs).toISOString();
        this.timer = setTimeout(() => {
            if (this.running) {
                this.runScan();
            }
        }, intervalMs);
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.enabled = true;
        console.log(`▶️ Scanner started. Interval: ${this.intervalSeconds}s`);
        this.runScan();
    }

    stop() {
        this.running = false;
        this.enabled = false;
        this.isScanning = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.nextScanAt = null;
        console.log('⏹️ Scanner stopped. (Backend remains online)');
    }

    getStatus() {
        return {
            enabled: this.enabled,
            running: this.running,
            is_scanning: this.isScanning,
            interval_seconds: this.intervalSeconds,
            concurrency: this.concurrency,
            last_scan_at: this.lastScanAt,
            last_success_at: this.lastSuccessAt,
            last_error: this.lastError,
            symbols_scanned: this.symbolsScanned,
            signals_found: this.signalManager.getSignals().length,
            market_status: this.marketStatus,
            next_scan_at: this.nextScanAt
        };
    }
}

export const defaultScanner = new ScannerService();

