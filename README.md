# NSE Stock Scanner & Trading Monitor

A production-ready, signal-only NSE stock scanning and monitoring system. It automatically evaluates the entire Chartink reference watchlist against the volume breakout rule and dispatches alerts across Telegram and Webhook channels.

> **IMPORTANT**: This application is **SIGNAL-ONLY**. It contains **ABSOLUTELY NO broker integrations**, no trading credentials, and no automatic order placement/execution capabilities.

---

## 🚀 Key Features

- **Full Watchlist Scanning**: Preloads and monitors all 1,534 symbols from the Chartink reference Excel (`data/Volume break out (3).xlsx`).
- **Exact Chartink Rule**: Evaluates:
  $$\text{Abs}(\text{Daily Open}) > 100 \quad \text{AND} \quad \text{Daily Volume} > \text{12 Months Ago High}$$
- **12-Month Reference High Caching**: Smart 24-hour cache preventing redundant API calls for past historical candles.
- **Historical Validation Engine**: Reproduces past snapshots (e.g. `2026-09-11`) against daily candles and streams comparison results to CSV.
- **Resilient Alert Dispatcher**:
  - **Telegram Bot API**: Instant formatted alert cards with deduplication.
  - **Outbound Webhook**: JSON payloads for custom dashboards/automation.
- **Control Center Dashboard**: Interactive web UI at `http://localhost:3001` with live status, metrics, controls, and equity search.

---

## 📋 Prerequisites & Architecture

- **Node.js**: `v18+` (Tested on Node `v24`)
- **Port 3000**: Upstream `stock-nse-india` service
- **Port 3001**: Main Trading Monitor & Scanner Backend

---

## ⚙️ Installation & Configuration

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` as required:
   ```env
   NSE_API_BASE_URL=http://127.0.0.1:3000
   PORT=3001
   NSE_SCANNER_ENABLED=true
   NSE_SCANNER_INTERVAL_SECONDS=60
   NSE_API_CONCURRENCY=8
   NSE_SCANNER_MAX_SYMBOLS=0

   WATCHLIST_SOURCE=excel
   WATCHLIST_FILE=./data/Volume break out (3).xlsx
   WATCHLIST_SHEET=Watchlist

   # Alerts
   TELEGRAM_ENABLED=false
   TELEGRAM_BOT_TOKEN=
   TELEGRAM_CHAT_ID=

   WEBHOOK_ENABLED=false
   WEBHOOK_URL=
   ```

---

## 🏃 Running the Application

### Step 1: Start Upstream NSE Service
```bash
cd stock-nse-india
npm start
```
*(Runs on `http://127.0.0.1:3000`)*

### Step 2: Start Trading Monitor Backend
```bash
npm start
```
*(Runs on `http://localhost:3001`)*

Open your browser to **`http://localhost:3001`** to access the Control Center.

---

## 🧪 Testing

Run the automated test suite (16 comprehensive suites covering rule logic, boundaries, historical parser, candle date matching, 12M relative date, alert dispatchers, retry backoff, and deduplication):

```bash
npm test
```

---

## 📡 API Reference

### Scanner Controls
- `GET /scanner/status`: System, scanner, watchlist, and alert channel status.
- `POST /scanner/start`: Starts automated recurring scanning.
- `POST /scanner/stop`: Stops scanner (backend stays online).
- `POST /scanner/run-once`: Triggers a single scan across all symbols.
- `GET /scanner/signals`: Returns detected breakout signals.
- `GET /scanner/watchlist`: Returns loaded symbols and count.

### Validation
- `GET /scanner/validation?date=YYYY-MM-DD`: Current or historical validation metrics.
- `POST /scanner/validation/run`: Triggers full historical validation for a specific date (e.g. `2026-09-11`).

### Alert Testing
- `POST /alerts/test/telegram`: Dispatches a test alert to Telegram (if enabled).
- `POST /alerts/test/webhook`: Dispatches a test alert to Webhook (if enabled).

---

## 🚀 Production Deployment (Linux VPS / PM2)

To deploy on a Linux VPS:

1. Install PM2:
   ```bash
   npm install -g pm2
   ```

2. Start processes:
   ```bash
   # In stock-nse-india directory:
   pm2 start build/server.js --name "nse-service"

   # In root project directory:
   pm2 start src/server.js --name "trading-monitor"
   ```

3. Save PM2 configuration to restart on reboot:
   ```bash
   pm2 save
   pm2 startup
   ```
