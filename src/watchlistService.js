import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import { fileURLToPath } from 'url';
import { defaultNseClient } from './nseApiClient.js';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WatchlistService {
    constructor(client = defaultNseClient) {
        this.client = client;
        this.symbols = [];
        this.symbolMetadata = new Map(); // Symbol -> { stockName, close, pChange, volume }
        this.source = 'unknown';
        this.lastLoaded = null;
        this.stats = {
            totalRows: 0,
            validSymbols: 0,
            duplicateCount: 0,
            invalidCount: 0
        };
    }

    /**
     * Load symbols from:
     * 1. Excel (if WATCHLIST_SOURCE=excel and file exists)
     * 2. CSV fallback (EQUITY_L.csv)
     * 3. NSE API
     */
    async loadWatchlist() {
        const sourcePref = (config.watchlistSource || 'excel').toLowerCase();

        // 1. Try Excel Watchlist
        if (sourcePref === 'excel' || sourcePref === 'auto') {
            const excelFilePath = path.resolve(__dirname, '..', config.watchlistFile);
            if (fs.existsSync(excelFilePath)) {
                try {
                    const workbook = xlsx.readFile(excelFilePath);
                    const sheetName = config.watchlistSheet && workbook.Sheets[config.watchlistSheet]
                        ? config.watchlistSheet
                        : workbook.SheetNames[0];

                    const sheet = workbook.Sheets[sheetName];
                    const rows = xlsx.utils.sheet_to_json(sheet);

                    this.stats.totalRows = rows.length;
                    let validCount = 0;
                    let dupCount = 0;
                    let invalidCount = 0;

                    const uniqueSymbols = [];
                    const seen = new Set();
                    this.symbolMetadata.clear();

                    for (const row of rows) {
                        // Extract Symbol
                        const rawSym = row.Symbol || row.symbol || row['SYMBOL'];
                        if (!rawSym || typeof rawSym !== 'string' || !rawSym.trim()) {
                            invalidCount++;
                            continue;
                        }

                        const sym = rawSym.trim().toUpperCase();
                        if (seen.has(sym)) {
                            dupCount++;
                            continue;
                        }

                        seen.add(sym);
                        uniqueSymbols.push(sym);
                        validCount++;

                        // Preserve metadata from Excel
                        this.symbolMetadata.set(sym, {
                            stockName: row['Stock Name'] || row.stockName || sym,
                            close: parseFloat(row.close ?? row.Close ?? 0),
                            pChange: parseFloat(row['%_change'] ?? row.percentChange ?? 0),
                            volume: parseInt(row.volume ?? row.Volume ?? 0, 10),
                            sr: row['Sr.'] ?? null
                        });
                    }

                    this.stats.validSymbols = validCount;
                    this.stats.duplicateCount = dupCount;
                    this.stats.invalidCount = invalidCount;

                    let finalSymbols = uniqueSymbols;
                    if (config.maxSymbols > 0) {
                        finalSymbols = finalSymbols.slice(0, config.maxSymbols);
                    }

                    this.symbols = finalSymbols;
                    this.source = 'Excel';
                    this.lastLoaded = new Date();
                    console.log(`📋 [WATCHLIST] Loaded ${this.symbols.length} unique symbols from Excel (${excelFilePath}) [Total Rows: ${this.stats.totalRows}, Dups Removed: ${dupCount}, Invalid: ${invalidCount}]`);
                    return this.symbols;
                } catch (err) {
                    console.warn('⚠️ [WATCHLIST] Error reading Excel watchlist:', err.message);
                }
            }
        }

        // 2. Fallback to CSV dataset (EQUITY_L.csv)
        const csvPath = path.join(__dirname, '../data/EQUITY_L.csv');
        if (fs.existsSync(csvPath)) {
            try {
                const content = fs.readFileSync(csvPath, 'utf8');
                const lines = content.split('\n');
                const parsedSymbols = [];

                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;
                    const parts = line.split(',');
                    const sym = parts[0]?.trim();
                    const series = parts[2]?.trim();
                    if (sym && (series === 'EQ' || !series)) {
                        parsedSymbols.push(sym.toUpperCase());
                    }
                }

                if (parsedSymbols.length > 0) {
                    let finalSymbols = [...new Set(parsedSymbols)];
                    if (config.maxSymbols > 0) {
                        finalSymbols = finalSymbols.slice(0, config.maxSymbols);
                    }
                    this.symbols = finalSymbols;
                    this.source = 'CSV (EQUITY_L)';
                    this.lastLoaded = new Date();
                    console.log(`📋 [WATCHLIST] Fallback loaded ${this.symbols.length} symbols from EQUITY_L.csv`);
                    return this.symbols;
                }
            } catch (err) {
                console.warn('⚠️ [WATCHLIST] Error reading CSV:', err.message);
            }
        }

        // 3. Fallback to NSE API
        try {
            const res = await this.client.getAllStockSymbols();
            if (res.success && Array.isArray(res.data) && res.data.length > 0) {
                let syms = res.data.map(s => (typeof s === 'string' ? s.trim().toUpperCase() : s.symbol)).filter(Boolean);
                let finalSymbols = [...new Set(syms)];
                if (config.maxSymbols > 0) {
                    finalSymbols = finalSymbols.slice(0, config.maxSymbols);
                }
                this.symbols = finalSymbols;
                this.source = 'NSE API';
                this.lastLoaded = new Date();
                return this.symbols;
            }
        } catch (e) {
            // ignore
        }

        return this.symbols;
    }

    getSymbols() {
        return this.symbols;
    }

    getMetadata(symbol) {
        return this.symbolMetadata.get(symbol.toUpperCase().trim()) || null;
    }

    getSource() {
        return this.source;
    }

    getStats() {
        return {
            source: this.source,
            count: this.symbols.length,
            lastLoaded: this.lastLoaded,
            ...this.stats
        };
    }

    setSymbols(symbols) {
        if (Array.isArray(symbols)) {
            let syms = [...new Set(symbols.map(s => (typeof s === 'string' ? s.trim().toUpperCase() : s.symbol)).filter(Boolean))];
            if (config.maxSymbols > 0) {
                syms = syms.slice(0, config.maxSymbols);
            }
            this.symbols = syms;
            this.source = 'Custom API';
            this.lastLoaded = new Date();
        }
    }
}

export const defaultWatchlist = new WatchlistService();
