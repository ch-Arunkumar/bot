import axios from 'axios';
import { config } from './config.js';

export class AlertDispatcher {
    constructor(cfg = config) {
        this.config = cfg;
        this.timeoutMs = 10000; // 10s timeout
    }

    getChannels() {
        const tgEnabled = !!this.config.telegramEnabled;
        const tgHasCreds = !!(this.config.telegramBotToken && this.config.telegramChatId);
        let tgStatus = 'NOT_CONFIGURED';
        if (tgEnabled && tgHasCreds) tgStatus = 'CONNECTED';
        else if (tgEnabled && !tgHasCreds) tgStatus = 'CONFIG_MISSING';
        else tgStatus = 'DISABLED';

        const whEnabled = !!this.config.webhookEnabled;
        const whHasUrl = !!this.config.webhookUrl;
        let whStatus = 'NOT_CONFIGURED';
        if (whEnabled && whHasUrl) whStatus = 'CONNECTED';
        else if (whEnabled && !whHasUrl) whStatus = 'CONFIG_MISSING';
        else whStatus = 'DISABLED';

        return {
            telegram: {
                enabled: tgEnabled,
                status: tgStatus
            },
            webhook: {
                enabled: whEnabled,
                status: whStatus
            },
            whatsapp: {
                enabled: false,
                status: 'NOT_INCLUDED'
            },
            android: {
                enabled: false,
                status: 'NOT_INCLUDED'
            }
        };
    }

    formatTelegramMessage(signal) {
        return (
            `🚨 *TRADING SIGNAL*\n\n` +
            `*Symbol:* \`${signal.symbol}\`\n` +
            `*Stock:* ${signal.stock_name || signal.symbol}\n` +
            `*Daily Open:* ₹${signal.daily_open}\n` +
            `*Daily Volume:* ${Number(signal.current_or_daily_volume).toLocaleString('en-IN')}\n` +
            `*12M Ago High:* ₹${signal.reference_high}\n` +
            `*Rule:* ${signal.rule_name || 'VOLUME_BREAKOUT'}\n` +
            `*Signal Time:* ${signal.timestamp || new Date().toISOString()}`
        );
    }

    async sendTelegramAlert(signal) {
        if (!this.config.telegramEnabled) return { sent: false, reason: 'DISABLED' };
        if (!this.config.telegramBotToken || !this.config.telegramChatId) {
            console.warn('⚠️ [ALERT] Telegram is enabled but TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing');
            return { sent: false, reason: 'MISSING_CREDENTIALS' };
        }

        const text = this.formatTelegramMessage(signal);
        const url = `https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`;

        try {
            const res = await axios.post(
                url,
                {
                    chat_id: this.config.telegramChatId,
                    text: text,
                    parse_mode: 'Markdown'
                },
                { timeout: this.timeoutMs }
            );

            if (res.data && res.data.ok) {
                console.log(`📨 [TELEGRAM] Alert sent successfully for ${signal.symbol}`);
                return { sent: true };
            } else {
                console.error(`❌ [TELEGRAM ERROR] Telegram API error for ${signal.symbol}:`, res.data?.description || 'Unknown error');
                return { sent: false, error: res.data?.description };
            }
        } catch (err) {
            console.error(`❌ [TELEGRAM ERROR] Failed to send Telegram alert for ${signal.symbol}: ${err.message}`);
            return { sent: false, error: err.message };
        }
    }

    async sendWebhookAlert(signal) {
        if (!this.config.webhookEnabled) return { sent: false, reason: 'DISABLED' };
        if (!this.config.webhookUrl) {
            console.warn('⚠️ [ALERT] Webhook is enabled but WEBHOOK_URL is missing');
            return { sent: false, reason: 'MISSING_URL' };
        }

        // Validate webhook URL
        try {
            const parsed = new URL(this.config.webhookUrl);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                throw new Error('Invalid protocol, must be http or https');
            }
        } catch (urlErr) {
            console.error(`❌ [WEBHOOK ERROR] Invalid WEBHOOK_URL: ${urlErr.message}`);
            return { sent: false, error: 'Invalid WEBHOOK_URL' };
        }

        const payload = {
            type: 'trading_signal',
            symbol: signal.symbol,
            stock_name: signal.stock_name || signal.symbol,
            daily_open: signal.daily_open,
            daily_volume: signal.current_or_daily_volume,
            twelve_months_ago_high: signal.reference_high,
            rule_name: signal.rule_name || 'VOLUME_BREAKOUT',
            timestamp: signal.timestamp || new Date().toISOString()
        };

        try {
            const res = await axios.post(this.config.webhookUrl, payload, {
                timeout: this.timeoutMs,
                headers: { 'Content-Type': 'application/json' }
            });

            if (res.status >= 200 && res.status < 300) {
                console.log(`📡 [WEBHOOK] Alert sent successfully to webhook for ${signal.symbol} (HTTP ${res.status})`);
                return { sent: true, status: res.status };
            } else {
                console.error(`❌ [WEBHOOK ERROR] Unexpected status ${res.status} for ${signal.symbol}`);
                return { sent: false, status: res.status };
            }
        } catch (err) {
            console.error(`❌ [WEBHOOK ERROR] Failed to send webhook alert for ${signal.symbol}: ${err.message}`);
            return { sent: false, error: err.message };
        }
    }

    async dispatch(signal) {
        if (!signal) return;

        console.log(`\n🔔 [SIGNAL ALERT] ${signal.rule_name} triggered for ${signal.symbol} (${signal.stock_name})`);
        console.log(`   • Open: ₹${signal.daily_open} | Volume: ${Number(signal.current_or_daily_volume).toLocaleString('en-IN')} | 12M Ago High: ₹${signal.reference_high}`);

        // Dispatch independently without failing the scanner
        const promises = [];
        if (this.config.telegramEnabled) {
            promises.push(this.sendTelegramAlert(signal).catch(e => ({ sent: false, error: e.message })));
        }
        if (this.config.webhookEnabled) {
            promises.push(this.sendWebhookAlert(signal).catch(e => ({ sent: false, error: e.message })));
        }

        await Promise.allSettled(promises);
    }
}

export const defaultAlertDispatcher = new AlertDispatcher();

