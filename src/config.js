import dotenv from 'dotenv';
dotenv.config();

export const config = {
    nseApiBaseUrl: process.env.NSE_API_BASE_URL || 'http://127.0.0.1:3000',
    scannerEnabled: process.env.NSE_SCANNER_ENABLED !== 'false',
    scannerIntervalSeconds: parseInt(process.env.NSE_SCANNER_INTERVAL_SECONDS || '60', 10),
    concurrency: parseInt(process.env.NSE_API_CONCURRENCY || '8', 10),
    timeoutSeconds: parseInt(process.env.NSE_API_TIMEOUT_SECONDS || '20', 10),
    maxSymbols: parseInt(process.env.NSE_SCANNER_MAX_SYMBOLS || '0', 10), // 0 means unlimited
    watchlistSource: process.env.WATCHLIST_SOURCE || 'excel',
    watchlistFile: process.env.WATCHLIST_FILE || './data/Volume break out (3).xlsx',
    watchlistSheet: process.env.WATCHLIST_SHEET || 'Watchlist',
    port: parseInt(process.env.PORT || '3001', 10),

    // Alert Channels
    telegramEnabled: process.env.TELEGRAM_ENABLED === 'true',
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '',

    webhookEnabled: process.env.WEBHOOK_ENABLED === 'true',
    webhookUrl: process.env.WEBHOOK_URL || ''
};

