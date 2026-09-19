import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defaultWatchlist } from './watchlistService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ValidationManager {
    constructor() {
        this.results = [];
        this.validationDate = null;
        this.isHistorical = false;
        this.summary = {
            validationDate: null,
            totalSymbols: 0,
            symbolsProcessed: 0,
            successfulCount: 0,
            errorCount: 0,
            signalsFound: 0,
            scanDurationMs: 0,
            scanDurationFormatted: '0s',
            startTime: null,
            endTime: null,
            comparison: {
                totalExcelSymbols: 0,
                totalScannerSymbols: 0,
                intersection: 0,
                excelOnly: 0,
                scannerOnly: 0,
                intersectionPercentage: '0.00%'
            }
        };
        this.validationFilePath = path.resolve(__dirname, '../data/scanner-validation.csv');
    }

    startValidation(total, validationDate = null) {
        this.results = [];
        this.validationDate = validationDate;
        this.isHistorical = !!validationDate;
        this.summary.validationDate = validationDate;
        this.summary.totalSymbols = total;
        this.summary.symbolsProcessed = 0;
        this.summary.successfulCount = 0;
        this.summary.errorCount = 0;
        this.summary.signalsFound = 0;
        this.summary.startTime = new Date();
        this.summary.endTime = null;
        this.summary.scanDurationMs = 0;
    }

    recordResult({ symbol, stockName, dayData, referenceHigh, evaluation, error, validationDate = null }) {
        const meta = defaultWatchlist.getMetadata(symbol) || {};

        const openVal = dayData?.open ?? 0;
        const volumeVal = dayData?.volume ?? 0;
        const refHighVal = referenceHigh ?? 0;

        const openCondition = evaluation?.condition1?.passed ? 'PASS' : 'FAIL';
        const volumeCondition = evaluation?.condition2?.passed ? 'PASS' : 'FAIL';
        const finalSignal = evaluation?.matched ? 'TRIGGERED' : 'NO_SIGNAL';

        // Determine comparison result: MATCH | EXCEL_ONLY | SCANNER_ONLY | ERROR
        let comparisonResult = 'MATCH';
        const inExcel = !!meta.stockName;
        const triggered = evaluation?.matched;

        if (error) {
            comparisonResult = 'ERROR';
        } else if (inExcel && triggered) {
            comparisonResult = 'MATCH';
        } else if (inExcel && !triggered) {
            comparisonResult = 'EXCEL_ONLY';
        } else if (!inExcel && triggered) {
            comparisonResult = 'SCANNER_ONLY';
        }

        const row = {
            symbol,
            stockName: stockName || meta.stockName || symbol,
            excelClose: meta.close ?? 'N/A',
            excelPChange: meta.pChange ?? 'N/A',
            excelVolume: meta.volume ?? 'N/A',
            historicalValidationDate: validationDate || this.validationDate || 'LIVE',
            dailyOpen: openVal,
            dailyVolume: volumeVal,
            twelveMonthsAgoHigh: refHighVal,
            openCondition,
            volumeCondition,
            finalSignal,
            comparisonResult,
            error: error || ''
        };

        this.results.push(row);
        this.summary.symbolsProcessed++;

        if (error) {
            this.summary.errorCount++;
        } else {
            this.summary.successfulCount++;
            if (evaluation?.matched) {
                this.summary.signalsFound++;
            }
        }

        // Export incrementally every 25 rows
        if (this.results.length % 25 === 0) {
            this.exportCsv();
        }
    }

    finishValidation() {
        this.summary.endTime = new Date();
        this.summary.scanDurationMs = this.summary.endTime.getTime() - (this.summary.startTime?.getTime() || Date.now());
        const seconds = (this.summary.scanDurationMs / 1000).toFixed(1);
        this.summary.scanDurationFormatted = `${seconds}s`;

        // Generate Comparison with Excel Snapshot
        const excelSymbols = defaultWatchlist.getSymbols();
        const triggeredSet = new Set(this.results.filter(r => r.finalSignal === 'TRIGGERED').map(r => r.symbol));
        const excelSet = new Set(excelSymbols);

        let intersection = 0;
        for (const sym of triggeredSet) {
            if (excelSet.has(sym)) intersection++;
        }

        const totalExcel = excelSet.size;
        const totalScanner = triggeredSet.size;
        const intersectionPct = totalExcel > 0 ? ((intersection / totalExcel) * 100).toFixed(2) + '%' : '0.00%';

        this.summary.comparison = {
            totalExcelSymbols: totalExcel,
            totalScannerSymbols: totalScanner,
            intersection,
            excelOnly: totalExcel - intersection,
            scannerOnly: totalScanner - intersection,
            intersectionPercentage: intersectionPct
        };

        // Write Final CSV Report
        this.exportCsv();
        return this.summary;
    }

    exportCsv() {
        try {
            const dataDir = path.dirname(this.validationFilePath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            const header = [
                'Symbol',
                'Stock Name',
                'Excel Close',
                'Excel % Change',
                'Excel Volume',
                'Historical Validation Date',
                'Daily Open',
                'Daily Volume',
                'Twelve Months Ago High',
                'Open Condition',
                'Volume Condition',
                'Final Signal',
                'Comparison Result',
                'Error'
            ].join(',');

            const csvRows = this.results.map(r => {
                const escapeCsv = (str) => `"${String(str).replace(/"/g, '""')}"`;
                return [
                    r.symbol,
                    escapeCsv(r.stockName),
                    r.excelClose,
                    r.excelPChange,
                    r.excelVolume,
                    r.historicalValidationDate,
                    r.dailyOpen,
                    r.dailyVolume,
                    r.twelveMonthsAgoHigh,
                    r.openCondition,
                    r.volumeCondition,
                    r.finalSignal,
                    r.comparisonResult,
                    escapeCsv(r.error)
                ].join(',');
            });

            const csvContent = [header, ...csvRows].join('\n');
            fs.writeFileSync(this.validationFilePath, csvContent, 'utf8');
        } catch (err) {
            console.error('❌ [VALIDATION] Error exporting validation CSV:', err.message);
        }
    }

    getSummary() {
        const sampleSignals = this.results.filter(r => r.finalSignal === 'TRIGGERED').slice(0, 10);
        
        // Compute live comparison dynamically
        const excelSymbols = defaultWatchlist.getSymbols();
        const triggeredSet = new Set(this.results.filter(r => r.finalSignal === 'TRIGGERED').map(r => r.symbol));
        const excelSet = new Set(excelSymbols);

        let intersection = 0;
        for (const sym of triggeredSet) {
            if (excelSet.has(sym)) intersection++;
        }

        const totalExcel = excelSet.size;
        const totalScanner = triggeredSet.size;
        const intersectionPct = totalExcel > 0 ? ((intersection / totalExcel) * 100).toFixed(2) + '%' : '0.00%';

        const comparison = {
            total_excel_symbols: totalExcel,
            total_scanner_symbols: totalScanner,
            intersection,
            excel_only: totalExcel - intersection,
            scanner_only: totalScanner - intersection,
            intersection_percentage: intersectionPct
        };

        const durationMs = this.summary.endTime 
            ? this.summary.scanDurationMs 
            : (this.summary.startTime ? Date.now() - this.summary.startTime.getTime() : 0);

        return {
            validation_date: this.summary.validationDate || 'LIVE',
            is_historical: this.isHistorical,
            total_symbols: this.summary.totalSymbols,
            symbols_processed: this.summary.symbolsProcessed,
            successful_count: this.summary.successfulCount,
            signals_found: this.summary.signalsFound,
            errors: this.summary.errorCount,
            scan_duration: `${(durationMs / 1000).toFixed(1)}s`,
            scan_duration_ms: durationMs,
            comparison,
            validation_csv: this.validationFilePath,
            sample_signals: sampleSignals
        };
    }
}

export const defaultValidationManager = new ValidationManager();
