function formatINR(val) {
    if (val === undefined || val === null || isNaN(val)) return '₹0.00';
    return '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQty(val) {
    if (val === undefined || val === null || isNaN(val)) return '0';
    return Number(val).toLocaleString('en-IN');
}

// ----------------------------------------------------
// SCANNER STATUS & CONTROL
// ----------------------------------------------------

async function fetchScannerStatus() {
    try {
        const res = await fetch('/scanner/status');
        const data = await res.json();

        document.getElementById('scanner-status-val').innerText = data.running ? (data.is_scanning ? 'SCANNING...' : 'ACTIVE') : 'STOPPED';
        document.getElementById('scanner-status-val').style.color = data.running ? '#10b981' : '#f43f5e';

        document.getElementById('scanner-market-val').innerText = data.market_status || 'UNKNOWN';
        document.getElementById('scanner-symbols-val').innerText = data.symbols_scanned || 0;
        document.getElementById('scanner-signals-val').innerText = data.signals_found || 0;

        if (data.watchlist) {
            document.getElementById('scanner-source-val').innerText = data.watchlist.source || 'Excel';
            document.getElementById('scanner-loaded-val').innerText = data.watchlist.count || 0;
        }

        document.getElementById('scanner-last-scan').innerText = data.last_scan_at ? new Date(data.last_scan_at).toLocaleTimeString() : 'Never';
        document.getElementById('scanner-next-scan').innerText = data.next_scan_at ? new Date(data.next_scan_at).toLocaleTimeString() : 'Manual / Off';

        const errBanner = document.getElementById('scanner-error-banner');
        if (data.last_error) {
            errBanner.innerText = `⚠️ Last Error: ${data.last_error}`;
            errBanner.style.display = 'block';
        } else {
            errBanner.style.display = 'none';
        }

        // Render Alert Channels
        if (data.alert_channels) {
            const tgTag = document.getElementById('tg-tag');
            if (tgTag) {
                const tg = data.alert_channels.telegram;
                tgTag.innerText = `Telegram: ${tg.status}`;
                tgTag.className = `channel-tag ${tg.status === 'CONNECTED' ? 'configured' : 'not-configured'}`;
            }

            const whTag = document.getElementById('wh-tag');
            if (whTag) {
                const wh = data.alert_channels.webhook;
                whTag.innerText = `Webhook: ${wh.status}`;
                whTag.className = `channel-tag ${wh.status === 'CONNECTED' ? 'configured' : 'not-configured'}`;
            }
        }


        // Pulse
        const statusPulse = document.getElementById('status-pulse');
        const statusText = document.getElementById('market-status-text');
        statusText.innerText = `Market: ${data.market_status || 'Checking...'}`;
        if (data.market_status === 'Open') {
            statusPulse.className = 'pulse-indicator';
        } else {
            statusPulse.className = 'pulse-indicator closed';
        }
    } catch (err) {
        console.error('Failed to fetch scanner status:', err);
    }
}

async function startScanner() {
    const btn = document.getElementById('start-btn');
    btn.disabled = true;
    try {
        await fetch('/scanner/start', { method: 'POST' });
        await fetchScannerStatus();
    } catch (e) {
        alert('Failed to start scanner');
    } finally {
        btn.disabled = false;
    }
}

async function stopScanner() {
    const btn = document.getElementById('stop-btn');
    btn.disabled = true;
    try {
        await fetch('/scanner/stop', { method: 'POST' });
        await fetchScannerStatus();
    } catch (e) {
        alert('Failed to stop scanner');
    } finally {
        btn.disabled = false;
    }
}

async function runOnce() {
    const btn = document.getElementById('run-once-btn');
    btn.innerText = '⚡ SCANNING...';
    btn.disabled = true;
    try {
        await fetch('/scanner/run-once', { method: 'POST' });
        await fetchScannerStatus();
        await fetchSignals();
    } catch (e) {
        alert('Manual scan failed');
    } finally {
        btn.innerText = '⚡ RUN ONCE';
        btn.disabled = false;
    }
}

// ----------------------------------------------------
// SIGNALS TABLE
// ----------------------------------------------------

async function fetchSignals() {
    try {
        const res = await fetch('/scanner/signals');
        const data = await res.json();
        const tbody = document.getElementById('signals-tbody');

        if (data.success && data.signals && data.signals.length > 0) {
            tbody.innerHTML = data.signals.map(s => `
                <tr>
                    <td class="ticker"><strong>${s.symbol}</strong></td>
                    <td>${s.stock_name}</td>
                    <td>${formatINR(s.daily_open)}</td>
                    <td style="color: #10b981; font-weight: 600;">${formatQty(s.current_or_daily_volume)}</td>
                    <td>${formatINR(s.reference_high)}</td>
                    <td><span class="badge">${s.rule_name}</span></td>
                    <td style="color: #94a3b8;">${new Date(s.timestamp).toLocaleTimeString()}</td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No breakout signals generated yet. Click "RUN ONCE" or "START" to scan.</td></tr>`;
        }
    } catch (e) {
        console.error('Failed to fetch signals:', e);
    }
}

// ----------------------------------------------------
// STOCK LOOKUP
// ----------------------------------------------------

async function fetchQuote(symbol) {
    if (!symbol) return;
    const quoteContainer = document.getElementById('quote-display');
    const searchBtn = document.getElementById('search-btn');

    searchBtn.innerText = 'Fetching...';
    searchBtn.disabled = true;

    try {
        const res = await fetch(`/api/equity/${encodeURIComponent(symbol)}`);
        const data = await res.json();

        if (!data.success) {
            alert(`Stock "${symbol}" not found or NSE API unreachable.`);
            return;
        }

        const eq = data.data;
        const info = eq.info || {};
        const priceInfo = eq.priceInfo || {};

        document.getElementById('stock-name').innerText = info.companyName || symbol;
        document.getElementById('stock-symbol').innerText = symbol.toUpperCase();
        document.getElementById('stock-industry').innerText = info.industry || 'Equity';

        document.getElementById('stock-price').innerText = formatINR(priceInfo.lastPrice);
        document.getElementById('stock-open').innerText = formatINR(priceInfo.open);
        document.getElementById('stock-volume').innerText = formatQty(priceInfo.totalTradedVolume || 0);

        const changeElem = document.getElementById('stock-change');
        const pChange = priceInfo.pChange ?? 0;
        const sign = pChange > 0 ? '+' : '';
        changeElem.innerText = `${sign}${Number(pChange).toFixed(2)}%`;
        changeElem.className = `price-change ${pChange >= 0 ? 'positive' : 'negative'}`;

        document.getElementById('day-range').innerText = `${formatINR(priceInfo.intraDayHighLow?.min)} - ${formatINR(priceInfo.intraDayHighLow?.max)}`;
        document.getElementById('year-range').innerText = `${formatINR(priceInfo.weekHighLow?.min)} - ${formatINR(priceInfo.weekHighLow?.max)}`;

        quoteContainer.style.display = 'block';
    } catch (err) {
        alert('Failed to fetch quote.');
    } finally {
        searchBtn.innerText = 'Check Quote';
        searchBtn.disabled = false;
    }
}

// Search Form
document.getElementById('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const symbol = document.getElementById('symbol-input').value.trim();
    if (symbol) fetchQuote(symbol);
});

// Periodic Poll
setInterval(fetchScannerStatus, 5000);
fetchScannerStatus();
fetchSignals();
