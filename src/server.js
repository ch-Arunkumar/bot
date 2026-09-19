import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { defaultScanner } from './scannerService.js';
import { defaultSignalManager } from './signalManager.js';
import { defaultWatchlist } from './watchlistService.js';
import { defaultNseClient } from './nseApiClient.js';
import { defaultAlertDispatcher } from './alertDispatcher.js';
import { defaultValidationManager } from './validationManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = config.port || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ----------------------------------------------------
// SCANNER CONTROL ENDPOINTS
// ----------------------------------------------------

/**
 * GET /scanner/status
 */
app.get('/scanner/status', (req, res) => {
    const status = defaultScanner.getStatus();
    const channels = defaultAlertDispatcher.getChannels();
    const watchlistStats = defaultWatchlist.getStats();
    res.json({
        ...status,
        watchlist: watchlistStats,
        alert_channels: channels
    });
});

/**
 * POST /scanner/start
 */
app.post('/scanner/start', (req, res) => {
    defaultScanner.start();
    res.json({
        success: true,
        message: 'Scanner started successfully',
        status: defaultScanner.getStatus()
    });
});

/**
 * POST /scanner/stop
 */
app.post('/scanner/stop', (req, res) => {
    defaultScanner.stop();
    res.json({
        success: true,
        message: 'Scanner stopped successfully (Backend remains online)',
        status: defaultScanner.getStatus()
    });
});

/**
 * POST /scanner/run-once
 */
app.post('/scanner/run-once', async (req, res) => {
    // Run scan asynchronously or synchronously based on query
    const asyncMode = req.query.async === 'true';
    if (asyncMode) {
        defaultScanner.runScan();
        return res.json({
            success: true,
            message: 'Manual scan triggered in background',
            status: defaultScanner.getStatus()
        });
    }

    await defaultScanner.runScan();
    res.json({
        success: true,
        message: 'Manual scan completed',
        status: defaultScanner.getStatus()
    });
});

// ----------------------------------------------------
// VALIDATION & SIGNALS ENDPOINTS
// ----------------------------------------------------

/**
 * GET /scanner/validation?date=YYYY-MM-DD
 */
app.get('/scanner/validation', async (req, res) => {
    const { date } = req.query;
    if (date) {
        // Run historical validation if date specified and not already done
        const summary = await defaultScanner.runHistoricalValidation(date);
        return res.json({
            success: true,
            ...summary
        });
    }

    const summary = defaultValidationManager.getSummary();
    res.json({
        success: true,
        ...summary
    });
});

/**
 * POST /scanner/validation/run
 * Body: { "date": "YYYY-MM-DD" }
 */
app.post('/scanner/validation/run', async (req, res) => {
    const targetDate = req.body?.date || req.query?.date || '2026-09-11';
    const asyncMode = req.query?.async === 'true';

    if (asyncMode) {
        defaultScanner.runHistoricalValidation(targetDate).catch(err => {
            console.error('Validation run error:', err);
        });
        return res.json({
            success: true,
            message: `Historical validation started in background for ${targetDate}`,
            target_date: targetDate
        });
    }

    try {
        const summary = await defaultScanner.runHistoricalValidation(targetDate);
        res.json({
            success: true,
            target_date: targetDate,
            ...summary
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

/**
 * GET /scanner/signals
 */
app.get('/scanner/signals', (req, res) => {
    res.json({
        success: true,
        count: defaultSignalManager.getSignals().length,
        signals: defaultSignalManager.getSignals()
    });
});

/**
 * GET /scanner/watchlist
 */
app.get('/scanner/watchlist', (req, res) => {
    const symbols = defaultWatchlist.getSymbols();
    res.json({
        success: true,
        count: symbols.length,
        symbols
    });
});

/**
 * POST /scanner/watchlist
 */
app.post('/scanner/watchlist', (req, res) => {
    const { symbols } = req.body;
    if (Array.isArray(symbols)) {
        defaultWatchlist.setSymbols(symbols);
        return res.json({
            success: true,
            count: defaultWatchlist.getSymbols().length,
            message: 'Watchlist updated successfully'
        });
    }
    res.status(400).json({ success: false, error: 'Symbols must be an array' });
});


// ----------------------------------------------------
// ALERT TEST ENDPOINTS
// ----------------------------------------------------


/**
 * POST /alerts/test/telegram
 */
app.post('/alerts/test/telegram', async (req, res) => {
    const channels = defaultAlertDispatcher.getChannels();
    if (!channels.telegram.enabled) {
        return res.status(400).json({
            success: false,
            message: 'Telegram integration is disabled or NOT CONFIGURED in .env'
        });
    }

    const testSignal = {
        symbol: 'TEST_STOCK',
        stock_name: 'Test Stock Alert Verification',
        daily_open: 1250,
        current_or_daily_volume: 5000000,
        reference_high: 1200,
        rule_name: 'VOLUME_BREAKOUT_TEST',
        timestamp: new Date().toISOString()
    };

    const result = await defaultAlertDispatcher.sendTelegramAlert(testSignal);
    if (result.sent) {
        res.json({ success: true, message: 'Telegram test alert delivered successfully' });
    } else {
        res.status(502).json({ success: false, error: result.error || result.reason });
    }
});

/**
 * POST /alerts/test/webhook
 */
app.post('/alerts/test/webhook', async (req, res) => {
    const channels = defaultAlertDispatcher.getChannels();
    if (!channels.webhook.enabled) {
        return res.status(400).json({
            success: false,
            message: 'Webhook integration is disabled or NOT CONFIGURED in .env'
        });
    }

    const testSignal = {
        symbol: 'TEST_STOCK',
        stock_name: 'Test Stock Alert Verification',
        daily_open: 1250,
        current_or_daily_volume: 5000000,
        reference_high: 1200,
        rule_name: 'VOLUME_BREAKOUT_TEST',
        timestamp: new Date().toISOString()
    };

    const result = await defaultAlertDispatcher.sendWebhookAlert(testSignal);
    if (result.sent) {
        res.json({ success: true, message: 'Webhook test alert delivered successfully', status: result.status });
    } else {
        res.status(502).json({ success: false, error: result.error || result.reason });
    }
});


// ----------------------------------------------------
// DIRECT NSE DATA PASSTHROUGH (from local NSE service)
// ----------------------------------------------------

app.get('/api/marketStatus', async (req, res) => {
    const result = await defaultNseClient.getMarketStatus();
    res.json(result);
});

app.get('/api/equity/:symbol', async (req, res) => {
    const result = await defaultNseClient.getEquity(req.params.symbol);
    res.json(result);
});

app.get('/api/equity/historical/:symbol', async (req, res) => {
    const { symbol } = req.params;
    const { dateStart, dateEnd } = req.query;
    const result = await defaultNseClient.getHistoricalData(symbol, dateStart, dateEnd);
    res.json(result);
});

// Start Server
app.listen(PORT, async () => {
    console.log(`\n======================================================`);
    console.log(`🚀 NSE TRADING MONITOR & SCANNER SERVER ONLINE`);
    console.log(`🌐 Port: ${PORT} (Connecting to NSE API: ${config.nseApiBaseUrl})`);
    console.log(`======================================================`);
    console.log(`📡 Scanner Control Endpoints:`);
    console.log(`   - GET  http://localhost:${PORT}/scanner/status`);
    console.log(`   - POST http://localhost:${PORT}/scanner/start`);
    console.log(`   - POST http://localhost:${PORT}/scanner/stop`);
    console.log(`   - POST http://localhost:${PORT}/scanner/run-once`);
    console.log(`   - GET  http://localhost:${PORT}/scanner/signals`);
    console.log(`   - GET  http://localhost:${PORT}/scanner/watchlist`);
    console.log(`======================================================\n`);

    // Preload watchlist & market status
    await defaultWatchlist.loadWatchlist();
    await defaultScanner.updateMarketStatus();

    // Auto-start scanner if enabled and market is open
    if (config.scannerEnabled) {
        defaultScanner.start();
    }
});
