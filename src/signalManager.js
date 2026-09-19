export class SignalManager {
    constructor() {
        this.signals = []; // Array of recent signals
        this.seenSignals = new Set(); // deduplication set: `${symbol}_${tradingDate}_${ruleName}`
    }

    createSignalKey(symbol, tradingDate, ruleName) {
        const cleanSymbol = symbol.toUpperCase().trim();
        const dateStr = tradingDate ? tradingDate.split('T')[0] : new Date().toISOString().split('T')[0];
        return `${cleanSymbol}_${dateStr}_${ruleName}`;
    }

    isDuplicate(symbol, tradingDate, ruleName) {
        const key = this.createSignalKey(symbol, tradingDate, ruleName);
        return this.seenSignals.has(key);
    }

    addSignal({ symbol, stockName, tradingDate, dailyOpen, dailyVolume, referenceHigh, ruleName }) {
        const key = this.createSignalKey(symbol, tradingDate, ruleName);
        if (this.seenSignals.has(key)) {
            return null; // Suppress duplicate
        }

        const signal = {
            id: `SIG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            symbol: symbol.toUpperCase().trim(),
            stock_name: stockName || symbol,
            timestamp: new Date().toISOString(),
            trading_date: tradingDate || new Date().toISOString().split('T')[0],
            daily_open: dailyOpen,
            current_or_daily_volume: dailyVolume,
            reference_high: referenceHigh,
            rule_name: ruleName,
            rule_status: 'TRIGGERED'
        };

        this.seenSignals.add(key);
        this.signals.unshift(signal);

        // Keep maximum 500 recent signals in memory
        if (this.signals.length > 500) {
            this.signals.pop();
        }

        return signal;
    }

    getSignals() {
        return this.signals;
    }

    clear() {
        this.signals = [];
        this.seenSignals.clear();
    }
}

export const defaultSignalManager = new SignalManager();
